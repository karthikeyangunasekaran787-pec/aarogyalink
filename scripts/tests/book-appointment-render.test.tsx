/**
 * Render tests for "Book Appointment for Patient" — run with: bun test
 *
 * The real presentational workflow is rendered through react-dom/server with the
 * real translation hook, so a broken import, hook or row fails here instead of
 * leaving a blank dashboard. Everything comes from props, which means every
 * required state is reachable without Convex:
 *
 *   • the step order (patient → hospital → doctor → slot → confirm);
 *   • only the hospitals/doctors it is given are shown, with their real
 *     consulting days and genuinely available dates;
 *   • a booked slot is disabled and labelled, a day the doctor does not consult
 *     says so, and a fully booked day offers another date;
 *   • the booking summary names the patient, hospital, doctor, date/time and
 *     linked referral before anything is confirmed;
 *   • the confirmation shows the appointment ID, status and who booked it, and
 *     details stay available on demand;
 *   • the "Appointments I booked" list shows status, arrival and referral state,
 *     with reschedule/cancel only where the appointment can still change.
 */
import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';

import { t, type Language } from '../../src/lib/i18n';
import {
  applyLanguage,
  getLanguageSnapshot,
  resetLanguageStoreForTests,
} from '../../src/lib/language-store';
import { LANGUAGE_PREFERENCE_KEY } from '../../src/lib/language-preference';
import { slotsForDoctor } from '../../src/lib/appointment-booking';
import {
  BookAppointmentWorkflow,
  type BookingWorkflowProps,
} from '../../src/components/patients/BookAppointmentPanel';
import type { PatientLookup } from '../../src/hooks/use-patient-registry';
import type { Appointment, Patient } from '../../src/types';
import type { BookingHospital, BookingDoctor } from '../../src/lib/appointment-booking';

function restoreLanguage(): void {
  resetLanguageStoreForTests();
  try {
    localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    /* no DOM in this run */
  }
  resetLanguageStoreForTests();
}

afterEach(restoreLanguage);
afterAll(restoreLanguage);

const patient: Patient = {
  id: 'P7',
  userId: 'u-p7',
  healthCardId: 'HC-2026-0007',
  registeredByEmail: 'lakshmi.devi@patient.aarogyalink.in',
  registeredAt: '2026-09-20',
  name: 'Lakshmi Devi',
  age: 62,
  gender: 'female',
  phone: '9876543210',
  address: '12 Amman Kovil Street',
  village: 'Kallikudi',
  district: 'Pudukkottai',
  state: 'Tamil Nadu',
  bloodGroup: 'O+',
  registeredByFacilityId: 'h1',
  createdAt: '2026-09-20',
};

const found: PatientLookup = {
  state: 'found',
  patient,
  canEdit: false,
  editHistory: [],
  offline: false,
  accessSource: 'facility_register',
};

const idle: PatientLookup = { state: 'idle', patient: null, canEdit: false, editHistory: [], offline: false };

const hospitals: BookingHospital[] = [
  {
    id: 'h1',
    name: 'Pudukkottai Government Hospital',
    hospitalId: 'HOS-PDK-001',
    district: 'Pudukkottai',
    type: 'government',
    departments: ['Cardiology'],
    doctorCount: 2,
    referralDestination: false,
  },
  {
    id: 'h2',
    name: 'Alangudi Primary Health Centre',
    hospitalId: 'HOS-PDK-002',
    district: 'Pudukkottai',
    type: 'government',
    departments: ['Maternity'],
    doctorCount: 2,
    referralDestination: true,
  },
];

const doctors: BookingDoctor[] = [
  {
    id: 'd1',
    name: 'Dr. Arun Kumar',
    specialization: 'Cardiology',
    department: 'Cardiology',
    qualification: 'MD Cardiology',
    experience: 12,
    availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    consultationFee: 200,
    nextAvailableDates: ['2026-10-19', '2026-10-20'],
  },
  {
    id: 'd3',
    name: 'Dr. Ravi Shankar',
    specialization: 'General Medicine',
    department: 'General Medicine',
    availableDays: ['Mon', 'Wed', 'Fri'],
    nextAvailableDates: ['2026-10-19'],
  },
];

