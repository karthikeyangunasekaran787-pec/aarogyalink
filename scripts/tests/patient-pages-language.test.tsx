/**
 * Temporary render smoke test for the patient pages rewritten in this pass.
 *
 * Also asserts the acceptance criterion for distances: the number shown for a
 * hospital is computed from the PATIENT's own location, so the same facility
 * shows a different distance (and a different nearest-first order) for two
 * patients in different villages.
 */
import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { t, type Language } from '../../src/lib/i18n';
import { coordsForPlace, coordsForPlaceIn, distanceToFacilityKm, formatDistanceKm } from '../../src/lib/geo';
import { applyLanguage, getLanguageSnapshot, resetLanguageStoreForTests } from '../../src/lib/language-store';
import { LANGUAGE_PREFERENCE_KEY } from '../../src/lib/language-preference';

// Mutable on purpose: each test signs in a patient living somewhere else, which
// is exactly what must move the distances.
let stubPatient = {
  id: 'p1',
  name: 'Lakshmi Devi',
  healthCardId: 'HC-2026-0001',
  village: 'Alangudi',
  district: 'Pudukkottai',
};

// No coordinates on these stubs: the facility's own village must be enough to
// resolve a position, which is the same fallback the real (created) hospitals
// rely on.
const stubFacilities = [
  {
    id: 'h1', name: 'Alangudi Primary Health Centre', village: 'Alangudi', district: 'Pudukkottai',
    phone: '0452-1', address: 'Main Road', careMatchScore: 82, departments: ['General'],
    type: 'phc' as const, specialistsAvailable: 2, emergencyAvailable: true,
    latitude: 0, longitude: 0, state: 'Tamil Nadu', totalBeds: 30, occupiedBeds: 18,
    diagnosticsAvailable: [], medicinesAvailable: [], averageWaitTime: 30, rating: 4,
  },
  {
    id: 'h2', name: 'Usilampatti Government Hospital', village: 'Usilampatti', district: 'Madurai',
    phone: '0452-2', address: 'Hospital Road', careMatchScore: 74, departments: ['General'],
    type: 'dh' as const, specialistsAvailable: 5, emergencyAvailable: true,
    latitude: 0, longitude: 0, state: 'Tamil Nadu', totalBeds: 60, occupiedBeds: 41,
    diagnosticsAvailable: [], medicinesAvailable: [], averageWaitTime: 35, rating: 4,
  },
];

mock.module('../../src/contexts/AppContext', () => ({
  // The real provider publishes the store language here; the stub must too,
  // otherwise pages that take the `t(key, language)` route would silently read
  // the default and look untranslated.
  useApp: () => ({ currentUser: { id: 'u-p1', name: 'Lakshmi Devi', role: 'patient', patientId: 'p1' }, isOffline: false, language: getLanguageSnapshot() }),
}));

mock.module('../../src/contexts/DataContext', () => ({
  useData: () => ({
    patients: [stubPatient],
    medicineStock: [{ id: 'm1', medicineName: 'Paracetamol', facilityName: 'PHC Alangudi', status: 'in_stock', quantity: 120, unit: 'tablets', expiryDate: '2027-01-31' }],
    diagnostics: [{ id: 'd1', name: 'Blood Sugar', facilityName: 'PHC Alangudi', category: 'Lab', available: true, waitTime: 2, cost: 100 }],
    doctors: [{ id: 'doc1', name: 'Dr. Arun Kumar', specialization: 'Cardiology', experience: 12, consultationFee: 200, rating: 4.5, facilityId: 'h1' }],
    facilities: stubFacilities,
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

describe('facility distances come from the patient’s own location', () => {
  const renderFacilities = async () => {
    const { default: Facilities } = await import('../../src/pages/patient/Facilities');
    return renderToString(
      <MemoryRouter initialEntries={['/patient/facilities']}>
        <Facilities />
      </MemoryRouter>,
    );
  };

  test('the distance shown is the distance from the patient’s registered village', async () => {
    applyLanguage('en');
    stubPatient = { ...stubPatient, village: 'Kallikudi', district: 'Madurai' };
    const html = await renderFacilities();

    // Stated plainly, so a patient can tell what the number measures from.
    expect(html).toContain(t('distanceFromPlace', 'en', { place: 'Kallikudi' }));

    // The same computation the page performs, from the patient's village.
    const expected = formatDistanceKm(
      distanceToFacilityKm(coordsForPlace('Kallikudi'), stubFacilities[0]),
    );
    expect(expected).toBe('55 km');
    expect(html).toContain(expected);
  });

  test('moving the patient changes the distance and the nearest-first order', async () => {
    applyLanguage('en');

    stubPatient = { ...stubPatient, village: 'Kallikudi', district: 'Madurai' };
    const fromKallikudi = await renderFacilities();

    stubPatient = { ...stubPatient, village: 'Alangudi', district: 'Pudukkottai' };
    const fromAlangudi = await renderFacilities();

    // Distances are not a constant in the markup: the same facility reads
    // differently for the two patients.
    // Mirror the patient record: the district is part of where they live, and
    // "Alangudi" exists in more than one district.
    const kallikudiToH2 = formatDistanceKm(distanceToFacilityKm(coordsForPlaceIn('Madurai', 'Kallikudi'), stubFacilities[1]));
    const alangudiToH2 = formatDistanceKm(distanceToFacilityKm(coordsForPlaceIn('Pudukkottai', 'Alangudi'), stubFacilities[1]));
    expect(kallikudiToH2).not.toBe(alangudiToH2);
    expect(fromKallikudi).toContain(kallikudiToH2);
    expect(fromAlangudi).toContain(alangudiToH2);

    // Nearest first is relative to the patient: Usilampatti's hospital is the
    // closer one from Kallikudi, while Alangudi sits next to its own PHC.
    expect(fromKallikudi.indexOf('Usilampatti Government Hospital'))
      .toBeLessThan(fromKallikudi.indexOf('Alangudi Primary Health Centre'));
    expect(fromAlangudi.indexOf('Alangudi Primary Health Centre'))
      .toBeLessThan(fromAlangudi.indexOf('Usilampatti Government Hospital'));
  });

  test('the facility type filter is one aligned, equally wide segmented control', async () => {
    applyLanguage('en');
    stubPatient = { ...stubPatient, village: 'Kallikudi', district: 'Madurai' };
    const html = await renderFacilities();

    expect(html).toContain('role="radiogroup"');
    const segments = html.split('role="radio"').slice(1);
    // All, PHC, CHC, DH, Medical College.
    expect(segments.length).toBe(5);
    for (const segment of segments) {
      // Same width rule in every segment, which is what keeps the row aligned.
      expect(segment).toContain('flex-1');
      expect(segment).toContain('items-center');
    }
    // Exactly one segment is selected.
    expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1);
  });

  test('an unresolvable location says so instead of inventing a distance', async () => {
    applyLanguage('en');
    stubPatient = { ...stubPatient, village: 'Nowhereville', district: 'Unmapped District' };
    const html = await renderFacilities();

    expect(html).toContain(t('distanceUnavailable', 'en'));
    // No fabricated kilometre figure for a facility whose distance is unknown.
    expect(html).not.toContain(formatDistanceKm(0));
  });
});
