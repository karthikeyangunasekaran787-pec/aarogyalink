/**
 * The appointment scheduling rules, exercised directly.
 *
 * These are the rules BOTH the booking screen and the Convex mutation run, so a
 * failure here means a health worker could be shown (or could save) a slot the
 * hospital does not actually have. Covers date/weekday safety, doctor
 * availability, real slot occupancy, request validation, modification rights and
 * the audit helpers.
 *
 * Run with: bun test
 */
import { describe, expect, test } from 'bun:test';

import {
  APPOINTMENT_TIME_SLOTS,
  addDays,
  appointmentArrivalLabelKey,
  appointmentHistoryEntry,
  appointmentOccupiesSlot,
  appointmentRights,
  appointmentStatusLabelKey,
  dateParts,
  formatAppointmentTime,
  isDoctorAvailableOn,
  nextAppointmentReference,
  nextAvailableDates,
  normalizeAvailabilityDays,
  normalizeTime,
  slotsForDoctor,
  todayIso,
  validateBookingRequest,
  weekdayOf,
  type AppointmentActor,
} from '../../src/lib/appointment-booking';
import type { Appointment } from '../../src/types';

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: 'a1',
  patientId: 'p1',
  doctorId: 'd1',
  facilityId: 'h1',
  department: 'Cardiology',
  date: '2026-10-19', // Monday
  time: '09:00',
  status: 'scheduled',
  reason: 'Follow-up',
  createdAt: '2026-10-17T08:00:00.000Z',
  ...over,
});

const doctor = (over: Partial<{ id: string; facilityId: string; availableDays: string[] }> = {}) => ({
  id: 'd1',
  facilityId: 'h1',
  availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  ...over,
});

describe('calendar helpers', () => {
  test('a real date parses, an impossible one does not', () => {
    expect(dateParts('2026-10-19')).toEqual({ y: 2026, m: 10, d: 19 });
    expect(dateParts('2026-02-31')).toBeNull();
    expect(dateParts('19-10-2026')).toBeNull();
    expect(dateParts('')).toBeNull();
  });

  test('weekdays are computed without timezone drift', () => {
    expect(weekdayOf('2026-10-19')).toBe('Mon');
    expect(weekdayOf('2026-10-18')).toBe('Sun');
    expect(weekdayOf('2026-02-31')).toBeNull();
  });

  test('adding days crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('today is a real ISO day', () => {
    expect(dateParts(todayIso(new Date(2026, 9, 17)))).toEqual({ y: 2026, m: 10, d: 17 });
  });

  test('times are canonicalised, and non-slots are rejected', () => {
    expect(normalizeTime('9:00')).toBe('09:00');
    expect(normalizeTime('09:30')).toBe('09:30');
    expect(normalizeTime('24:00')).toBeNull();
    expect(normalizeTime('night')).toBeNull();
  });
});

describe('doctor availability', () => {
  test('consulting days are normalised to weekday codes', () => {
    expect(normalizeAvailabilityDays(['Monday', 'tue', 'WED'])).toEqual(['Mon', 'Tue', 'Wed']);
    expect(normalizeAvailabilityDays(['nonsense'])).toEqual([]);
    expect(normalizeAvailabilityDays(undefined)).toEqual([]);
  });

  test('a doctor consults only on the configured weekdays', () => {
    expect(isDoctorAvailableOn(doctor(), '2026-10-19')).toBe(true);
    expect(isDoctorAvailableOn(doctor(), '2026-10-18')).toBe(false);
    expect(isDoctorAvailableOn({ availableDays: ['Sat'] }, '2026-10-17')).toBe(true);
  });

  test('a legacy doctor with no recorded days is not blocked', () => {
    expect(isDoctorAvailableOn({}, '2026-10-18')).toBe(true);
    expect(isDoctorAvailableOn(null, '2026-10-18')).toBe(true);
  });

  test('suggested dates are real consulting days, in order', () => {
    const dates = nextAvailableDates(doctor(), '2026-10-17', { horizonDays: 7, limit: 3 });
    expect(dates).toEqual(['2026-10-19', '2026-10-20', '2026-10-21']);
  });
});

