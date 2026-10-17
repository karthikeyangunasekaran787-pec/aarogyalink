// ============================================================================
// AarogyaLink — Appointment scheduling rules (shared by UI and backend)
// ----------------------------------------------------------------------------
// The platform already has ONE appointment store (the `appointments` collection)
// and ONE notion of doctor availability (each doctor's `availableDays`). This
// module holds the rules that keep both sides of the booking workflow honest:
//
//   • the clinic's appointment slots (the same list the patient app has always
//     offered), and the weekday a date falls on;
//   • whether a doctor consults on a given date;
//   • which slots are genuinely free, given the appointments already stored;
//   • everything an appointment request must satisfy before it is saved.
//
// The backend is authoritative: it runs `validateBookingRequest` inside the
// mutation that writes the appointment, so changing an ID or a slot in the
// browser cannot get past it. The UI runs the same function for instant
// feedback, which means the message the user sees and the refusal the server
// gives can never disagree.
// ============================================================================

import type {
  Appointment,
  AppointmentHistoryAction,
  AppointmentStatus,
} from '../types';

/**
 * The clinic's appointment slots. These are the slots the patient app has
 * always offered, so the health-worker workflow books into exactly the same
 * schedule rather than inventing a second one.
 */
export const APPOINTMENT_TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '14:00', '14:30', '15:00', '15:30',
] as const;

/** How many days ahead the "next available dates" suggestions look. */
export const AVAILABILITY_HORIZON_DAYS = 14;

/** How many suggested dates a doctor card shows. */
export const SUGGESTED_DATES_PER_DOCTOR = 5;

export const BOOKING_SOURCE_HEALTH_WORKER = 'HEALTH_WORKER' as const;

/** Statuses that hold a slot. A cancelled/missed/completed visit does not. */
export const SLOT_BLOCKING_STATUSES: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
  'scheduled',
  'confirmed',
  'in_progress',
]);

/** Statuses that may still be rescheduled or cancelled. */
export const MODIFIABLE_STATUSES: ReadonlySet<AppointmentStatus> = new Set<AppointmentStatus>([
  'scheduled',
  'confirmed',
]);

const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

// ── Dates ─────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string as a real calendar day (rejects 2026-02-31). */
export function dateParts(value: string | undefined | null): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Weekday abbreviation (Mon, Tue, …) for a YYYY-MM-DD date. */
export function weekdayOf(date: string): string | null {
  const parts = dateParts(date);
  if (!parts) return null;
  return WEEKDAY_CODES[new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay()] ?? null;
}

