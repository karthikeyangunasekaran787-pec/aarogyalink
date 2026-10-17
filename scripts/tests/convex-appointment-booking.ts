/**
 * Live end-to-end test of Health Worker appointment booking.
 * Run with: bun scripts/tests/convex-appointment-booking.ts
 *
 * Drives the REAL backend (convex/appAppointment.ts) with real server-bound
 * sessions, and walks the acceptance list:
 *
 *   A. a health worker finds a registered patient by Patient ID / Health Card ID
 *   B. the hospitals offered are only those in the authorized district
 *   C. only doctors of the SELECTED hospital are offered
 *   D. a genuinely free slot is offered and chosen
 *   E. the appointment is saved
 *   F. the patient sees it in their own appointments
 *   G. the doctor's hospital queue sees it
 *   H. the health worker is recorded as the booker (source HEALTH_WORKER)
 *   I. the same slot cannot be booked twice (including a concurrent race)
 *   J. a manipulated slot/date is refused by the backend
 *   K. cross-district and cross-hospital attempts are rejected
 *   L. a referral-linked booking keeps the referral status untouched
 *   M. the appointment persists on a fresh read
 *   + reschedule and cancel preserve the previous values in history
 *
 * It creates only its own appointments (and their notifications) and removes
 * them again at the end.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';

import { api } from '../../src/convex/_generated/api';
import { DATA_VERSION } from '../../src/contexts/cloudData';
import { nextAvailableDates, todayIso } from '../../src/lib/appointment-booking';
import type { Appointment, Doctor } from '../../src/types';

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('FAIL: VITE_CONVEX_URL is not set');
  process.exit(1);
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`(pass) ${name}`);
  else {
    failures++;
    console.error(`(FAIL) ${name}`, detail ?? '');
  }
}
function info(message: string) {
  console.log(`(info) ${message}`);
}

type Items = Record<string, unknown>[];
type Envelope = { v?: string; items: Items };

const s = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

async function device(): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url as string);
  const result = (await client.action(api.auth.signIn as AnyApi, {
    provider: 'anonymous',
  })) as { tokens?: { token: string } };
  const token = result?.tokens?.token;
  if (!token) throw new Error('anonymous sign-in returned no token');
  client.setAuth(token);
  return client;
}

interface Session {
  label: string;
  client: ConvexHttpClient;
  staffUserId?: string;
  name?: string;
  role?: string;
}

async function bindStaff(label: string, username: string, password: string): Promise<Session | null> {
  const client = await device();
  const result = (await client.mutation(api.appSession.loginStaffSession as AnyApi, {
    username,
    password,
  })) as { ok?: boolean; user?: { id?: string; name?: string; role?: string } };
  if (!result?.ok) return null;
  return { label, client, staffUserId: result.user?.id, name: result.user?.name, role: result.user?.role };
}

async function bindPatient(email: string, healthCardId?: string): Promise<Session | null> {
  const client = await device();
  const result = (await client.mutation(api.appSession.loginPatientSession as AnyApi, {
    email,
    healthCardId,
  })) as { ok?: boolean; user?: { id?: string; name?: string; role?: string } };
  if (!result?.ok) return null;
  return { label: 'patient', client, staffUserId: result.user?.id, name: result.user?.name, role: result.user?.role };
}

async function readEnvelope(client: ConvexHttpClient, key: string): Promise<Envelope> {
  const all = (await client.query(api.appData.getAll as AnyApi, {})) as Record<string, unknown>;
  const raw = all[key];
  if (typeof raw !== 'string') return { items: [] };
  const parsed = JSON.parse(raw) as Envelope;
  return { v: parsed.v, items: Array.isArray(parsed.items) ? parsed.items : [] };
}

async function readItems(client: ConvexHttpClient, key: string): Promise<Items> {
  return (await readEnvelope(client, key)).items;
}

async function writeCollection(
  session: Session,
  key: string,
  items: unknown[],
): Promise<{ written: boolean; reason?: string }> {
  const stored = await readEnvelope(session.client, key);
  if (stored.v !== DATA_VERSION) {
    return { written: false, reason: `stored version ${stored.v ?? 'none'} != ${DATA_VERSION}` };
  }
  const result = (await session.client.mutation(api.appData.saveCollection as AnyApi, {
    key,
    data: JSON.stringify({ v: DATA_VERSION, items }),
  })) as { written?: boolean; reason?: string };
  return { written: result?.written === true, reason: result?.reason };
}

interface SlotQuery {
  ok?: boolean;
  doctorAvailable?: boolean;
  slots?: { time: string; available: boolean }[];
  message?: string;
}

const createdIds: string[] = [];
const startedAt = new Date().toISOString();
let fixturePatientId: string | undefined;

async function slotsFor(
  session: Session,
  hospitalId: string,
  doctorId: string,
  date: string,
  patientCode?: string,
): Promise<{ date: string; free: string[]; all: { time: string; available: boolean }[]; message?: string }> {
  const result = (await session.client.query(api.appAppointment.availableSlots as AnyApi, {
    hospitalId,
    doctorId,
    date,
    ...(patientCode ? { patientCode } : {}),
  })) as SlotQuery;
  const all = result?.slots ?? [];
  return { date, free: all.filter(slot => slot.available).map(slot => slot.time), all, message: result?.message };
}

/**
 * Pick a date (from the doctor's real consulting days) that has at least one
 * free slot. Looks ahead up to two weeks so a booked day is not a dead end.
 */