describe('real slot availability', () => {
  test('every clinic slot is offered, and a stored booking takes its slot', () => {
    const slots = slotsForDoctor('d1', '2026-10-19', [appointment({ time: '10:00' })]);
    expect(slots.map(slot => slot.time)).toEqual([...APPOINTMENT_TIME_SLOTS]);
    expect(slots.find(slot => slot.time === '10:00')).toMatchObject({ available: false, appointmentId: 'a1' });
    expect(slots.find(slot => slot.time === '09:00')?.available).toBe(true);
  });

  test('a cancelled or completed visit frees the slot; another doctor never blocks it', () => {
    for (const status of ['cancelled', 'completed', 'missed'] as const) {
      const slots = slotsForDoctor('d1', '2026-10-19', [appointment({ status })]);
      expect(slots.find(slot => slot.time === '09:00')?.available).toBe(true);
    }
    const otherDoctor = slotsForDoctor('d1', '2026-10-19', [appointment({ doctorId: 'd2' })]);
    expect(otherDoctor.find(slot => slot.time === '09:00')?.available).toBe(true);
  });

  test('a slot held by an appointment occupies it only on its own date', () => {
    const held = appointment();
    expect(appointmentOccupiesSlot(held, 'd1', '2026-10-19', '9:00')).toBe(true);
    expect(appointmentOccupiesSlot(held, 'd1', '2026-10-20', '09:00')).toBe(false);
    expect(appointmentOccupiesSlot({ ...held, status: 'cancelled' }, 'd1', '2026-10-19', '09:00')).toBe(false);
  });

  test('rescheduling may keep the appointment’s own slot', () => {
    const slots = slotsForDoctor('d1', '2026-10-19', [appointment()], { excludeAppointmentId: 'a1' });
    expect(slots.find(slot => slot.time === '09:00')?.available).toBe(true);
  });
});

describe('booking request validation', () => {
  const base = {
    patient: { id: 'p1' },
    hospital: { id: 'h1', status: 'active' },
    doctor: doctor(),
    date: '2026-10-19',
    time: '10:00',
    reason: 'Chest pain review',
    appointments: [] as Appointment[],
    today: '2026-10-17',
  };

  test('a genuinely available request passes', () => {
    expect(validateBookingRequest(base)).toEqual([]);
  });

  test('a missing patient or doctor is refused', () => {
    expect(validateBookingRequest({ ...base, patient: null }).map(error => error.code)).toEqual(['patient_required']);
    expect(validateBookingRequest({ ...base, doctor: null }).map(error => error.code)).toEqual(['doctor_required']);
  });

  test('a doctor from another hospital is refused', () => {
    const errors = validateBookingRequest({ ...base, doctor: doctor({ facilityId: 'h2' }) });
    expect(errors.map(error => error.code)).toEqual(['doctor_not_in_hospital']);
  });

  test('an inactive hospital is refused', () => {
    const errors = validateBookingRequest({ ...base, hospital: { id: 'h1', status: 'suspended' } });
    expect(errors.map(error => error.code)).toContain('hospital_inactive');
  });

  test('a past or malformed date is refused', () => {
    expect(validateBookingRequest({ ...base, date: '2026-10-16' }).map(error => error.code)).toContain('past_date');
    expect(validateBookingRequest({ ...base, date: '2026-02-31' }).map(error => error.code)).toContain('invalid_date');
  });

  test('a time outside the clinic slots is refused', () => {
    expect(validateBookingRequest({ ...base, time: '03:00' }).map(error => error.code)).toContain('invalid_time');
    expect(validateBookingRequest({ ...base, time: '10:15' }).map(error => error.code)).toContain('invalid_time');
  });

  test('a non-consulting day is refused', () => {
    const errors = validateBookingRequest({ ...base, date: '2026-10-18', time: '10:00' });
    expect(errors.map(error => error.code)).toEqual(['doctor_unavailable']);
  });

  test('a slot already booked is refused, whatever the browser sends', () => {
    const errors = validateBookingRequest({
      ...base,
      appointments: [appointment({ time: '10:00' })],
    });
    expect(errors.map(error => error.code)).toEqual(['slot_taken']);
  });

  test('the reason for the visit is required, and bounded', () => {
    expect(validateBookingRequest({ ...base, reason: '   ' }).map(error => error.code)).toEqual(['reason_required']);
    expect(validateBookingRequest({ ...base, reason: 'x'.repeat(301) }).map(error => error.code)).toEqual(['reason_too_long']);
  });

  test('today itself is bookable — only a past day is refused', () => {
    // The clock, not the client, decides what “today” is.
    const saturdayDoctor = doctor({ availableDays: ['Sat'] });
    expect(
      validateBookingRequest({ ...base, doctor: saturdayDoctor, date: '2026-10-17', time: '10:00' }),
    ).toEqual([]);
    expect(
      validateBookingRequest({ ...base, doctor: saturdayDoctor, date: '2026-10-16', time: '10:00' }).map(e => e.code),
    ).toContain('past_date');
  });
});

