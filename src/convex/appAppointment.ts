// ============================================================================
// AarogyaLink — Health Worker appointment booking (server-authoritative)
// ----------------------------------------------------------------------------
// A Health Worker can book a hospital appointment ON BEHALF OF a registered
// patient. Everything that decides whether that is allowed happens here, from
// STORED data only:
//
//   • the caller holds an authenticated session binding (careAuthz.ts);
//   • only a Health Worker (or the hospital administrator) may book for a
//     patient — a patient may book for themselves and nobody else;
//   • the patient must already exist in the caller's authorized set (their own
//     register, a referral, an earlier appointment, or a scanned Health Card),
//     so a Patient ID is not a password and no duplicate patient is created;
//   • the hospital must be inside the caller's district (or be the destination
//     of the patient's referral), and the doctor must practise AT that hospital;
//   • the date and time are validated against the doctor's configured
//     availability and the appointments already stored;
//   • the slot is reserved by the transaction that writes the row, so two
//     simultaneous requests cannot both take it (Convex mutations are
//     serializable);
//   • the booking records the STORED identity of the health worker as the
//     person who booked it, while the patient stays the person receiving care.
//
// Booking a referral-linked appointment does NOT advance the referral: arrival
// and treatment remain the receiving hospital's own workflow steps.
// ============================================================================

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Appointment, AppointmentStatus, Patient } from '../types';
import { payloadFits } from './authz';
import {
  authorizedPatientsFor,
  isRecord,
  readItems,
  requireBinding,
  str,
  writeItems,
  type CareBinding,
  type Ctx,
} from './careAuthz';
import { findPatientByCode, normalizePatientCode } from '../lib/patient-record';
import {
  MAX_REASON_LENGTH,
  SUGGESTED_DATES_PER_DOCTOR,
  appointmentHistoryEntry,
  appointmentRights,
  isDoctorAvailableOn,
  nextAppointmentReference,
  nextAvailableDates,
  normalizeTime,
  slotsForDoctor,
  todayIso,
  validateBookingRequest,
  dateParts,
  type AppointmentActor,
  type BookingError,
} from '../lib/appointment-booking';
import { isTerminalStatus } from './referralStatus';

/** Roles that may book on a patient's behalf. */
const BOOKING_ROLES = new Set(['health_worker', 'hospital_admin', 'overall_admin']);

/** Roles that may open the booking workflow (patients book for themselves). */
const VIEW_ROLES = new Set(['health_worker', 'hospital_admin', 'overall_admin', 'patient']);

type AppointmentRecord = Appointment & Record<string, unknown>;

function asAppointment(record: unknown): AppointmentRecord | null {
  return isRecord(record) && str(record.id) ? (record as AppointmentRecord) : null;
}

function hospitalActive(record: Record<string, unknown>): boolean {
  const status = str(record.status);
  return !status || status === 'active';
}

function hospitalInBindingDistrict(hospital: Record<string, unknown>, binding: CareBinding): boolean {
  const own = str(hospital.districtId);
  if (own) return !!binding.districtId && own === binding.districtId;
  return !!binding.districtName && str(hospital.district) === binding.districtName;
}

/**
 * May this caller book into / look at this hospital's doctors?
 *
 *   overall administrator — any hospital;
 *   patient               — any hospital (the existing patient booking rule);
 *   district / hospital   — only hospitals in their own district;
 *   any of them           — plus the destination hospital of the patient's own
 *                           referral (the explicit cross-district exception the
 *                           referral workflow already uses).
 */
function hospitalAllowed(
  hospital: Record<string, unknown>,
  binding: CareBinding,
  referralHospitalIds: Set<string>,
): boolean {
  const id = str(hospital.id);
  if (!id) return false;
  if (binding.role === 'overall_admin' || binding.role === 'patient') return true;
  if (binding.role === 'gov_admin') return hospitalInBindingDistrict(hospital, binding);
  return hospitalInBindingDistrict(hospital, binding) || referralHospitalIds.has(id);
}

