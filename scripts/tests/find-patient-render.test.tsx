/**
 * Render smoke tests for the "Find Existing Patient" surfaces — run with: bun test
 *
 * Executes the real presentational components through react-dom/server with the
 * REAL translation hook, so a broken hook, a bad import or a crashing row fails
 * here instead of producing a blank dashboard. Nothing is stubbed, so this file
 * cannot disturb any other test.
 *
 * It pins the workflow and its states:
 *   • the search field carries the exact label, placeholder and button the
 *     workflow asks for;
 *   • every failure state (invalid id, no match, not authorized) is shown in the
 *     selected language, and the no-match text says a search never registers a
 *     patient;
 *   • the verified record shows the patient's identifiers, details and the
 *     ORIGINAL registering health worker — and offers the edit action only to a
 *     role that may use it;
 *   • the save outcome and the audit trail are readable: who, when, which field,
 *     previous value → new value, reason.
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
import {
  FindPatientWorkflow,
  PatientEditForm,
  PatientEditHistoryList,
  PatientEditResultBanner,
  PatientLookupField,
  PatientLookupStatus,
  PatientVerificationCard,
  editDraftFrom,
  editFormFrom,
  formatEditTime,
} from '../../src/components/patients/FindPatientPanel';
import type { PatientLookup } from '../../src/hooks/use-patient-registry';
import type { Patient, PatientEditEntry } from '../../src/types';

/**
 * The language store (and its persisted preference) is process-global and Bun
 * runs every test file in one process, so both are put back to their untouched
 * default after every test.
 */
function restoreLanguage(): void {
  resetLanguageStoreForTests();
  try {
    localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  } catch {
    /* no DOM in this run — the in-memory reset above is enough */
  }
  resetLanguageStoreForTests();
}

afterEach(restoreLanguage);
afterAll(restoreLanguage);

/** Patient p7, registered by Health Worker A. */
const patient: Patient = {
  id: 'p7',
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
  district: 'Madurai',
  state: 'Tamil Nadu',
  bloodGroup: 'O+',
  emergencyContact: '9876500000',
  allergies: ['Penicillin'],
  chronicConditions: ['Diabetes'],
  registeredByFacilityId: 'h1',
  registeredByUserId: 'uhw-1',
  registeredByName: 'Health Worker A',
  registeredByRole: 'health_worker',
  recordVersion: 1,
  lastEditedAt: '2026-10-15T09:20:00.000Z',
  lastEditedByName: 'Health Worker B',
  editHistory: [
    {
      id: 'pe-1',
      patientId: 'p7',
      healthCardId: 'HC-2026-0007',
      editedAt: '2026-10-15T09:20:00.000Z',
      editedByUserId: 'uhw-2',
      editedByName: 'Health Worker B',
      editedByRole: 'health_worker',
      editedByFacilityId: 'h1',
      reason: 'family gave a new mobile number',
      previousVersion: 0,
      newVersion: 1,
      changes: [{ field: 'phone', from: '9876543210', to: '9000011111' }],
    },
  ],
  createdAt: '2026-09-20',
};

const entry: PatientEditEntry = patient.editHistory![0]!;

const counts = { vitals: 3, reports: 1, referrals: 2, appointments: 1 };

const lookup = (over: Partial<PatientLookup>): PatientLookup => ({
  state: 'idle',
  patient: null,
  canEdit: false,
  editHistory: [],
  offline: false,
  ...over,
});

const noop = () => {};

describe('search field', () => {
  test('carries the required label, placeholder and button', () => {
    const html = renderToString(
      <PatientLookupField value="" onChange={noop} onSubmit={noop} isSearching={false} />,
    );
    expect(html).toContain(t('patientIdLabel', 'en'));
    expect(html).toContain('placeholder="Enter Patient ID"');
    expect(html).toContain(t('searchPatient', 'en'));
    // The field is labelled for assistive technology too.
    expect(html).toContain('for="patient-lookup-code"');
  });

  test('shows a busy state while the lookup runs', () => {
    const html = renderToString(
      <PatientLookupField value="p7" onChange={noop} onSubmit={noop} isSearching />,
    );
    expect(html).toContain(t('searchingPatient', 'en'));
    expect(html).toContain('disabled');
  });
});