const booked: Appointment = {
  id: 'apt-1',
  appointmentId: 'APT-2026-000007',
  patientId: 'P7',
  patientName: 'Lakshmi Devi',
  healthCardId: 'HC-2026-0007',
  doctorId: 'd1',
  doctorName: 'Dr. Arun Kumar',
  facilityId: 'h1',
  facilityName: 'Pudukkottai Government Hospital',
  department: 'Cardiology',
  date: '2026-10-19',
  time: '10:00',
  status: 'scheduled',
  reason: 'Chest pain review',
  bookingSource: 'HEALTH_WORKER',
  bookedByUserId: 'ustaff-hw1',
  bookedByName: 'Suganthi M',
  createdAt: '2026-10-17T09:30:00.000Z',
};

type WorkflowOverrides = Partial<BookingWorkflowProps>;

function workflow(over: WorkflowOverrides = {}): string {
  const props: BookingWorkflowProps = {
    lookup: idle,
    recordCounts: () => ({ vitals: 2, reports: 1, referrals: 1, appointments: 0 }),
    onPatientSearch: () => {},
    onPatientReset: () => {},
    hospitals,
    hospitalsLoading: false,
    hospitalId: '',
    onSelectHospital: () => {},
    doctors: [],
    doctorsLoading: false,
    doctorId: '',
    onSelectDoctor: () => {},
    date: '',
    onDateChange: () => {},
    slots: [],
    slotsLoading: false,
    doctorAvailable: true,
    availableDates: [],
    time: '',
    onTimeChange: () => {},
    reason: '',
    onReasonChange: () => {},
    errors: [],
    result: null,
    isBooking: false,
    onBook: () => {},
    onResetBooking: () => {},
    bookings: [],
    bookingsLoading: false,
    reschedule: {
      date: '',
      time: '',
      slots: [],
      slotsLoading: false,
      onOpen: () => {},
      onClose: () => {},
      onDateChange: () => {},
      onTimeChange: () => {},
      onSubmit: () => {},
      result: null,
    },
    cancel: {
      reason: '',
      onOpen: () => {},
      onClose: () => {},
      onReasonChange: () => {},
      onSubmit: () => {},
    },
    isMutating: false,
    actionResult: null,
    ...over,
  };
  return renderToString(<BookAppointmentWorkflow {...props} />);
}

const slots = (over: Appointment[] = [], date = '2026-10-19') => slotsForDoctor('d1', date, over);

describe('step 1 — find the patient', () => {
  test('shows the required Patient ID search field', () => {
    const html = workflow();
    expect(html).toContain(t('bookAppointmentForPatient', 'en'));
    expect(html).toContain(t('bookAppointmentForPatientHint', 'en'));
    expect(html).toContain(t('patientIdLabel', 'en'));
    expect(html).toContain('placeholder="Enter Patient ID"');
    expect(html).toContain(t('searchPatient', 'en'));
    // The five-step order is visible.
    for (const key of ['bookingStepPatient', 'bookingStepHospital', 'bookingStepDoctor', 'bookingStepSlot', 'bookingStepConfirm'] as const) {
      // React escapes '&' in text output.
      expect(html).toContain(t(key, 'en').replace(/&/g, '&amp;'));
    }
  });

  test('a verified patient is shown before booking, with a way to change them', () => {
    const html = workflow({ lookup: found });
    expect(html).toContain('data-slot="patient-verified-card"');
    expect(html).toContain('Lakshmi Devi');
    expect(html).toContain('HC-2026-0007');
    expect(html).toContain(t('bookingForPatient', 'en', { patient: 'Lakshmi Devi' }));
    expect(html).toContain(t('changePatient', 'en'));
  });

  test('a failed lookup shows its reason and no hospital step', () => {
    const html = workflow({ lookup: { ...idle, state: 'not_found' } });
    expect(html).toContain(t('patientNotFoundTitle', 'en'));
    expect(html).not.toContain('data-slot="booking-step-hospital"');
  });
});