/** Patient ids resolved from a Patient ID / Health Card ID for this caller. */
async function authorizedPatientByCode(
  ctx: Ctx,
  binding: CareBinding,
  code: string | undefined,
): Promise<Patient | null> {
  const value = (code ?? '').trim();
  if (!value) return null;
  const patients = (await readItems(ctx, 'patients'))
    .map(record => (isRecord(record) && str(record.id) ? (record as unknown as Patient) : null))
    .filter((patient): patient is Patient => patient !== null);
  const match = findPatientByCode(patients, normalizePatientCode(value));
  if (!match) return null;

  if (binding.role === 'overall_admin') return match;
  if (binding.role === 'patient') return binding.patientId === match.id ? match : null;
  const authorized = await authorizedPatientsFor(ctx, binding);
  return authorized.has(match.id) ? match : null;
}

/** Hospital ids the patient's referrals point at (the only cross-district door). */
async function referralHospitalIdsForPatient(
  ctx: Ctx,
  binding: CareBinding,
  patient: Patient | null,
): Promise<{ ids: Set<string>; referrals: Record<string, unknown>[] }> {
  const ids = new Set<string>();
  if (!patient) return { ids, referrals: [] };
  const referrals = (await readItems(ctx, 'referrals')).filter(
    (record): record is Record<string, unknown> =>
      isRecord(record) && str(record.patientId) === patient.id,
  );
  for (const referral of referrals) {
    // A referral is a care relationship, not an arrival: linking an appointment
    // to it does not change its status (see bookAppointmentForPatient).
    const destination = str(referral.destinationFacilityId);
    const source = str(referral.sourceFacilityId);
    if (destination) ids.add(destination);
    if (source) ids.add(source);
  }
  return { ids, referrals };
}

function doctorSummary(
  record: Record<string, unknown>,
  today: string,
): {
  id: string;
  userId?: string;
  name: string;
  specialization: string;
  department: string;
  qualification?: string;
  experience?: number;
  availableDays: string[];
  consultationFee?: number;
  rating?: number;
  nextAvailableDates: string[];
} | null {
  const id = str(record.id);
  if (!id) return null;
  const days = Array.isArray(record.availableDays)
    ? record.availableDays.filter((day): day is string => typeof day === 'string')
    : [];
  const specialization = str(record.specialization) ?? 'General Medicine';
  return {
    id,
    userId: str(record.userId),
    name: str(record.name) ?? 'Doctor',
    specialization,
    department: specialization,
    qualification: str(record.qualification),
    experience: typeof record.experience === 'number' ? record.experience : undefined,
    availableDays: days,
    consultationFee: typeof record.consultationFee === 'number' ? record.consultationFee : undefined,
    rating: typeof record.rating === 'number' ? record.rating : undefined,
    nextAvailableDates: nextAvailableDates(
      { availableDays: days },
      today,
      { limit: SUGGESTED_DATES_PER_DOCTOR },
    ),
  };
}

/** The stored identity of the caller, used for every audit field. */
function actorOf(binding: CareBinding): AppointmentActor {
  return {
    userId: binding.staffUserId ?? binding.username,
    name: binding.name || binding.username || 'Health Worker',
    role: binding.role,
    hospitalId: binding.hospitalId,
  };
}

