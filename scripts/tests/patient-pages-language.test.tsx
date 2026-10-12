/** Temporary render smoke test for the patient pages rewritten in this pass. */
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { t, type Language } from '../../src/lib/i18n';
import { applyLanguage, getLanguageSnapshot, resetLanguageStoreForTests } from '../../src/lib/language-store';
import { LANGUAGE_PREFERENCE_KEY } from '../../src/lib/language-preference';

const PATIENT = { id: 'p1', name: 'Lakshmi Devi', healthCardId: 'HC-2026-0001', village: 'Alangudi', district: 'Pudukkottai' };

mock.module('../../src/contexts/AppContext', () => ({
  // The real provider publishes the store language here; the stub must too,
  // otherwise pages that take the `t(key, language)` route would silently read
  // the default and look untranslated.
  useApp: () => ({ currentUser: { id: 'u-p1', name: PATIENT.name, role: 'patient', patientId: 'p1' }, isOffline: false, language: getLanguageSnapshot() }),
}));

mock.module('../../src/contexts/DataContext', () => ({
  useData: () => ({
    patients: [PATIENT],
    medicineStock: [{ id: 'm1', medicineName: 'Paracetamol', facilityName: 'PHC Alangudi', status: 'in_stock', quantity: 120, unit: 'tablets', expiryDate: '2027-01-31' }],
    diagnostics: [{ id: 'd1', name: 'Blood Sugar', facilityName: 'PHC Alangudi', category: 'Lab', available: true, waitTime: 2, cost: 100 }],
    doctors: [{ id: 'doc1', name: 'Dr. Arun Kumar', specialization: 'Cardiology', experience: 12, consultationFee: 200, rating: 4.5, facilityId: 'h1' }],
    facilities: [{ id: 'h1', name: 'Alangudi Primary Health Centre', village: 'Alangudi', district: 'Pudukkottai', phone: '0452-1', address: 'Main Road', careMatchScore: 82, departments: ['General'], type: 'phc', specialistsAvailable: 2, emergencyAvailable: true, distanceKm: 3 }],
    hospitals: [{ id: 'h1', name: 'Alangudi Government Hospital', district: 'Pudukkottai', phone: '0452-2' }],
    healthRecords: [],
    consultations: [],
    referrals: [],
    appointments: [],
    followups: [],
    vitals: [],
    getConsultationsForPatient: () => [],
    bookAppointment: () => {},
    addNotification: () => {},
  }),
}));

/**
 * The language store and its persisted preference are process-global, and Bun
 * runs every test file in one process. Leaving either at Tamil/Hindi would make
 * the next file render in the wrong language, so both are put back to their
 * untouched default after every test (this file's assertions are all within one
 * test, and the store is re-seeded at the start of each).
 */
function restoreLanguage(): void {
  resetLanguageStoreForTests();
  try {
    // localStorage only exists once a sibling file has registered the DOM.
    localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    /* no DOM in this run — the in-memory reset above is enough */
  }
  resetLanguageStoreForTests();
}

afterEach(restoreLanguage);
afterAll(restoreLanguage);

const pages = [
  { name: 'Medicines', path: '../../src/pages/patient/Medicines' },
  { name: 'Diagnostics', path: '../../src/pages/patient/Diagnostics' },
  { name: 'Timeline', path: '../../src/pages/patient/Timeline' },
  { name: 'Followups', path: '../../src/pages/patient/Followups' },
  { name: 'Privacy', path: '../../src/pages/patient/Privacy' },
  { name: 'BookAppointment', path: '../../src/pages/patient/BookAppointment' },
  { name: 'Facilities', path: '../../src/pages/patient/Facilities' },
] as const;

describe('rewritten patient pages render and follow the language', () => {
  for (const page of pages) {
    test(`${page.name}: en -> ta -> hi, translated, no raw key`, async () => {
      const { default: Component } = await import(page.path);
      for (const lang of ['en', 'ta', 'hi'] as Language[]) {
        resetLanguageStoreForTests();
        applyLanguage(lang);
        const html = renderToString(
          <MemoryRouter initialEntries={['/patient/dashboard']}>
            <Component />
          </MemoryRouter>,
        );
        expect(html.length).toBeGreaterThan(200);
        // No raw translation key leaked into the page.
        expect(html).not.toContain('medicinesSubtitle');
        expect(html).not.toContain('privacySubtitle');
        expect(html).not.toContain('bookingSubtitle');
        if (lang !== 'en') {
          // Something on the page must be in the selected script.
          const hasScript = lang === 'ta' ? /[\u0B80-\u0BFF]/.test(html) : /[\u0900-\u097F]/.test(html);
          expect(hasScript).toBe(true);
        }
      }
    });
  }

  test('the booking flow labels come from the dictionary in Tamil', async () => {
    resetLanguageStoreForTests();
    applyLanguage('ta');
    const { default: BookAppointment } = await import('../../src/pages/patient/BookAppointment');
    const html = renderToString(
      <MemoryRouter initialEntries={['/patient/dashboard']}>
        <BookAppointment />
      </MemoryRouter>,
    );
    expect(html).toContain(t('selectHospitalFacility', 'ta'));
    expect(html).not.toContain('Select Hospital / Facility');
  });

  test('a deep link to a bookable location lists its doctors, in Tamil', async () => {
    resetLanguageStoreForTests();
    applyLanguage('ta');
    const { default: BookAppointment } = await import('../../src/pages/patient/BookAppointment');
    const html = renderToString(
      <MemoryRouter initialEntries={['/patient/book-appointment?facility=h1']}>
        <BookAppointment />
      </MemoryRouter>,
    );
    // The deep link pre-selects the location, so the doctor step is reachable
    // and its heading and doctor list are translated.
    expect(html).toContain(t('selectDoctor', 'ta'));
    expect(html).toContain('Dr. Arun Kumar');
    expect(html).not.toContain('Select Doctor');
  });

  test('the privacy centre labels come from the dictionary in Hindi', async () => {
    resetLanguageStoreForTests();
    applyLanguage('hi');
    const { default: Privacy } = await import('../../src/pages/patient/Privacy');
    const html = renderToString(
      <MemoryRouter initialEntries={['/patient/dashboard']}>
        <Privacy />
      </MemoryRouter>,
    );
    expect(html).toContain(t('yourDataRights', 'hi'));
    expect(html).not.toContain('Your Data Rights');
  });
});