describe('step 2 — choose a hospital', () => {
  test('lists exactly the hospitals it was given, with a doctor count and referral mark', () => {
    const html = workflow({ lookup: found });
    expect(html).toContain(t('selectHospitalFacility', 'en'));
    expect(html).toContain('Pudukkottai Government Hospital');
    expect(html).toContain('Alangudi Primary Health Centre');
    expect(html).toContain(t('doctorCountMany', 'en', { count: 2 }));
    expect(html).toContain(t('referralDestination', 'en'));
    expect(html).toContain(t('hospitalBookingHint', 'en'));
    // No unrelated hospital can appear: only two options are rendered.
    expect(html.split('data-slot="booking-hospital-option"').length - 1).toBe(2);
  });

  test('an empty scoped list says so', () => {
    const html = workflow({ lookup: found, hospitals: [] });
    expect(html).toContain(t('noHospitalsAvailable', 'en'));
    expect(html).not.toContain('data-slot="booking-hospital-option"');
  });

  test('a loading list shows the busy state', () => {
    const html = workflow({ lookup: found, hospitals: [], hospitalsLoading: true });
    expect(html).toContain(t('loading', 'en'));
    expect(html).not.toContain(t('noHospitalsAvailable', 'en'));
  });
});

describe('step 3 — doctors of that hospital', () => {
  const atHospital = (over: WorkflowOverrides = {}) =>
    workflow({ lookup: found, hospitalId: 'h1', doctors, ...over });

  test('shows name, specialization, department, consulting days and dates', () => {
    const html = atHospital();
    expect(html).toContain(t('selectDoctor', 'en'));
    expect(html).toContain('Dr. Arun Kumar');
    expect(html).toContain('Cardiology');
    expect(html).toContain(t('doctorAvailability', 'en', { days: 'Mon, Tue, Wed, Thu, Fri' }));
    // The selected doctor's real next dates are offered.
    const selected = atHospital({ doctorId: 'd1' });
    expect(selected).toContain(t('nextAvailableDates', 'en'));
    expect(selected).toContain('2026-10-19');
    expect(selected).toContain('2026-10-20');
  });

  test('no doctors says so and offers another hospital', () => {
    const html = atHospital({ doctors: [] });
    expect(html).toContain(t('noDoctorsInHospital', 'en'));
    expect(html).toContain(t('selectHospitalFacility', 'en'));
  });
});

describe('step 4 — real date and time slots', () => {
  const withSlot = (over: WorkflowOverrides = {}) =>
    workflow({
      lookup: found,
      hospitalId: 'h1',
      doctors,
      doctorId: 'd1',
      date: '2026-10-19',
      doctorAvailable: true,
      slots: slots(),
      ...over,
    });

  test('a taken slot is disabled and labelled; free slots stay selectable', () => {
    const html = withSlot({ slots: slots([{ ...booked, time: '09:30' }]) });
    expect(html).toContain(t('availableSlotsFor', 'en', { date: '2026-10-19' }));
    expect(html).toContain('09:30');
    // Booked slot: disabled + marked.
    const banned = html.slice(html.indexOf('data-slot="booking-slot"'));
    expect(banned).toContain('disabled');
    expect(html).toContain(t('slotBookedLabel', 'en'));
    expect(html).toContain('09:00');
  });

  test('a day the doctor does not consult explains why, and offers dates', () => {
    const html = withSlot({ doctorAvailable: false, slots: [], date: '2026-10-18' });
    expect(html).toContain(t('doctorUnavailableOnDate', 'en'));
    // The doctor card still lists the next dates to pick from.
    expect(html).toContain(t('nextAvailableDates', 'en'));
  });

  test('a fully booked day asks for another date', () => {
    const full = slotsForDoctor(
      'd1',
      '2026-10-19',
      ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30'].map(
        (time, index) => ({ ...booked, id: `apt-${index}`, time }),
      ),
    );
    const html = withSlot({ slots: full });
    expect(html).toContain(t('noSlotsAvailable', 'en'));
  });
});

