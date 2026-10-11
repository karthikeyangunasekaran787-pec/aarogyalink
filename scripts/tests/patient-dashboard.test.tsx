/**
 * Patient dashboard — run with: bun test
 *
 * Renders the real PatientHome component through react-dom/server for English,
 * Tamil and Hindi, so the things that could silently regress are pinned:
 *
 *   - the page follows the selected language (the reported bug: "only some
 *     parts of the page change"),
 *   - an unlinked account sees the notice, never another patient's data,
 *   - sections with no records show the agreed empty states instead of
 *     invented vitals, referrals or statistics,
 *   - a real referral shows its real status and the next step in the real
 *     workflow.
 *
 * Expected strings are derived from the dictionaries rather than retyped, so
 * the test cannot drift from the translations.
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { t, type Language } from '../../src/lib/i18n';

// ── Test fixtures ──────────────────────────────────────────────────────────
const PATIENT = {
  id: 'p1',
  userId: 'u-p1',
  healthCardId: 'HC-2026-0001',
  registeredByEmail: 'lakshmi@example.com',
  registeredAt: '2026-03-04',
  name: 'Lakshmi Devi',
  age: 48,
  gender: 'female',
  phone: '9840100009',
  address: '12 Bazaar Street',
  village: 'Alangudi',
  district: 'Pudukkottai',
  state: 'Tamil Nadu',
  bloodGroup: 'B+',
  emergencyContact: '9840100010',
  allergies: ['Penicillin'],
  chronicConditions: ['Type 2 Diabetes'],
  registeredByFacilityId: 'h1',
};

const REFERRAL = {
  id: 'r1',
  referralId: 'REF-2026-001',
  patientId: 'p1',
  patientName: 'Lakshmi Devi',
  sourceFacilityId: 'h1',
  sourceFacilityName: 'Alangudi Primary Health Centre',
  destinationFacilityId: 'h2',
  destinationFacilityName: 'Pudukkottai Government Hospital',
  department: 'Cardiology',
  priority: 'urgent',
  reason: 'Chest pain on exertion',
  status: 'doctor_assigned',
  currentStep: 3,
  totalSteps: 9,
  createdAt: '2026-09-20',
  updatedAt: '2026-09-21',
  isOverdue: false,
};

const APPOINTMENT = {
  id: 'a1',
  patientId: 'p1',
  doctorId: 'd1',
  facilityId: 'h2',
  department: 'Cardiology',
  date: '2026-10-25',
  time: '10:30',
  status: 'scheduled',
  reason: 'Follow-up review',
  createdAt: '2026-09-22',
};

const REPORT = {
  id: 'rep1',
  reportId: 'RPT-2026-000001',
  patientId: 'p1',
  healthCardId: 'HC-2026-0001',
  title: 'Chest X-Ray',
  type: 'imaging',
  reportDate: '2026-09-22',
  uploadedAt: '2026-09-23',
  uploadedBy: 'Suganthi M',
  facilityName: 'Alangudi Primary Health Centre',
  fileName: 'xray.pdf',
  mimeType: 'application/pdf',
  createdAt: '2026-09-23',
  updatedAt: '2026-09-23',
};

// ── Module doubles ─────────────────────────────────────────────────────────
let language: Language = 'en';
let linked = true;
/** Records passed to the page. Empty by default so empty states are exercised. */
let data: {
  referrals: unknown[];
  appointments: unknown[];
  reports: unknown[];
  vitals: unknown[];
} = { referrals: [], appointments: [], reports: [], vitals: [] };

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({
    currentUser: linked ? { id: 'u-p1', name: PATIENT.name, role: 'patient', patientId: 'p1' } : null,
    isOffline: false,
    language,
  }),
}));

mock.module('../../src/contexts/DataContext', () => ({
  useData: () => ({
    patients: linked ? [PATIENT] : [],
    referrals: data.referrals,
    appointments: data.appointments,
    facilities: [{ id: 'h1', name: 'Alangudi Primary Health Centre' }],
    hospitals: [{ id: 'h2', name: 'Pudukkottai Government Hospital' }],
    getReferralsForPatient: (patientId: string) =>
      (data.referrals as { patientId: string }[]).filter(r => r.patientId === patientId),
    getReportsForPatient: (patientId: string) =>
      (data.reports as { patientId: string }[]).filter(r => r.patientId === patientId),
    getVitalsForPatient: (patientId: string) =>
      (data.vitals as { patientId: string }[]).filter(v => v.patientId === patientId),
    getFacilityById: (id: string) => (id === 'h1' ? { id, name: 'Alangudi Primary Health Centre' } : undefined),
    getDoctorById: (id: string) => (id === 'd1' ? { id, name: 'Dr. Arun Kumar' } : undefined),
  }),
}));

const { default: PatientHome } = await import('../../src/pages/patient/Home');

const render = () =>
  renderToString(
    <MemoryRouter initialEntries={['/patient/dashboard']}>
      <PatientHome />
    </MemoryRouter>,
  );

const reset = () => {
  language = 'en';
  linked = true;
  data = { referrals: [], appointments: [], reports: [], vitals: [] };
};