/** Add a patient notification (same collection the app already renders). */
async function appendPatientNotification(
  ctx: Parameters<typeof writeItems>[0],
  patientId: string,
  title: string,
  message: string,
  actionUrl: string,
): Promise<void> {
  const notifications = await readItems(ctx, 'notifications');
  const record = {
    id: `notif-apt-${patientId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: `u-${patientId}`,
    title,
    message,
    type: 'success',
    read: false,
    createdAt: new Date().toISOString(),
    actionUrl,
  };
  const next = [...notifications, record];
  if (payloadFits('1', next)) await writeItems(ctx, 'notifications', next);
}

/** Resolve the doctor record id behind a doctor-role session binding. */
async function doctorRecordIdFor(ctx: Ctx, binding: CareBinding): Promise<string | undefined> {
  if (binding.role !== 'doctor' || !binding.staffUserId) return undefined;
  const doctors = await readItems(ctx, 'doctors');
  const match = doctors.find(
    record =>
      isRecord(record) &&
      (str(record.userId) === binding.staffUserId || str(record.id) === binding.staffUserId),
  );
  return isRecord(match) ? str(match.id) : undefined;
}

// ── Queries ───────────────────────────────────────────────────────

/**
 * Hospitals the caller may book into. Never the whole platform for a health
 * worker: their own district, plus the destination hospital of the patient's
 * referral when a patient is passed in.
 */
export const bookingHospitals = query({
  args: { patientCode: v.optional(v.string()) },
  handler: async (ctx, { patientCode }) => {
    const binding = await requireBinding(ctx);
    if (!VIEW_ROLES.has(binding.role)) {
      return { ok: false as const, hospitals: [], message: 'Unauthorized: your role cannot book appointments.' };
    }

    const patient = await authorizedPatientByCode(ctx, binding, patientCode);
    const referralIds = (await referralHospitalIdsForPatient(ctx, binding, patient)).ids;
    const [hospitalRecords, doctorRecords] = await Promise.all([
      readItems(ctx, 'hospitals'),
      readItems(ctx, 'doctors'),
    ]);
    const doctorsPerHospital = new Map<string, number>();
    for (const doctor of doctorRecords) {
      if (!isRecord(doctor)) continue;
      const facility = str(doctor.facilityId);
      if (facility) doctorsPerHospital.set(facility, (doctorsPerHospital.get(facility) ?? 0) + 1);
    }

    const hospitals = hospitalRecords
      .filter((record): record is Record<string, unknown> => isRecord(record) && !!str(record.id))
      .filter(hospitalActive)
      .filter(hospital => hospitalAllowed(hospital, binding, referralIds))
      .map(hospital => {
        const id = str(hospital.id) as string;
        return {
          id,
          name: str(hospital.name) ?? 'Hospital',
          hospitalId: str(hospital.hospitalId),
          district: str(hospital.districtName) ?? str(hospital.district) ?? '',
          type: str(hospital.type),
          departments: Array.isArray(hospital.departments)
            ? hospital.departments.filter((item): item is string => typeof item === 'string')
            : [],
          doctorCount: doctorsPerHospital.get(id) ?? 0,
          referralDestination: referralIds.has(id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true as const,
      hospitals,
      message: hospitals.length === 0
        ? 'No hospital is available for booking in your authorized district.'
        : `${hospitals.length} hospital${hospitals.length === 1 ? '' : 's'} available.`,
    };
  },
});

/**
 * Every eligible doctor at the selected hospital, with their consulting days
 * and next genuinely available dates. A doctor from another hospital can never
 * appear here: the stored `facilityId` is the only link used.
 */
export const hospitalDoctors = query({
  args: { hospitalId: v.string(), patientCode: v.optional(v.string()) },
  handler: async (ctx, { hospitalId, patientCode }) => {
    const binding = await requireBinding(ctx);
    if (!VIEW_ROLES.has(binding.role)) {
      return { ok: false as const, doctors: [], message: 'Unauthorized: your role cannot book appointments.' };
    }
    const hospitals = await readItems(ctx, 'hospitals');
    const hospital = hospitals.find(record => isRecord(record) && str(record.id) === hospitalId);
    if (!isRecord(hospital)) {
      return { ok: false as const, doctors: [], message: 'Hospital not found.' };
    }
    const patient = await authorizedPatientByCode(ctx, binding, patientCode);
    const referralIds = (await referralHospitalIdsForPatient(ctx, binding, patient)).ids;
    if (!hospitalAllowed(hospital, binding, referralIds)) {
      return {
        ok: false as const,
        doctors: [],
        message: 'Unauthorized: this hospital is outside your authorized district.',
      };
    }
    if (!hospitalActive(hospital)) {
      return { ok: false as const, doctors: [], message: 'This hospital is not accepting appointments.' };
    }

    const today = todayIso();
    const doctors = (await readItems(ctx, 'doctors'))
      .filter(record => isRecord(record) && str(record.facilityId) === hospitalId)
      .map(record => doctorSummary(record as Record<string, unknown>, today))
      .filter((doctor): doctor is NonNullable<typeof doctor> => doctor !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true as const,
      hospital: {
        id: hospitalId,
        name: str(hospital.name) ?? 'Hospital',
        district: str(hospital.districtName) ?? str(hospital.district) ?? '',
      },
      doctors,
      message: doctors.length === 0
        ? 'No doctor is currently available at this hospital. Choose another hospital.'
        : `${doctors.length} doctor${doctors.length === 1 ? '' : 's'} available.`,
    };
  },
});

/**
 * The real slot grid for one doctor and one date: free / taken, with the
 * appointment holding a taken slot. Nothing is invented and nothing is hidden.
 */
export const availableSlots = query({
  args: {
    hospitalId: v.string(),
    doctorId: v.string(),
    date: v.string(),
    patientCode: v.optional(v.string()),
  },
  handler: async (ctx, { hospitalId, doctorId, date, patientCode }) => {
    const binding = await requireBinding(ctx);
    if (!VIEW_ROLES.has(binding.role)) {
      return { ok: false as const, slots: [], doctorAvailable: false, message: 'Unauthorized: your role cannot book appointments.' };
    }
    const today = todayIso();
    if (!dateParts(date)) {
      return { ok: false as const, slots: [], doctorAvailable: false, message: 'Choose a valid appointment date.' };
    }
    if (date < today) {
      return { ok: false as const, slots: [], doctorAvailable: false, message: 'The appointment date cannot be in the past.' };
    }

    const [hospitals, doctors, appointments] = await Promise.all([
      readItems(ctx, 'hospitals'),
      readItems(ctx, 'doctors'),
      readItems(ctx, 'appointments'),
    ]);
    const hospital = hospitals.find(record => isRecord(record) && str(record.id) === hospitalId);
    const doctor = doctors.find(record => isRecord(record) && str(record.id) === doctorId);
    if (!isRecord(hospital) || !isRecord(doctor)) {
      return { ok: false as const, slots: [], doctorAvailable: false, message: 'Hospital or doctor not found.' };
    }
    const patient = await authorizedPatientByCode(ctx, binding, patientCode);
    const referralIds = (await referralHospitalIdsForPatient(ctx, binding, patient)).ids;
    if (!hospitalAllowed(hospital, binding, referralIds)) {
      return {
        ok: false as const,
        slots: [],
        doctorAvailable: false,
        message: 'Unauthorized: this hospital is outside your authorized district.',
      };
    }
    if (str(doctor.facilityId) !== hospitalId) {
      return {
        ok: false as const,
        slots: [],
        doctorAvailable: false,
        message: 'The selected doctor does not practise at this hospital.',
      };
    }

    const availableDays = Array.isArray(doctor.availableDays)
      ? (doctor.availableDays.filter((day): day is string => typeof day === 'string') as string[])
      : [];
    const doctorAvailable = isDoctorAvailableOn({ availableDays }, date);
    const stored = appointments
      .map(asAppointment)
      .filter((appointment): appointment is AppointmentRecord => appointment !== null);

    return {
      ok: true as const,
      doctorAvailable,
      slots: slotsForDoctor(doctorId, date, stored),
      availableDates: nextAvailableDates({ availableDays }, today, { limit: SUGGESTED_DATES_PER_DOCTOR }),
      message: doctorAvailable
        ? undefined
        : 'This doctor does not consult on the selected date.',
    };
  },
});

/**
 * Appointments this staff member booked, newest first, with the linked
 * referral's current status where there is one. The booking is visible to its
 * creator even when the hospital is in another part of the district, which the
 * hospital-scoped collection read would not include.
 */
export const appointmentsBookedByMe = query({
  args: {},
  handler: async (ctx) => {
    const binding = await requireBinding(ctx);
    const userId = binding.staffUserId ?? binding.username;
    if (!userId || binding.role === 'patient') {
      return { ok: false as const, appointments: [], message: 'Only staff book appointments for patients.' };
    }
    const [appointmentRecords, referralRecords, patientRecords] = await Promise.all([
      readItems(ctx, 'appointments'),
      readItems(ctx, 'referrals'),
      readItems(ctx, 'patients'),
    ]);
    const referralsById = new Map<string, Record<string, unknown>>();
    for (const referral of referralRecords) {
      if (isRecord(referral) && str(referral.id)) referralsById.set(str(referral.id) as string, referral);
    }
    const patientNames = new Map<string, string>();
    for (const patient of patientRecords) {
      if (isRecord(patient) && str(patient.id)) patientNames.set(str(patient.id) as string, str(patient.name) ?? '');
    }

    const appointments = appointmentRecords
      .map(asAppointment)
      .filter((appointment): appointment is AppointmentRecord => appointment !== null)
      .filter(appointment => appointment.bookedByUserId === userId)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 100)
      .map(appointment => {
        const referral = appointment.referralId ? referralsById.get(appointment.referralId) : undefined;
        return {
          ...appointment,
          patientName: appointment.patientName || patientNames.get(appointment.patientId) || 'Patient',
          referralStatus: referral ? str(referral.status) : undefined,
          referralStatusLabel: referral ? str(referral.status)?.replace(/_/g, ' ') : undefined,
        };
      });

    return { ok: true as const, appointments, message: undefined };
  },
});

// ── Book ──────────────────────────────────────────────────────────

/**
 * Create the appointment. The patient is resolved from the Patient ID / Health
 * Card ID against the STORED register, so no duplicate patient is ever created
 * and a client cannot book for a patient outside its authorization.
 */
export const bookAppointmentForPatient = mutation({
  args: {
    patientCode: v.string(),
    hospitalId: v.string(),
    doctorId: v.string(),
    date: v.string(),
    time: v.string(),
    reason: v.string(),
    referralId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    const actor = actorOf(binding);
    const isPatientSelf = binding.role === 'patient';

    if (!isPatientSelf && !BOOKING_ROLES.has(binding.role)) {
      return { ok: false as const, message: 'Unauthorized: your role cannot book appointments.' };
    }

    const patient = await authorizedPatientByCode(ctx, binding, args.patientCode);
    if (!patient) {
      return {
        ok: false as const,
        message: 'No patient with that Patient ID or Health Card ID is in your authorized care record. Searching never registers a patient.',
      };
    }

    const today = todayIso();
    const [hospitalRecords, doctorRecords, appointmentRecords, referralRecords] = await Promise.all([
      readItems(ctx, 'hospitals'),
      readItems(ctx, 'doctors'),
      readItems(ctx, 'appointments'),
      readItems(ctx, 'referrals'),
    ]);
    const hospital = hospitalRecords.find(record => isRecord(record) && str(record.id) === args.hospitalId);
    if (!isRecord(hospital)) {
      return { ok: false as const, message: 'Hospital not found.' };
    }
    const doctor = doctorRecords.find(record => isRecord(record) && str(record.id) === args.doctorId);
    if (!isRecord(doctor)) {
      return { ok: false as const, message: 'Doctor not found.' };
    }

    const referralIds = (await referralHospitalIdsForPatient(ctx, binding, patient)).ids;
    if (!hospitalAllowed(hospital, binding, referralIds)) {
      return {
        ok: false as const,
        message: 'Unauthorized: this hospital is outside your authorized district.',
      };
    }

    const stored = appointmentRecords
      .map(asAppointment)
      .filter((appointment): appointment is AppointmentRecord => appointment !== null);

    // A retried request (same idempotency key) must not reserve a second slot.
    // Checked BEFORE validation: after the first request saved, its own slot is
    // now occupied, so validating first would turn a lost-response retry into a
    // confusing "slot already booked" error instead of the appointment it made.
    const createdId = args.idempotencyKey
      ? `apt-${patient.id}-${args.idempotencyKey}`
      : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = stored.find(appointment => appointment.id === createdId);
    if (existing) {
      return {
        ok: true as const,
        duplicate: true as const,
        appointment: existing,
        message: 'This appointment was already booked.',
      };
    }

    // The same patient retrying the same visit (e.g. after a reload, with a new
    // key) is the SAME appointment, not a second one. Any other patient falls
    // through so validation reports the slot as taken.
    const holder = stored.find(
      appointment =>
        appointment.doctorId === args.doctorId &&
        appointment.date === args.date &&
        normalizeTime(appointment.time) === normalizeTime(args.time) &&
        (appointment.status === 'scheduled' ||
          appointment.status === 'confirmed' ||
          appointment.status === 'in_progress'),
    );
    if (holder && holder.patientId === patient.id && holder.facilityId === args.hospitalId) {
      return {
        ok: true as const,
        duplicate: true as const,
        appointment: holder,
        message: 'This appointment was already booked.',
      };
    }

    // Optional referral link: the referral must belong to THIS patient and
    // involve THIS hospital, and it must still be open.
    let referral: Record<string, unknown> | undefined;
    if (args.referralId) {
      const found = referralRecords.find(record => isRecord(record) && str(record.id) === args.referralId);
      if (!isRecord(found)) {
        return { ok: false as const, message: 'The selected referral no longer exists.' };
      }
      referral = found;
      if (str(referral.patientId) !== patient.id) {
        return { ok: false as const, message: 'The selected referral does not belong to this patient.' };
      }
      const involvesHospital =
        str(referral.destinationFacilityId) === args.hospitalId || str(referral.sourceFacilityId) === args.hospitalId;
      if (!involvesHospital) {
        return { ok: false as const, message: 'The selected referral is for a different hospital.' };
      }
      if (isTerminalStatus(str(referral.status))) {
        return { ok: false as const, message: 'This referral is already closed and cannot take a new appointment.' };
      }
    }

    const availableDays = Array.isArray(doctor.availableDays)
      ? (doctor.availableDays.filter((day): day is string => typeof day === 'string') as string[])
      : [];
    const errors: BookingError[] = validateBookingRequest({
      patient: { id: patient.id },
      hospital: { id: args.hospitalId, status: str(hospital.status) },
      doctor: { id: args.doctorId, facilityId: str(doctor.facilityId) ?? '', availableDays },
      date: args.date,
      time: args.time,
      reason: args.reason,
      appointments: stored,
      today,
    });
    if (errors.length > 0) {
      return {
        ok: false as const,
        reason: errors[0].code,
        errors,
        message: errors[0].message,
      };
    }

    const doctorName = str(doctor.name) ?? 'Doctor';
    const hospitalName = str(hospital.name) ?? 'Hospital';
    const createdAt = new Date().toISOString();
    const appointment: AppointmentRecord = {
      id: createdId,
      appointmentId: nextAppointmentReference(stored),
      patientId: patient.id,
      patientName: patient.name,
      healthCardId: patient.healthCardId,
      doctorId: args.doctorId,
      doctorName,
      facilityId: args.hospitalId,
      facilityName: hospitalName,
      department: str(doctor.specialization) ?? 'General Medicine',
      date: args.date,
      time: normalizeTime(args.time) as string,
      status: 'scheduled' as AppointmentStatus,
      reason: args.reason.trim().slice(0, MAX_REASON_LENGTH),
      bookingSource: isPatientSelf ? 'PATIENT' : 'HEALTH_WORKER',
      bookedByUserId: actor.userId,
      bookedByName: actor.name,
      bookedByRole: actor.role,
      bookedByFacilityId: binding.hospitalId,
      referralId: referral ? str(referral.id) : undefined,
      idempotencyKey: args.idempotencyKey,
      createdAt,
      updatedAt: createdAt,
      history: [
        appointmentHistoryEntry({
          action: 'booked',
          actor,
          at: createdAt,
          toDate: args.date,
          toTime: normalizeTime(args.time) ?? args.time,
          reason: args.reason.trim(),
        }),
      ],
    };

    const next = [...appointmentRecords, appointment];
    if (!payloadFits('1', next)) {
      return {
        ok: false as const,
        message: 'The appointment store is too large to update — contact the platform administrator.',
      };
    }
    await writeItems(ctx, 'appointments', next);

    if (!isPatientSelf) {
      await appendPatientNotification(
        ctx,
        patient.id,
        'Appointment booked',
        `${doctorName} at ${hospitalName} on ${args.date} at ${appointment.time}. Booked by ${actor.name}.`,
        '/patient/appointments',
      );
    }

    return {
      ok: true as const,
      duplicate: false as const,
      appointment,
      message: `Appointment confirmed for ${patient.name} with ${doctorName} at ${hospitalName}.`,
    };
  },
});

// ── Reschedule / cancel ───────────────────────────────────────────

/** Actor details for an appointment change, including the doctor's record id. */
async function modificationActor(ctx: Ctx, binding: CareBinding): Promise<AppointmentActor> {
  const actor = actorOf(binding);
  if (binding.role === 'doctor') {
    actor.doctorId = await doctorRecordIdFor(ctx, binding);
  }
  if (binding.role === 'gov_admin') {
    const hospitals = await readItems(ctx, 'hospitals');
    const ids = new Set<string>();
    for (const hospital of hospitals) {
      if (!isRecord(hospital) || !str(hospital.id)) continue;
      const own = str(hospital.districtId);
      const inDistrict = own
        ? !!binding.districtId && own === binding.districtId
        : !!binding.districtName && str(hospital.district) === binding.districtName;
      if (inDistrict) ids.add(str(hospital.id) as string);
    }
    actor.districtFacilityIds = ids;
  }
  return actor;
}

/** Reschedule an appointment. The previous date/time is preserved in history. */
export const rescheduleAppointment = mutation({
  args: {
    appointmentId: v.string(),
    date: v.string(),
    time: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    const actor = await modificationActor(ctx, binding);

    const appointmentRecords = await readItems(ctx, 'appointments');
    const stored = appointmentRecords
      .map(asAppointment)
      .filter((appointment): appointment is AppointmentRecord => appointment !== null);
    const appointment = stored.find(record => record.id === args.appointmentId);
    if (!appointment) {
      return { ok: false as const, message: 'Appointment not found.' };
    }

    const rights = appointmentRights(appointment, actor);
    if (!rights.canReschedule) {
      return {
        ok: false as const,
        reason: rights.refusal,
        message: rights.refusal === 'closed'
          ? 'A completed, missed or cancelled appointment cannot be rescheduled.'
          : 'Unauthorized: you cannot change this appointment.',
      };
    }

    const [hospitalRecords, doctorRecords] = await Promise.all([
      readItems(ctx, 'hospitals'),
      readItems(ctx, 'doctors'),
    ]);
    const hospital = hospitalRecords.find(record => isRecord(record) && str(record.id) === appointment.facilityId);
    const doctor = doctorRecords.find(record => isRecord(record) && str(record.id) === appointment.doctorId);
    if (!isRecord(hospital) || !isRecord(doctor)) {
      return { ok: false as const, message: 'The appointment’s hospital or doctor no longer exists.' };
    }
    const availableDays = Array.isArray(doctor.availableDays)
      ? (doctor.availableDays.filter((day): day is string => typeof day === 'string') as string[])
      : [];

    const errors = validateBookingRequest({
      patient: { id: appointment.patientId },
      hospital: { id: appointment.facilityId, status: str(hospital.status) },
      doctor: { id: appointment.doctorId, facilityId: str(doctor.facilityId) ?? '', availableDays },
      date: args.date,
      time: args.time,
      reason: appointment.reason,
      appointments: stored,
      excludeAppointmentId: appointment.id,
      today: todayIso(),
      requireReason: false,
    });
    if (errors.length > 0) {
      return { ok: false as const, reason: errors[0].code, errors, message: errors[0].message };
    }

    const updatedAt = new Date().toISOString();
    const updated: AppointmentRecord = {
      ...appointment,
      date: args.date,
      time: normalizeTime(args.time) as string,
      status: 'scheduled' as AppointmentStatus,
      updatedAt,
      history: [
        ...(appointment.history ?? []),
        appointmentHistoryEntry({
          action: 'rescheduled',
          actor,
          at: updatedAt,
          fromDate: appointment.date,
          fromTime: appointment.time,
          toDate: args.date,
          toTime: normalizeTime(args.time) ?? args.time,
          reason: args.reason,
        }),
      ],
    };

    const next = appointmentRecords.map(record =>
      isRecord(record) && str(record.id) === appointment.id ? updated : record,
    );
    if (!payloadFits('1', next)) {
      return { ok: false as const, message: 'The appointment store is too large to update.' };
    }
    await writeItems(ctx, 'appointments', next);

    await appendPatientNotification(
      ctx,
      appointment.patientId,
      'Appointment rescheduled',
      `Your appointment with ${appointment.doctorName ?? 'the doctor'} is now ${args.date} at ${updated.time}. Rescheduled by ${actor.name}.`,
      '/patient/appointments',
    );

    return { ok: true as const, appointment: updated, message: 'Appointment rescheduled.' };
  },
});

/** Cancel an appointment without erasing it (status + audit entry only). */
export const cancelAppointment = mutation({
  args: { appointmentId: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    const actor = await modificationActor(ctx, binding);

    const appointmentRecords = await readItems(ctx, 'appointments');
    const stored = appointmentRecords
      .map(asAppointment)
      .filter((appointment): appointment is AppointmentRecord => appointment !== null);
    const appointment = stored.find(record => record.id === args.appointmentId);
    if (!appointment) {
      return { ok: false as const, message: 'Appointment not found.' };
    }
    if (appointment.status === 'cancelled') {
      return { ok: true as const, duplicate: true as const, appointment, message: 'This appointment is already cancelled.' };
    }

    const rights = appointmentRights(appointment, actor);
    if (!rights.canCancel) {
      return {
        ok: false as const,
        reason: rights.refusal,
        message: rights.refusal === 'closed'
          ? 'A completed or missed appointment cannot be cancelled.'
          : 'Unauthorized: you cannot cancel this appointment.',
      };
    }

    const cancelledAt = new Date().toISOString();
    const updated: AppointmentRecord = {
      ...appointment,
      status: 'cancelled' as AppointmentStatus,
      cancelledAt,
      cancelledByName: actor.name,
      cancellationReason: args.reason?.trim().slice(0, MAX_REASON_LENGTH) || undefined,
      updatedAt: cancelledAt,
      history: [
        ...(appointment.history ?? []),
        appointmentHistoryEntry({
          action: 'cancelled',
          actor,
          at: cancelledAt,
          fromDate: appointment.date,
          fromTime: appointment.time,
          reason: args.reason,
        }),
      ],
    };

    const next = appointmentRecords.map(record =>
      isRecord(record) && str(record.id) === appointment.id ? updated : record,
    );
    if (!payloadFits('1', next)) {
      return { ok: false as const, message: 'The appointment store is too large to update.' };
    }
    await writeItems(ctx, 'appointments', next);

    await appendPatientNotification(
      ctx,
      appointment.patientId,
      'Appointment cancelled',
      `Your appointment with ${appointment.doctorName ?? 'the doctor'} on ${appointment.date} at ${appointment.time} was cancelled by ${actor.name}.`,
      '/patient/appointments',
    );

    return { ok: true as const, appointment: updated, message: 'Appointment cancelled.' };
  },
});