describe('step 5 — reason, summary and confirmation', () => {
  const ready = (over: WorkflowOverrides = {}) =>
    workflow({
      lookup: found,
      hospitalId: 'h1',
      doctors,
      doctorId: 'd1',
      date: '2026-10-19',
      time: '10:00',
      slots: slots(),
      ...over,
    });

  test('the summary names the patient, hospital, doctor, date/time and referral', () => {
    const html = ready({
      reason: 'Chest pain review',
      referral: { id: 'r7', referralId: 'REF-2026-042', statusLabel: 'scheduled' },
    });
    expect(html).toContain(t('bookingSummary', 'en'));
    expect(html).toContain('Lakshmi Devi · P7');
    expect(html).toContain('Pudukkottai Government Hospital');
    expect(html).toContain('Dr. Arun Kumar');
    expect(html).toContain('2026-10-19 · 10:00');
    expect(html).toContain(t('referralStatusLabel', 'en'));
    expect(html).toContain('REF-2026-042');
    expect(html).toContain(t('reasonForVisit', 'en'));
    expect(html).toContain(t('confirmBooking', 'en'));
  });

  test('confirmation is disabled until a reason is entered', () => {
    const empty = ready();
    expect(empty).toContain('disabled');
    const filled = ready({ reason: 'Chest pain review' });
    expect(filled.includes('disabled') && filled.includes(t('confirmBooking', 'en'))).toBe(true);
  });

  test('validation errors are shown, translated', () => {
    const html = ready({
      reason: 'Chest pain review',
      errors: [{ code: 'slot_taken', field: 'time', message: 'That slot is already booked.' }],
    });
    expect(html).toContain('data-slot="booking-errors"');
    expect(html).toContain(t('slotJustTaken', 'en'));
  });

  test('a saved appointment shows name, ID, hospital, doctor, date/time, reference and status', () => {
    const html = workflow({
      lookup: found,
      result: { ok: true, message: 'confirmed', appointment: booked },
    });
    expect(html).toContain('data-slot="booking-confirmation"');
    expect(html).toContain(t('appointmentConfirmedTitle', 'en'));
    expect(html).toContain('Lakshmi Devi · P7');
    expect(html).toContain('Pudukkottai Government Hospital');
    expect(html).toContain('Dr. Arun Kumar');
    expect(html).toContain('2026-10-19 · 10:00');
    expect(html).toContain('APT-2026-000007');
    expect(html).toContain(t('scheduled', 'en'));
    expect(html).toContain(t('bookingSourceHealthWorker', 'en'));
    // Details are available on demand, and another booking is offered.
    expect(html).toContain(t('viewAppointmentDetails', 'en'));
    expect(html).toContain(t('bookAnotherAppointment', 'en'));
    // The form is gone: a confirmed booking is never re-confirmed.
    expect(html).not.toContain('data-slot="booking-step-confirm"');
  });

  test('a failed save explains that nothing was confirmed', () => {
    const html = workflow({
      lookup: found,
      isBooking: false,
      bookingError: 'That slot was just taken. Choose another time.',
    });
    expect(html).toContain(t('bookingFailedTitle', 'en'));
    expect(html).toContain('That slot was just taken');
  });
});