describe('patient dashboard follows the selected language', () => {
  const LANGS: Language[] = ['en', 'ta', 'hi'];

  test('every language renders its own welcome and section headings', () => {
    for (const lang of LANGS) {
      reset();
      language = lang;
      const html = render();

      expect(html).toContain(t('welcomeBackName', lang, { name: 'Lakshmi' }));
      expect(html).toContain(t('patientSummary', lang));
      expect(html).toContain(t('myHealthCard', lang));
      expect(html).toContain(t('myReferrals', lang));
      expect(html).toContain(t('myReports', lang));
      expect(html).toContain(t('upcomingAppointments', lang));
      expect(html).toContain(t('myProfile', lang));
      // The Health Card id is an identifier — never translated.
      expect(html).toContain(PATIENT.healthCardId);
      expect(html).toContain('Lakshmi Devi');
    }
  });

  test('a translated page never leaks the English wording or a raw key', () => {
    for (const lang of ['ta', 'hi'] as Language[]) {
      reset();
      language = lang;
      const html = render();
      for (const key of ['welcomeBackName', 'myReferrals', 'noReferralsYet', 'patientSummary'] as const) {
        expect(html).not.toContain(key);
      }
      expect(html).not.toContain('Welcome back');
      expect(html).not.toContain('Your health at a glance');
    }
  });

  test('switching back to English restores the English page', () => {
    reset();
    language = 'ta';
    expect(render()).toContain(t('myReports', 'ta'));
    language = 'en';
    const html = render();
    expect(html).toContain(t('myReports', 'en'));
    expect(html).not.toContain(t('myReports', 'ta'));
  });
});

describe('empty states instead of invented data', () => {
  test('no referrals, appointments or reports shows the agreed empty states', () => {
    for (const lang of ['en', 'ta', 'hi'] as Language[]) {
      reset();
      language = lang;
      const html = render();
      expect(html).toContain(t('noReferralsYet', lang));
      expect(html).toContain(t('noReferralsHint', lang));
      expect(html).toContain(t('noAppointmentsYet', lang));
      expect(html).toContain(t('noReportsYet', lang));
      expect(html).toContain(t('noReportsHint', lang));
    }
  });

  test('no vitals recorded means no vitals card at all', () => {
    reset();
    const html = render();
    expect(html).not.toContain(t('latestVitals', 'en'));
    // The old dashboard hard-coded 152/95, 88, 96% and 145 for every patient.
    for (const invented of ['152', '95', '145']) {
      expect(html).not.toContain(`>${invented}<`);
    }
  });

  test('an unlinked account sees the notice, not another patient record', () => {
    reset();
    linked = false;
    const html = render();
    expect(html).toContain(t('unlinkedTitle', 'en'));
    expect(html).not.toContain(PATIENT.healthCardId);
    expect(html).not.toContain(PATIENT.name);
  });
});

describe('real records are shown as stored', () => {
  test('a referral shows its destination, status and real next step', () => {
    reset();
    data.referrals = [REFERRAL];
    const html = render();
    expect(html).toContain('Pudukkottai Government Hospital');
    // Status comes from the stored value, translated.
    expect(html).toContain(t('doctorAssigned', 'en'));
    // No next step beyond DOCTOR_ASSIGNED is claimed, and it is not shown as done.
    expect(html).toContain(t('scheduled', 'en'));
    expect(html).not.toContain(t('closed', 'en'));
    expect(html).not.toContain(t('noReferralsYet', 'en'));
  });

  test('the referral status is translated in Tamil and Hindi too', () => {
    reset();
    data.referrals = [REFERRAL];
    language = 'ta';
    expect(render()).toContain(t('doctorAssigned', 'ta'));
    language = 'hi';
    expect(render()).toContain(t('doctorAssigned', 'hi'));
  });

  test('appointments show the real date, time and doctor', () => {
    reset();
    data.appointments = [APPOINTMENT];
    const html = render();
    expect(html).toContain('10:30');
    expect(html).toContain('Cardiology');
    expect(html).toContain('Dr. Arun Kumar');
    expect(html).not.toContain(t('noAppointmentsYet', 'en'));
  });

  test('reports are listed newest first and linked to the report page', () => {
    reset();
    data.reports = [
      { ...REPORT, id: 'rep2', title: 'Blood Panel', reportDate: '2026-10-01' },
      REPORT,
    ];
    const html = render();
    expect(html).toContain('Blood Panel');
    expect(html).toContain('Chest X-Ray');
    expect(html).toContain('/patient/reports');
    // getReportsForPatient sorts newest first — the page must not re-sort it back.
    expect(html.indexOf('Blood Panel')).toBeLessThan(html.indexOf('Chest X-Ray'));
  });

  test('vitals are shown only from a recorded reading', () => {
    reset();
    data.vitals = [{ id: 'v1', patientId: 'p1', date: '2026-09-24', heartRate: 88 }];
    const html = render();
    expect(html).toContain(t('latestVitals', 'en'));
    expect(html).toContain('88');
  });
});

// Bun's module mocks are process-global: leaving this file's AppContext stub in
// place would break any later test file that drives the REAL provider.
afterAll(() => { mock.restore(); });