describe('who may change an appointment', () => {
  const created = appointment({ bookedByUserId: 'ustaff-hw1', bookedByName: 'Suganthi M' });
  const actor = (over: Partial<AppointmentActor> = {}): AppointmentActor => ({
    userId: 'ustaff-hw1',
    name: 'Suganthi M',
    role: 'health_worker',
    hospitalId: 'h1',
    ...over,
  });

  test('the health worker who booked it can reschedule and cancel', () => {
    expect(appointmentRights(created, actor())).toEqual({ canReschedule: true, canCancel: true });
  });

  test('another health worker cannot', () => {
    expect(appointmentRights(created, actor({ userId: 'ustaff-hw2', hospitalId: 'h2' }))).toEqual({
      canReschedule: false,
      canCancel: false,
      refusal: 'forbidden',
    });
  });

  test('the hospital administrator and the assigned doctor can', () => {
    expect(appointmentRights(created, actor({ userId: 'ustaff-ha1', role: 'hospital_admin' })).canCancel).toBe(true);
    const assigned = actor({ userId: 'ustaff-doc1', role: 'doctor', doctorId: 'd1', hospitalId: undefined });
    const otherDoctor = actor({ userId: 'ustaff-doc2', role: 'doctor', doctorId: 'd2', hospitalId: undefined });
    expect(appointmentRights(created, assigned).canReschedule).toBe(true);
    expect(appointmentRights(created, otherDoctor).canCancel).toBe(false);
  });

  test('a patient may cancel their own visit, not reschedule it', () => {
    expect(appointmentRights(created, { patientId: 'p1', role: 'patient' })).toEqual({
      canReschedule: false,
      canCancel: true,
    });
  });

  test('a completed, missed or cancelled appointment is closed to changes', () => {
    for (const status of ['completed', 'missed', 'cancelled'] as const) {
      expect(appointmentRights({ ...created, status }, actor())).toEqual({
        canReschedule: false,
        canCancel: false,
        refusal: 'closed',
      });
    }
  });
});

describe('references, audit and labels', () => {
  test('appointment references increase within the year', () => {
    expect(nextAppointmentReference([], new Date(2026, 9, 17))).toBe('APT-2026-000001');
    expect(
      nextAppointmentReference(
        [
          appointment({ appointmentId: 'APT-2026-000041' }),
          appointment({ id: 'a2', appointmentId: 'APT-2025-000099' }),
          appointment({ id: 'a3' }),
        ],
        new Date(2026, 9, 17),
      ),
    ).toBe('APT-2026-000042');
  });

  test('a history entry records who, what changed and when', () => {
    const entry = appointmentHistoryEntry({
      action: 'rescheduled',
      actor: { userId: 'ustaff-hw1', name: 'Suganthi M', role: 'health_worker' },
      at: '2026-10-17T10:00:00.000Z',
      fromDate: '2026-10-19',
      fromTime: '09:00',
      toDate: '2026-10-20',
      toTime: '10:00',
      reason: 'Patient asked for a later slot',
    });
    expect(entry).toMatchObject({
      action: 'rescheduled',
      byName: 'Suganthi M',
      fromDate: '2026-10-19',
      toDate: '2026-10-20',
      reason: 'Patient asked for a later slot',
    });
  });

  test('status/arrival labels are translated keys, not raw enums', () => {
    expect(appointmentStatusLabelKey('confirmed')).toBe('statusConfirmed');
    expect(appointmentStatusLabelKey('in_progress')).toBe('inProgress');
    expect(appointmentArrivalLabelKey(appointment({ status: 'completed' }))).toBe('patientArrived');
    expect(appointmentArrivalLabelKey(appointment({ status: 'scheduled' }))).toBe('awaitingArrival');
  });

  test('timestamps read as day + time', () => {
    expect(formatAppointmentTime('2026-10-17T10:42:00.000Z')).toBe('2026-10-17 10:42');
    expect(formatAppointmentTime('2026-10-17')).toBe('2026-10-17');
  });
});