async function findFreeSlot(
  session: Session,
  hospitalId: string,
  doctor: { id: string; availableDays?: string[] },
  patientCode?: string,
): Promise<{ date: string; time: string; free: string[] } | null> {
  const dates = nextAvailableDates(doctor, todayIso(), { horizonDays: 14, limit: 10 });
  for (const date of dates) {
    const slots = await slotsFor(session, hospitalId, doctor.id, date, patientCode);
    if (slots.free.length > 0) return { date, time: slots.free[0], free: slots.free };
  }
  return null;
}

try {
  // ── Sessions ────────────────────────────────────────────────────
  const hw1 = await bindStaff('hw1', 'suganthi.pdk001', 'HW@12345');
  const hwTry = await bindStaff('hw-try', 'worker_try1', 'TRYWORK@2026');
  const doctor1 = await bindStaff('doctor1', 'arun.pdk001', 'Doctor@123');
  const hospital1 = await bindStaff('hospital-admin-1', 'rajesh.pdk001', 'Admin@123');
  const district = await bindStaff('district', 'distadmin_pdk', 'PDK@2026Admin');
  const patient1 = await bindPatient('patient@demo.com', 'AL-PT-2026-001');

  check('health worker session binds', !!hw1, hw1?.label);
  check('Trichy health worker session binds', !!hwTry);
  check('doctor session binds', !!doctor1);
  check('hospital administrator session binds', !!hospital1);
  check('district administrator session binds', !!district);
  check('patient session binds', !!patient1);
  if (!hw1 || !hwTry || !doctor1 || !hospital1 || !district || !patient1) {
    throw new Error('cannot continue without the demo sessions');
  }

  // ── A. Find the patient by Patient ID / Health Card ID ──────────
  const byId = (await hw1.client.query(api.appPatient.findPatientRecord as AnyApi, { code: 'P1' })) as {
    ok?: boolean;
    patient?: { id?: string; name?: string };
  };
  const byCard = (await hw1.client.query(api.appPatient.findPatientRecord as AnyApi, {
    code: 'al-pt-2026-001',
  })) as { ok?: boolean; patient?: { id?: string } };
  check('A. health worker finds the patient by Patient ID', byId?.ok === true && byId?.patient?.id === 'p1', byId);
  check('A. health worker finds the same patient by Health Card ID', byCard?.ok === true && byCard?.patient?.id === 'p1');
  const patientName = s(byId?.patient?.name) ?? 'Patient';
  info(`patient: ${patientName} (p1)`);

  // ── B. Only the authorized district's hospitals are offered ─────
  const hospitalsResult = (await hw1.client.query(api.appAppointment.bookingHospitals as AnyApi, {
    patientCode: 'P1',
  })) as { ok?: boolean; hospitals?: { id: string; name: string; district: string }[] };
  const hospitalList = hospitalsResult?.hospitals ?? [];
  const hospitalIds = hospitalList.map(h => h.id);
  check('B. the booking hospitals query succeeds', hospitalsResult?.ok === true, hospitalsResult);
  check(
    'B. only Pudukkottai hospitals are offered',
    hospitalIds.length > 0 && hospitalList.every(h => h.district === 'Pudukkottai'),
    hospitalList.map(h => `${h.id}:${h.district}`),
  );
  check(
    'B. no Tiruchirappalli hospital is offered',
    hospitalIds.every(id => !['h6', 'h7', 'h8'].includes(id)),
    hospitalIds,
  );

  // ── C. Only doctors of the SELECTED hospital ────────────────────
  const h1Doctors = (await hw1.client.query(api.appAppointment.hospitalDoctors as AnyApi, {
    hospitalId: 'h1',
    patientCode: 'P1',
  })) as { ok?: boolean; doctors?: Doctor[] };
  const h1DoctorList = h1Doctors?.doctors ?? [];
  check('C. hospital 1 doctors load', h1Doctors?.ok === true && h1DoctorList.length > 0, h1Doctors);
  const deploymentDoctors = await readItems(district.client, 'doctors');
  const h1Ids = new Set(
    deploymentDoctors.filter(d => d.facilityId === 'h1').map(d => s(d.id)).filter(Boolean),
  );
  check(
    'C. every offered doctor practises at hospital 1',
    h1DoctorList.length > 0 && h1DoctorList.every(d => h1Ids.has(d.id)),
    h1DoctorList.map(d => d.id),
  );
  check(
    'C. no doctor from another hospital appears',
    !h1DoctorList.some(d => ['d3', 'd4', 'd5', 'd11'].includes(d.id)),
    h1DoctorList.map(d => d.id),
  );

  const d1 = h1DoctorList.find(d => d.id === 'd1');
  const d2 = h1DoctorList.find(d => d.id === 'd2');
  check('C. the seeded cardiologist is available', !!d1, h1DoctorList.map(d => d.id));
  if (!d1 || !d2) throw new Error('cannot continue without d1/d2 at hospital 1');

  // ── D. A genuinely free slot ────────────────────────────────────
  const first = await findFreeSlot(hw1, 'h1', d1, 'P1');
  check('D. the backend offers a real free slot', !!first, first);
  if (!first) throw new Error('hospital 1 has no free slot for d1 in the next two weeks');
  info(`d1 free slot: ${first.date} ${first.time}`);

  // ── E. Book it ──────────────────────────────────────────────────
  const booking = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'AL-PT-2026-001',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: first.time,
    reason: 'Live test: chest pain follow-up booked by the health worker',
    idempotencyKey: `live-a-${Date.now()}`,
  })) as { ok?: boolean; appointment?: Appointment; message?: string };
  const appointment = booking?.appointment;
  check('E. the appointment is saved', booking?.ok === true && !!appointment, booking?.message);
  if (!appointment) throw new Error('cannot continue without the saved appointment');
  createdIds.push(appointment.id);
  check('E. the saved row keeps the patient identity', appointment.patientId === 'p1' && appointment.patientName === patientName);
  check('E. the saved row records the doctor and hospital', appointment.doctorId === 'd1' && appointment.facilityId === 'h1');
  check('E. the saved row has the chosen date, time and status', appointment.date === first.date && appointment.time === first.time && appointment.status === 'scheduled');
  check('E. a human-readable appointment reference is issued', /^APT-\d{4}-\d{6}$/.test(appointment.appointmentId ?? ''), appointment.appointmentId);
  check('E. the visit reason is stored', (appointment.reason ?? '').includes('chest pain'));

  // ── H. The health worker is recorded as the booker ──────────────
  check('H. the booking source is HEALTH_WORKER', appointment.bookingSource === 'HEALTH_WORKER', appointment.bookingSource);
  check('H. the booker is the signed-in health worker', appointment.bookedByUserId === hw1.staffUserId, {
    recorded: appointment.bookedByUserId,
    expected: hw1.staffUserId,
  });
  check('H. the booker name is recorded (not the patient)', appointment.bookedByName === hw1.name && appointment.bookedByName !== appointment.patientName, {
    bookedBy: appointment.bookedByName,
    patient: appointment.patientName,
  });

  // ── F. Patient's own appointments ───────────────────────────────
  const patientAppointments = await readItems(patient1.client, 'appointments');
  const patientSees = patientAppointments.find(a => s(a.id) === appointment.id);
  check('F. the patient receives the appointment in their own record', !!patientSees, patientAppointments.map(a => a.id));
  check(
    'F. the patient sees only their own appointments',
    patientAppointments.every(a => s(a.patientId) === 'p1'),
    patientAppointments.map(a => a.patientId),
  );

  // ── G. Doctor queue + hospital dashboard ────────────────────────
  const doctorAppointments = await readItems(doctor1.client, 'appointments');
  check('G. the doctor’s hospital queue contains the appointment', doctorAppointments.some(a => s(a.id) === appointment.id));
  check(
    'G. the doctor queue only holds that hospital’s appointments',
    doctorAppointments.every(a => s(a.facilityId) === 'h1'),
    doctorAppointments.map(a => a.facilityId),
  );
  const hospitalAppointments = await readItems(hospital1.client, 'appointments');
  check('G. the hospital dashboard receives the appointment', hospitalAppointments.some(a => s(a.id) === appointment.id));

  // ── I. Duplicate + concurrency ──────────────────────────────────
  const retrySameKey = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: first.time,
    reason: 'Live test: chest pain follow-up booked by the health worker',
    idempotencyKey: appointment.idempotencyKey,
  })) as { ok?: boolean; duplicate?: boolean; appointment?: Appointment };
  check('I. a retried request returns the SAME appointment', retrySameKey?.ok === true && retrySameKey?.duplicate === true && retrySameKey?.appointment?.id === appointment.id);

  const otherPatient = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P5',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: first.time,
    reason: 'Live test: duplicate slot attempt',
    idempotencyKey: `live-dup-${Date.now()}`,
  })) as { ok?: boolean; reason?: string; message?: string };
  check('I. another patient cannot take the same slot', otherPatient?.ok === false, otherPatient);

  // Race: two different patients, the same doctor/slot, at the same time.
  const raceDate = (await findFreeSlot(hw1, 'h1', d2, 'P5')) ?? null;
  if (raceDate) {
    const hw1SecondDevice = await bindStaff('hw1-race', 'suganthi.pdk001', 'HW@12345');
    const [raceA, raceB] = await Promise.all([
      hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
        patientCode: 'P5',
        hospitalId: 'h1',
        doctorId: 'd2',
        date: raceDate.date,
        time: raceDate.time,
        reason: 'Live test: concurrency race A',
        idempotencyKey: `live-race-a-${Date.now()}`,
      }) as Promise<{ ok?: boolean; appointment?: Appointment }>,
      (hw1SecondDevice?.client ?? hw1.client).mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
        patientCode: 'P4',
        hospitalId: 'h1',
        doctorId: 'd2',
        date: raceDate.date,
        time: raceDate.time,
        reason: 'Live test: concurrency race B',
        idempotencyKey: `live-race-b-${Date.now()}`,
      }) as Promise<{ ok?: boolean; appointment?: Appointment }>,
    ]);
    const wins = [raceA, raceB].filter(result => result?.ok === true);
    check('I. exactly one of two simultaneous bookings wins', wins.length === 1, [raceA, raceB]);
    for (const result of wins) if (result.appointment) createdIds.push(result.appointment.id);

    const afterRace = await readItems(district.client, 'appointments');
    const holders = afterRace.filter(
      a =>
        s(a.doctorId) === 'd2' &&
        s(a.date) === raceDate.date &&
        s(a.time) === raceDate.time &&
        ['scheduled', 'confirmed', 'in_progress'].includes(s(a.status) ?? ''),
    );
    check('I. only one appointment holds the raced slot', holders.length === 1, holders.map(a => a.id));
  } else {
    check('I. concurrency slot is available to race for', false);
  }

  // ── J. Manipulated requests are refused ────────────────────────
  const manipulatedTime = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: '03:00',
    reason: 'Live test: invalid time',
    idempotencyKey: `live-bad-time-${Date.now()}`,
  })) as { ok?: boolean; reason?: string };
  check('J. a time outside the clinic slots is refused', manipulatedTime?.ok === false && manipulatedTime?.reason === 'invalid_time', manipulatedTime);

  const pastDate = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: '2020-01-06',
    time: '09:00',
    reason: 'Live test: past date',
    idempotencyKey: `live-past-${Date.now()}`,
  })) as { ok?: boolean; reason?: string };
  check('J. a past date is refused', pastDate?.ok === false && pastDate?.reason === 'past_date', pastDate);

  const wrongDoctor = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h1',
    doctorId: 'd4', // maternity doctor at h2
    date: first.date,
    time: '09:00',
    reason: 'Live test: doctor from another hospital',
    idempotencyKey: `live-wrong-doctor-${Date.now()}`,
  })) as { ok?: boolean; reason?: string; message?: string };
  check('J. a doctor from another hospital is refused', wrongDoctor?.ok === false, wrongDoctor);

  const sunday = nextAvailableDates({ availableDays: ['Sun'] }, todayIso(), { limit: 1 })[0];
  if (sunday) {
    const unavailableDay = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
      patientCode: 'P1',
      hospitalId: 'h1',
      doctorId: 'd1',
      date: sunday,
      time: '09:00',
      reason: 'Live test: non-consulting day',
      idempotencyKey: `live-sunday-${Date.now()}`,
    })) as { ok?: boolean; reason?: string };
    check('J. a day the doctor does not consult is refused', unavailableDay?.ok === false && unavailableDay?.reason === 'doctor_unavailable', unavailableDay);
  }

  // ── K. Cross-district and cross-hospital rejection ──────────────
  const tryH1 = (await hwTry.client.query(api.appAppointment.hospitalDoctors as AnyApi, {
    hospitalId: 'h1',
  })) as { ok?: boolean; doctors?: unknown[]; message?: string };
  check('K. a Trichy health worker cannot load hospital 1 doctors', tryH1?.ok === false && (tryH1?.doctors ?? []).length === 0, tryH1?.message);

  const crossDistrict = (await hwTry.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P11', // their own patient
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: '09:30',
    reason: 'Live test: cross-district booking',
    idempotencyKey: `live-cross-${Date.now()}`,
  })) as { ok?: boolean; message?: string };
  check('K. a cross-district booking is rejected', crossDistrict?.ok === false, crossDistrict?.message);

  // A patient REGISTERED at hospital 1 is not in a Trichy hospital's register.
  // (Seeded patients carry no registering facility and are deliberate shared
  // reference data, so the scope check needs an attributed record.)
  const fixtureCode = `AL-APT-TEST-${Date.now()}`;
  const fixtureId = `ptest-apt-scope-${Date.now()}`;
  const patientRegister = await readItems(district.client, 'patients');
  const fixtureWrite = await writeCollection(district, 'patients', [
    ...patientRegister,
    {
      id: fixtureId,
      healthCardId: fixtureCode,
      name: 'Scope Test Patient',
      age: 30,
      gender: 'female',
      phone: '9000000000',
      address: 'Test record',
      village: 'Kallikudi',
      district: 'Pudukkottai',
      state: 'Tamil Nadu',
      bloodGroup: 'O+',
      registeredByFacilityId: 'h1',
      registeredAt: startedAt,
      createdAt: startedAt,
    },
  ]);
  if (fixtureWrite.written) {
    fixturePatientId = fixtureId;
    const sameHospital = (await hw1.client.query(api.appPatient.findPatientRecord as AnyApi, {
      code: fixtureCode,
    })) as { ok?: boolean; patient?: { id?: string } };
    check('K. the registering hospital can find its own patient', sameHospital?.ok === true && sameHospital?.patient?.id === fixtureId, sameHospital);

    const crossPatient = (await hwTry.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
      patientCode: fixtureCode,
      hospitalId: 'h6',
      doctorId: 'd11',
      date: first.date,
      time: '09:30',
      reason: 'Live test: patient registered at another hospital',
      idempotencyKey: `live-cross-patient-${Date.now()}`,
    })) as { ok?: boolean; message?: string };
    check('K. a patient registered at another hospital is rejected', crossPatient?.ok === false, crossPatient?.message);
  } else {
    check('K. the scope fixture could be written', false, fixtureWrite.reason);
  }

  const hw1CrossDistrict = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h6',
    doctorId: 'd11',
    date: first.date,
    time: '09:30',
    reason: 'Live test: Pudukkottai worker booking in Trichy',
    idempotencyKey: `live-hw-cross-${Date.now()}`,
  })) as { ok?: boolean; message?: string };
  check('K. a health worker cannot book outside their district', hw1CrossDistrict?.ok === false, hw1CrossDistrict?.message);

  // ── L. Referral-linked booking ──────────────────────────────────
  const referrals = await readItems(district.client, 'referrals');
  const openReferral = referrals.find(
    r =>
      s(r.destinationFacilityId) === 'h2' &&
      s(r.patientId) === 'p3' &&
      !['closed', 'cancelled'].includes(s(r.status) ?? ''),
  );
  check('L. an open seeded referral to hospital 2 exists', !!openReferral, referrals.map(r => r.id).slice(0, 8));
  if (openReferral) {
    const referralPatientId = s(openReferral.patientId) as string;
    const h2Doctors = (await hw1.client.query(api.appAppointment.hospitalDoctors as AnyApi, {
      hospitalId: 'h2',
      patientCode: referralPatientId,
    })) as { ok?: boolean; doctors?: Doctor[] };
    const h2Doctor = h2Doctors.doctors?.find(d => d.id === 'd4');
    check('L. the receipt hospital offers its own doctor', h2Doctors.ok === true && !!h2Doctor, h2Doctors.doctors?.map(d => d.id));
    if (h2Doctor) {
      const referralSlot = await findFreeSlot(hw1, 'h2', h2Doctor, referralPatientId);
      if (referralSlot) {
        const statusBefore = s(openReferral.status);
        const linked = (await hw1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
          patientCode: referralPatientId,
          hospitalId: 'h2',
          doctorId: h2Doctor.id,
          date: referralSlot.date,
          time: referralSlot.time,
          reason: 'Live test: appointment for an open referral',
          referralId: openReferral.id,
          idempotencyKey: `live-referral-${Date.now()}`,
        })) as { ok?: boolean; appointment?: Appointment; message?: string };
        const linkedAppointment = linked?.appointment;
        if (linkedAppointment) createdIds.push(linkedAppointment.id);
        check('L. the referral-linked appointment is saved', linked?.ok === true && !!linkedAppointment, linked?.message);
        check('L. it is associated with the correct referral', linkedAppointment?.referralId === s(openReferral.id), linkedAppointment?.referralId);

        const afterReferral = (await readItems(district.client, 'referrals')).find(
          r => s(r.id) === s(openReferral.id),
        );
        check('L. the referral status is NOT advanced by booking', s(afterReferral?.status) === statusBefore, {
          before: statusBefore,
          after: s(afterReferral?.status),
        });
        check(
          'L. the patient is not marked as arrived or treated',
          !['patient_arrived', 'consultation', 'treatment', 'closed'].includes(s(afterReferral?.status) ?? ''),
          s(afterReferral?.status),
        );

        // The referral destination is reachable from the receiving hospital too.
        const h2Slots = await slotsFor(hw1, 'h2', h2Doctor.id, referralSlot.date, referralPatientId);
        check('L. the stale slot is now taken at the receiving hospital', !h2Slots.free.includes(referralSlot.time));
      } else {
        check('L. the referral hospital has a free slot', false);
      }
    }
  }

  // ── M. Persistence on a fresh read ──────────────────────────────
  const persisted = await readItems(district.client, 'appointments');
  check('M. the appointment persists after a fresh read', persisted.some(a => s(a.id) === appointment.id));

  // ── Reschedule then cancel ─────────────────────────────────────
  const repicked = await slotsFor(hw1, 'h1', 'd1', first.date);
  const rescheduleSlot = repicked.free.find(time => time !== first.time);
  if (rescheduleSlot) {
    const rescheduled = (await hw1.client.mutation(api.appAppointment.rescheduleAppointment as AnyApi, {
      appointmentId: appointment.id,
      date: first.date,
      time: rescheduleSlot,
      reason: 'Live test: patient asked for a later time',
    })) as { ok?: boolean; appointment?: Appointment; message?: string };
    const updated = rescheduled?.appointment;
    check('reschedule succeeds into a free slot', rescheduled?.ok === true, rescheduled?.message);
    check('reschedule stores the new time', updated?.time === rescheduleSlot, updated?.time);
    check(
      'reschedule preserves the previous time in history',
      (updated?.history ?? []).some(h => h.action === 'rescheduled' && h.fromTime === first.time && h.toTime === rescheduleSlot),
      updated?.history,
    );

    const cancelled = (await hw1.client.mutation(api.appAppointment.cancelAppointment as AnyApi, {
      appointmentId: appointment.id,
      reason: 'Live test: patient admitted elsewhere',
    })) as { ok?: boolean; appointment?: Appointment; message?: string };
    check('cancel succeeds', cancelled?.ok === true, cancelled?.message);
    check('cancel keeps the row with status cancelled', cancelled?.appointment?.status === 'cancelled');
    check(
      'cancel records who cancelled and why',
      cancelled?.appointment?.cancelledByName === hw1.name && !!cancelled?.appointment?.cancellationReason,
      cancelled?.appointment,
    );
    check(
      'cancel preserves the appointment itself (no silent delete)',
      (await readItems(district.client, 'appointments')).some(a => s(a.id) === appointment.id),
    );

    const freed = await slotsFor(hw1, 'h1', 'd1', first.date);
    check('a cancelled appointment frees its slot', freed.free.includes(rescheduleSlot), { freed: freed.free, slot: rescheduleSlot });

    const closedReschedule = (await hw1.client.mutation(api.appAppointment.rescheduleAppointment as AnyApi, {
      appointmentId: appointment.id,
      date: first.date,
      time: first.time,
    })) as { ok?: boolean; message?: string };
    check('a cancelled appointment cannot be rescheduled', closedReschedule?.ok === false, closedReschedule?.message);
  } else {
    check('a second free slot exists for the reschedule test', false);
  }

  // The doctor cannot book on a patient's behalf (only health workers can).
  const doctorBooking = (await doctor1.client.mutation(api.appAppointment.bookAppointmentForPatient as AnyApi, {
    patientCode: 'P1',
    hospitalId: 'h1',
    doctorId: 'd1',
    date: first.date,
    time: '15:30',
    reason: 'Live test: doctor attempting a health-worker booking',
    idempotencyKey: `live-doctor-${Date.now()}`,
  })) as { ok?: boolean; message?: string };
  check('a doctor cannot create a health-worker booking', doctorBooking?.ok === false, doctorBooking?.message);
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
} finally {
  // ── Cleanup: remove only this run's rows ───────────────────────
  if (createdIds.length > 0 || fixturePatientId) {
    try {
      const district = await bindStaff('cleanup', 'distadmin_pdk', 'PDK@2026Admin');
      if (district) {
        // Every row this test creates carries a `live-` idempotency key. Sweeping
        // those also removes rows left behind by an interrupted earlier run.
        const isTestRow = (appointment: Record<string, unknown>) =>
          createdIds.includes(s(appointment.id) ?? '') ||
          (s(appointment.idempotencyKey) ?? '').startsWith('live-');

        const cleanAppointments = async (session: Session, label: string) => {
          const appointments = await readItems(session.client, 'appointments');
          const kept = appointments.filter(a => !isTestRow(a));
          const write = await writeCollection(session, 'appointments', kept);
          info(`cleanup ${label} appointments: ${write.written ? 'ok' : `skipped (${write.reason})`} (${appointments.length - kept.length} removed)`);
        };
        await cleanAppointments(district, 'PDK');
        const trichy = await bindStaff('cleanup-trichy', 'distadmin_trichy', 'TRY@2026Admin');
        if (trichy) await cleanAppointments(trichy, 'TRY');

        const notifications = await readItems(district.client, 'notifications');
        const keptNotifications = notifications.filter(n => {
          const id = s(n.id) ?? '';
          const createdAt = s(n.createdAt) ?? '';
          return !(id.startsWith('notif-apt-') && createdAt >= startedAt);
        });
        if (keptNotifications.length !== notifications.length) {
          const notifyWrite = await writeCollection(district, 'notifications', keptNotifications);
          info(`cleanup notifications: ${notifyWrite.written ? 'ok' : `skipped (${notifyWrite.reason})`}`);
        }

        if (fixturePatientId) {
          const patients = await readItems(district.client, 'patients');
          const keptPatients = patients.filter(p => s(p.id) !== fixturePatientId);
          const patientCleanup = await writeCollection(district, 'patients', keptPatients);
          info(`cleanup scope fixture: ${patientCleanup.written ? 'ok' : `skipped (${patientCleanup.reason})`}`);
        }
      }
    } catch (err) {
      console.error('(warn) cleanup failed:', err);
    }
  }
}

console.log(failures === 0 ? '\nAll live appointment booking tests passed.' : `\n${failures} live appointment booking test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