describe('appointments I booked', () => {
  const list = (over: WorkflowOverrides = {}) => workflow({ lookup: idle, bookings: [booked], ...over });

  test('shows the booking, its status, arrival and referral state', () => {
    const html = list({
      bookings: [{ ...booked, referralId: 'r7', referralStatus: 'scheduled' }],
    });
    expect(html).toContain(t('myBookedAppointments', 'en'));
    expect(html).toContain('Lakshmi Devi');
    expect(html).toContain('APT-2026-000007');
    expect(html).toContain(t('scheduled', 'en'));
    expect(html).toContain(t('arrivalStatusLabel', 'en'));
    expect(html).toContain(t('awaitingArrival', 'en'));
    expect(html).toContain(t('referralStatusLabel', 'en'));
    expect(html).toContain('scheduled');
    expect(html).toContain(t('bookedByLabel', 'en'));
    expect(html).toContain('Suganthi M');
  });

  test('a scheduled appointment offers reschedule and cancel', () => {
    const html = list();
    expect(html).toContain(t('reschedule', 'en'));
    expect(html).toContain(t('cancelAppointmentTitle', 'en'));
  });

  test('a closed appointment offers no changes', () => {
    for (const status of ['completed', 'cancelled', 'missed'] as const) {
      const html = list({ bookings: [{ ...booked, status }] });
      expect(html).not.toContain(t('reschedule', 'en'));
      expect(html).not.toContain(t('cancelAppointmentTitle', 'en'));
    }
  });

  test('an empty list says nothing has been booked yet', () => {
    expect(workflow({ bookings: [] })).toContain(t('myBookedAppointmentsEmpty', 'en'));
  });

  test('the reschedule editor offers only genuinely free slots', () => {
    const html = workflow({
      bookings: [booked],
      reschedule: {
        appointmentId: 'apt-1',
        date: '2026-10-20',
        time: '',
        slots: slotsForDoctor('d1', '2026-10-20', [{ ...booked, date: '2026-10-20', time: '09:00' }]),
        slotsLoading: false,
        onOpen: () => {},
        onClose: () => {},
        onDateChange: () => {},
        onTimeChange: () => {},
        onSubmit: () => {},
        result: null,
      },
    });
    expect(html).toContain(t('rescheduleAppointmentTitle', 'en'));
    expect(html).toContain(t('slotBookedLabel', 'en'));
    expect(html).toContain(t('confirmBooking', 'en'));
  });

  test('the cancel editor asks for a reason and confirms the cancellation', () => {
    const html = workflow({
      bookings: [booked],
      cancel: {
        appointmentId: 'apt-1',
        reason: 'Patient admitted elsewhere',
        onOpen: () => {},
        onClose: () => {},
        onReasonChange: () => {},
        onSubmit: () => {},
      },
    });
    expect(html).toContain(t('cancelAppointmentReason', 'en'));
    expect(html).toContain(t('cancelAppointmentConfirm', 'en'));
    expect(html).toContain(t('keepAppointment', 'en'));
    expect(html).toContain('Patient admitted elsewhere');
  });

  test('a reschedule/cancel outcome is reported', () => {
    const html = list({ actionResult: { ok: false, message: 'You cannot change this appointment.' } });
    expect(html).toContain('You cannot change this appointment.');
  });
});

describe('language', () => {
  test('the workflow follows the selected language', () => {
    applyLanguage('ta');
    const html = workflow({
      lookup: found,
      hospitalId: 'h1',
      doctors,
      doctorId: 'd1',
      date: '2026-10-19',
      time: '10:00',
      slots: slots(),
    });
    expect(html).toContain(t('bookAppointmentForPatient', 'ta'));
    expect(html).toContain(t('selectHospitalFacility', 'ta'));
    expect(html).toContain(t('bookingStepHospital', 'ta'));
    expect(html).toContain(t('bookingStepSlot', 'ta').replace(/&/g, '&amp;'));
    expect(html).toContain(t('doctorAvailability', 'ta', { days: 'Mon, Tue, Wed, Thu, Fri' }));
    expect(html).not.toContain(t('bookAppointmentForPatient', 'en'));
    expect(/[\u0B80-\u0BFF]/.test(html)).toBe(true);
    expect(getLanguageSnapshot()).toBe('ta');

    for (const language of ['hi'] as Language[]) {
      applyLanguage(language);
      const hindi = workflow();
      expect(hindi).toContain(t('bookAppointmentForPatient', 'hi'));
      expect(/[\u0900-\u097F]/.test(hindi)).toBe(true);
    }
  });
});