/** Today as YYYY-MM-DD in the local calendar (the calendar the user sees). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Shift a YYYY-MM-DD date by whole days without timezone drift. */
export function addDays(date: string, days: number): string {
  const parts = dateParts(date);
  if (!parts) return date;
  const shifted = new Date(Date.UTC(parts.y, parts.m - 1, parts.d + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Canonical HH:mm for a typed/stored slot, or null when it is not a slot. */
export function normalizeTime(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// ── Doctor availability ───────────────────────────────────────────

/**
 * A doctor's consulting days, normalised to Mon/Tue/… codes.
 *
 * An empty or missing list means "no restriction recorded" (legacy records),
 * not "never available" — the hospital's existing booking rules stay usable.
 */
export function normalizeAvailabilityDays(days: readonly string[] | undefined | null): string[] {
  if (!days || days.length === 0) return [];
  const out: string[] = [];
  for (const day of days) {
    if (typeof day !== 'string') continue;
    const normalized = day.trim().slice(0, 3).toLowerCase();
    const code = WEEKDAY_CODES.find(candidate => candidate.toLowerCase() === normalized);
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Does the doctor consult on this calendar date? */
export function isDoctorAvailableOn(
  doctor: { availableDays?: string[] } | null | undefined,
  date: string,
): boolean {
  const weekday = weekdayOf(date);
  if (!weekday) return false;
  const days = normalizeAvailabilityDays(doctor?.availableDays);
  if (days.length === 0) return true;
  return days.includes(weekday);
}

/**
 * The next dates (from today) this doctor consults, up to the horizon. Used to
 * offer real dates instead of asking the user to guess.
 */
export function nextAvailableDates(
  doctor: { availableDays?: string[] } | null | undefined,
  from: string,
  options: { horizonDays?: number; limit?: number } = {},
): string[] {
  const horizon = options.horizonDays ?? AVAILABILITY_HORIZON_DAYS;
  const limit = options.limit ?? SUGGESTED_DATES_PER_DOCTOR;
  const dates: string[] = [];
  for (let offset = 0; offset < horizon && dates.length < limit; offset += 1) {
    const date = addDays(from, offset);
    if (isDoctorAvailableOn(doctor, date)) dates.push(date);
  }
  return dates;
}

// ── Slots ─────────────────────────────────────────────────────────

/** Does this appointment hold the doctor's slot on that date/time? */
export function appointmentOccupiesSlot(
  appointment: Appointment,
  doctorId: string,
  date: string,
  time: string,
): boolean {
  return (
    appointment.doctorId === doctorId &&
    appointment.date === date &&
    normalizeTime(appointment.time) === normalizeTime(time) &&
    SLOT_BLOCKING_STATUSES.has(appointment.status)
  );
}

/** A hospital as the booking UI shows it (server-scoped). */
export interface BookingHospital {
  id: string;
  name: string;
  hospitalId?: string;
  district: string;
  type?: string;
  departments: string[];
  doctorCount: number;
  /** True when this hospital is the destination of the patient's referral. */
  referralDestination: boolean;
}

/** An eligible doctor at the selected hospital, with real upcoming dates. */
export interface BookingDoctor {
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
}

export interface SlotAvailability {
  time: string;
  available: boolean;
  /** The appointment holding the slot, when it is taken. */
  appointmentId?: string;
  patientId?: string;
}

/**
 * The real slots for one doctor on one date: every clinic slot, marked free or
 * taken by an appointment already stored. Nothing is invented.
 */
export function slotsForDoctor(
  doctorId: string,
  date: string,
  appointments: readonly Appointment[],
  options: { excludeAppointmentId?: string } = {},
): SlotAvailability[] {
  return APPOINTMENT_TIME_SLOTS.map(time => {
    const holder = appointments.find(
      appointment =>
        appointment.id !== options.excludeAppointmentId &&
        appointmentOccupiesSlot(appointment, doctorId, date, time),
    );
    return {
      time,
      available: !holder,
      appointmentId: holder?.id,
      patientId: holder?.patientId,
    };
  });
}

// ── Validation ────────────────────────────────────────────────────

export type BookingErrorCode =
  | 'patient_required'
  | 'hospital_required'
  | 'doctor_required'
  | 'doctor_not_in_hospital'
  | 'hospital_inactive'
  | 'invalid_date'
  | 'past_date'
  | 'invalid_time'
  | 'doctor_unavailable'
  | 'slot_taken'
  | 'reason_required'
  | 'reason_too_long';

export type BookingErrorField = 'patient' | 'hospital' | 'doctor' | 'date' | 'time' | 'reason';

export interface BookingError {
  code: BookingErrorCode;
  field: BookingErrorField;
  message: string;
}

export interface BookingValidationInput {
  patient: { id: string } | null | undefined;
  hospital: { id: string; status?: string } | null | undefined;
  doctor: { id: string; facilityId: string; availableDays?: string[] } | null | undefined;
  date: string;
  time: string;
  reason?: string;
  appointments: readonly Appointment[];
  /** Ignore this appointment (rescheduling must not collide with itself). */
  excludeAppointmentId?: string;
  /** Injectable for deterministic tests; defaults to the local today. */
  today?: string;
  /** Require a non-empty visit reason. Defaults to true. */
  requireReason?: boolean;
}

export const MAX_REASON_LENGTH = 300;

/**
 * Every rule an appointment request must satisfy. Called by the UI (instant
 * feedback) and again by the Convex mutation that writes the row (the actual
 * enforcement), so frontend manipulation cannot book an unavailable slot.
 */
export function validateBookingRequest(input: BookingValidationInput): BookingError[] {
  const errors: BookingError[] = [];
  const today = input.today ?? todayIso();

  if (!input.patient?.id) {
    errors.push({ code: 'patient_required', field: 'patient', message: 'Select a registered patient first.' });
  }
  if (!input.hospital?.id) {
    errors.push({ code: 'hospital_required', field: 'hospital', message: 'Choose a hospital.' });
  }
  if (!input.doctor?.id) {
    errors.push({ code: 'doctor_required', field: 'doctor', message: 'Choose a doctor.' });
  }

  if (input.hospital?.id && input.hospital.status && input.hospital.status !== 'active') {
    errors.push({
      code: 'hospital_inactive',
      field: 'hospital',
      message: 'This hospital is not accepting appointments.',
    });
  }

  if (input.doctor?.id && input.hospital?.id && input.doctor.facilityId !== input.hospital.id) {
    errors.push({
      code: 'doctor_not_in_hospital',
      field: 'doctor',
      message: 'The selected doctor does not practise at this hospital.',
    });
  }

  if (!dateParts(input.date)) {
    errors.push({ code: 'invalid_date', field: 'date', message: 'Choose a valid appointment date.' });
  } else if (input.date < today) {
    errors.push({ code: 'past_date', field: 'date', message: 'The appointment date cannot be in the past.' });
  }

  const time = normalizeTime(input.time);
  if (!time || !(APPOINTMENT_TIME_SLOTS as readonly string[]).includes(time)) {
    errors.push({ code: 'invalid_time', field: 'time', message: 'Choose one of the available appointment times.' });
  }

  if (input.doctor?.id && input.hospital?.id && dateParts(input.date) && input.date >= today) {
    if (!isDoctorAvailableOn(input.doctor, input.date)) {
      errors.push({
        code: 'doctor_unavailable',
        field: 'date',
        message: 'This doctor does not consult on the selected date.',
      });
    } else if (time && (APPOINTMENT_TIME_SLOTS as readonly string[]).includes(time)) {
      const taken = input.appointments.find(
        appointment =>
          appointment.id !== input.excludeAppointmentId &&
          appointmentOccupiesSlot(appointment, input.doctor!.id, input.date, time),
      );
      if (taken) {
        errors.push({ code: 'slot_taken', field: 'time', message: 'That slot is already booked.' });
      }
    }
  }

  const reason = (input.reason ?? '').trim();
  if ((input.requireReason ?? true) && !reason) {
    errors.push({ code: 'reason_required', field: 'reason', message: 'Enter the reason for the visit.' });
  } else if (reason.length > MAX_REASON_LENGTH) {
    errors.push({
      code: 'reason_too_long',
      field: 'reason',
      message: `Keep the reason under ${MAX_REASON_LENGTH} characters.`,
    });
  }

  return errors;
}

// ── Modification rights ───────────────────────────────────────────

export interface AppointmentActor {
  userId?: string;
  name?: string;
  role?: string;
  /** Hospital the actor is bound to (hospital staff). */
  hospitalId?: string;
  /** Doctor record id, when the actor is the doctor assigned to the visit. */
  doctorId?: string;
  patientId?: string;
  /** Facility ids of the actor's district (district administrator). */
  districtFacilityIds?: ReadonlySet<string>;
}

export type AppointmentModificationRefusal = 'forbidden' | 'closed';

export interface AppointmentRights {
  canReschedule: boolean;
  canCancel: boolean;
  refusal?: AppointmentModificationRefusal;
}

/**
 * Who may change an appointment. The health worker who created it can follow it
 * up; the hospital administrator and the assigned doctor can manage it; the
 * patient can cancel their own visit. Nobody else.
 */
export function appointmentRights(
  appointment: Appointment,
  actor: AppointmentActor,
): AppointmentRights {
  if (!MODIFIABLE_STATUSES.has(appointment.status)) {
    return { canReschedule: false, canCancel: false, refusal: 'closed' };
  }

  const isCreator =
    !!actor.userId &&
    !!appointment.bookedByUserId &&
    appointment.bookedByUserId === actor.userId;
  const isOwnHospital = !!actor.hospitalId && appointment.facilityId === actor.hospitalId;
  const isAssignedDoctor = !!actor.doctorId && appointment.doctorId === actor.doctorId;
  const isOwnPatient = !!actor.patientId && appointment.patientId === actor.patientId;
  const isPlatformAdmin = actor.role === 'overall_admin';
  const isDistrictAdmin =
    actor.role === 'gov_admin' &&
    !!actor.districtFacilityIds &&
    actor.districtFacilityIds.has(appointment.facilityId);

  const allowed = isCreator || isOwnHospital || isAssignedDoctor || isPlatformAdmin || isDistrictAdmin;

  if (!allowed) {
    // A patient may cancel their own visit, but does not reschedule it here.
    if (isOwnPatient) return { canReschedule: false, canCancel: true };
    return { canReschedule: false, canCancel: false, refusal: 'forbidden' };
  }
  return { canReschedule: true, canCancel: true };
}

// ── Display helpers ───────────────────────────────────────────────

/**
 * Translation key for an appointment status. Returned as a plain string so this
 * module stays free of UI imports; the screen translates it.
 */
export function appointmentStatusLabelKey(status: AppointmentStatus) {
  switch (status) {
    case 'confirmed':
      return 'statusConfirmed';
    case 'in_progress':
      return 'inProgress';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'missed':
      return 'missed';
    default:
      return 'scheduled';
  }
}

/** Human-readable booking reference for the next appointment in the store. */
export function nextAppointmentReference(
  appointments: readonly Appointment[],
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  const prefix = `APT-${year}-`;
  let highest = 0;
  for (const appointment of appointments) {
    const reference = appointment.appointmentId;
    if (!reference || !reference.startsWith(prefix)) continue;
    const suffix = Number(reference.slice(prefix.length));
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix;
  }
  return `${prefix}${String(highest + 1).padStart(6, '0')}`;
}

/** Readable timestamp used in the audit trail (YYYY-MM-DD HH:mm). */
export function formatAppointmentTime(value: string | undefined | null): string {
  if (!value) return '';
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : value;
}

/** One appointment change, ready to be appended to the history. */
export function appointmentHistoryEntry(input: {
  action: AppointmentHistoryAction;
  actor: AppointmentActor;
  at?: string;
  fromDate?: string;
  fromTime?: string;
  toDate?: string;
  toTime?: string;
  reason?: string;
  id?: string;
}) {
  const at = input.at ?? new Date().toISOString();
  return {
    id: input.id ?? `aph-${Date.parse(at) || Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: input.action,
    at,
    byUserId: input.actor.userId,
    byName: input.actor.name || 'AarogyaLink staff',
    byRole: input.actor.role,
    fromDate: input.fromDate,
    fromTime: input.fromTime,
    toDate: input.toDate,
    toTime: input.toTime,
    reason: input.reason?.trim() || undefined,
  };
}

/** Patient-facing outcome of an appointment: has the patient arrived yet? */
export function appointmentArrivalLabelKey(appointment: Appointment) {
  if (appointment.status === 'completed' || appointment.status === 'in_progress') return 'patientArrived';
  if (appointment.status === 'scheduled' || appointment.status === 'confirmed') return 'awaitingArrival';
  return 'notRecorded';
}