describe('lookup states', () => {
  test('an idle panel explains what to type', () => {
    const html = renderToString(<PatientLookupStatus lookup={lookup({ state: 'idle' })} />);
    expect(html).toContain(t('patientLookupIdle', 'en'));
  });

  test('no match says so, and that searching never registers a patient', () => {
    const html = renderToString(<PatientLookupStatus lookup={lookup({ state: 'not_found' })} />);
    expect(html).toContain(t('patientNotFoundTitle', 'en'));
    expect(html).toContain(t('patientNotFoundHint', 'en'));
    expect(html).toContain('never registers a new patient');
    expect(html).not.toContain('patientNotFoundTitle');
  });

  test('a mistyped id, and a role without lookup rights, are distinguished', () => {
    const invalid = renderToString(<PatientLookupStatus lookup={lookup({ state: 'invalid' })} />);
    expect(invalid).toContain(t('patientIdInvalidTitle', 'en'));
    expect(invalid).not.toContain(t('patientNotFoundTitle', 'en'));

    const denied = renderToString(<PatientLookupStatus lookup={lookup({ state: 'forbidden' })} />);
    expect(denied).toContain(t('patientAccessDeniedTitle', 'en'));
    expect(denied).toContain(t('patientAccessDeniedHint', 'en'));
  });

  test('the states follow the selected language', () => {
    for (const language of ['ta', 'hi'] as Language[]) {
      applyLanguage(language);
      const html = renderToString(<PatientLookupStatus lookup={lookup({ state: 'not_found' })} />);
      expect(html).toContain(t('patientNotFoundTitle', language));
      expect(html).not.toContain('No matching patient');
      const isTargetScript = language === 'ta' ? /[\u0B80-\u0BFF]/ : /[\u0900-\u097F]/;
      expect(isTargetScript.test(html)).toBe(true);
      expect(getLanguageSnapshot()).toBe(language);
    }
  });
});

describe('verified patient record', () => {
  const card = (over: Partial<Parameters<typeof PatientVerificationCard>[0]> = {}) =>
    renderToString(
      <PatientVerificationCard
        patient={patient}
        canEdit
        accessSource="facility_register"
        offline={false}
        counts={counts}
        onEdit={noop}
        {...over}
      />,
    );

  test('shows the identifiers, the details and the original registrar', () => {
    const html = card();

    for (const expected of [
      t('patientVerifiedTitle', 'en'),
      'Lakshmi Devi',
      'P7',                      // the immutable Patient ID
      'HC-2026-0007',            // the health card
      '62',
      t('genderFemale', 'en'),
      '9876543210',
      'Kallikudi',
      'O+',
      t('registeredByLabel', 'en'),
      'Health Worker A',         // the ORIGINAL registrant …
      'Health Worker B',         // … kept separate from the editor
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).toContain(t('identityImmutableNotice', 'en'));
  });

  test('shows the linked clinical records the edit does not touch', () => {
    const html = card();
    expect(html).toContain(t('linkedRecordsTitle', 'en'));
    expect(html).toContain(t('linkedRecordsLine', 'en', { vitals: 3, reports: 1, referrals: 2, appointments: 1 }));
  });

  test('offers the edit action only to a role that may use it', () => {
    expect(card({ canEdit: true })).toContain(t('editPatientDetails', 'en'));
    const readOnly = card({ canEdit: false });
    expect(readOnly).not.toContain(t('editPatientDetails', 'en'));
    expect(readOnly).toContain(t('patientEditPermissionDenied', 'en'));
  });

  test('an offline answer is labelled as this device’s cached register', () => {
    expect(card({ offline: true })).toContain(t('patientLookupOffline', 'en'));
    expect(card()).not.toContain(t('patientLookupOffline', 'en'));
  });
});

describe('edit form', () => {
  test('offers every permitted field and hides the immutable ones', () => {
    const html = renderToString(
      <PatientEditForm patient={patient} onSave={async () => ({ ok: true, message: 'ok' })} onCancel={noop} isSaving={false} />,
    );
    for (const key of ['name', 'ageLabel', 'gender', 'phone', 'address', 'villageLabel', 'districtLabel', 'stateLabel', 'bloodGroup', 'aadhaar', 'emergencyContact', 'allergies', 'conditions'] as const) {
      expect(html).toContain(t(key, 'en'));
    }
    expect(html).toContain(t('saveChanges', 'en'));
    expect(html).toContain(t('changeReasonLabel', 'en'));
    // Patient ID and Health Card ID are not editable inputs.
    expect(html).not.toContain('id="patient-edit-healthCardId"');
    expect(html).not.toContain('id="patient-edit-id"');
  });

  test('the form round-trips the record and produces the patch', () => {
    const form = editFormFrom(patient);
    expect(form.name).toBe('Lakshmi Devi');
    expect(form.allergies).toBe('Penicillin');
    expect(form.chronicConditions).toBe('Diabetes');

    const { draft, reason } = editDraftFrom({ ...form, phone: '9000011111', allergies: 'Penicillin, Sulfa', reason: 'phone changed' });
    expect(reason).toBe('phone changed');
    expect(draft.phone).toBe('9000011111');
    expect(draft.allergies).toEqual(['Penicillin', 'Sulfa']);
    expect(draft.age).toBe('62');
  });

  test('a save is confirmed, and an offline save says it syncs later', () => {
    const saved = renderToString(<PatientEditResultBanner result={{ ok: true, message: 'Patient details updated.' }} />);
    expect(saved).toContain(t('patientSavedTitle', 'en'));
    expect(saved).toContain('Patient details updated.');

    const offline = renderToString(
      <PatientEditResultBanner result={{ ok: true, offline: true, message: 'saved' }} />,
    );
    expect(offline).toContain(t('patientSavedOffline', 'en'));
    expect(offline).toContain('no duplicate patient is created');
  });

  test('a concurrent edit is reported instead of silently overwriting', () => {
    const html = renderToString(
      <PatientEditResultBanner result={{ ok: false, conflict: true, message: 'stale' }} onReload={noop} />,
    );
    expect(html).toContain(t('patientConflictTitle', 'en'));
    expect(html).toContain(t('patientConflictHint', 'en'));
    expect(html).toContain(t('reloadRecord', 'en'));
  });
});

describe('audit history', () => {
  test('reads as who / when / which field / previous → new value / reason', () => {
    const html = renderToString(<PatientEditHistoryList history={[entry]} />);

    expect(html).toContain(t('editHistoryTitle', 'en'));
    expect(html).toContain(t('editHistoryActor', 'en', { name: 'Health Worker B', time: '2026-10-15 09:20' }));
    expect(html).toContain(
      t('changedFromTo', 'en', { field: t('phone', 'en'), from: '9876543210', to: '9000011111' }),
    );
    expect(html).toContain(t('editHistoryReason', 'en', { reason: 'family gave a new mobile number' }));
  });

  test('a cleared value is shown as not recorded rather than blank', () => {
    const cleared: PatientEditEntry = {
      ...entry,
      id: 'pe-2',
      changes: [{ field: 'emergencyContact', from: '9876500000', to: '' }],
    };
    const html = renderToString(<PatientEditHistoryList history={[cleared]} />);
    expect(html).toContain(
      t('changedFromTo', 'en', { field: t('emergencyContact', 'en'), from: '9876500000', to: t('emptyValue', 'en') }),
    );
  });

  test('a record that was never edited says so', () => {
    const html = renderToString(<PatientEditHistoryList history={[]} />);
    expect(html).toContain(t('editHistoryEmpty', 'en'));
  });

  test('a timestamp is formatted for reading', () => {
    expect(formatEditTime('2026-10-15T09:20:00.000Z')).toBe('2026-10-15 09:20');
    expect(formatEditTime('2026-10-15')).toBe('2026-10-15');
  });
});

describe('the workflow as a whole', () => {
  const workflow = (state: PatientLookup) => (
    <FindPatientWorkflow
      lookup={state}
      isSaving={false}
      recordCounts={() => counts}
      onSearch={noop}
      onSave={async () => ({ ok: true, message: 'ok' })}
      onReset={noop}
    />
  );

  test('shows the search step and the whole path, in the selected language', () => {
    applyLanguage('ta');
    const html = renderToString(workflow(lookup({ state: 'idle' })));

    expect(html).toContain(t('findExistingPatient', 'ta'));
    expect(html).toContain(t('patientIdLabel', 'ta'));
    expect(html).toContain(t('patientIdPlaceholder', 'ta'));
    expect(html).toContain(t('searchPatient', 'ta'));
    expect(html).not.toContain('findExistingPatient');
    // The workflow runs search → verify → edit → save, and the steps are named.
    expect(html).toContain(t('patientVerifiedTitle', 'ta'));
    expect(html).toContain(t('editPatientDetails', 'ta'));
    expect(html).toContain(t('saveChanges', 'ta'));
  });

  test('a found patient is verified and offered for editing', () => {
    applyLanguage('en');
    const html = renderToString(workflow(lookup({ state: 'found', patient, canEdit: true, editHistory: [entry] })));
    expect(html).toContain(t('patientVerifiedTitle', 'en'));
    expect(html).toContain(t('editPatientDetails', 'en'));
    expect(html).toContain(t('editHistoryTitle', 'en'));
    expect(html).toContain('Health Worker A');
  });

  test('a failed lookup offers no verification card and no edit action', () => {
    applyLanguage('en');
    const html = renderToString(workflow(lookup({ state: 'not_found' })));
    expect(html).toContain(t('patientNotFoundTitle', 'en'));
    // Nothing to verify and nothing to edit: no record card, no edit form and
    // no audit trail are rendered for a lookup that found nobody. (The step
    // strip still names the workflow itself.)
    expect(html).not.toContain('data-slot="patient-verified-card"');
    expect(html).not.toContain('data-slot="patient-edit-form"');
    expect(html).not.toContain('data-slot="patient-edit-history"');
    expect(html).not.toContain(t('linkedRecordsTitle', 'en'));
    expect(html).not.toContain('HC-2026-0007');
  });

  test('a found record shows the verified card, not the failure states', () => {
    applyLanguage('en');
    const html = renderToString(workflow(lookup({ state: 'found', patient, canEdit: true, editHistory: [entry] })));
    expect(html).toContain('data-slot="patient-verified-card"');
    expect(html).toContain('data-slot="patient-edit-history"');
    expect(html).not.toContain(t('patientNotFoundTitle', 'en'));
    expect(html).not.toContain(t('patientNotFoundHint', 'en'));
  });
});
