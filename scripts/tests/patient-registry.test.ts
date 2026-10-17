/**
 * Patient ID lookup and cross-health-worker edits — run with: bun test
 *
 * The scenarios the feature must get right, checked against the shared rules
 * (src/lib/patient-record.ts) and the backend authorization policy
 * (src/convex/authz.ts):
 *
 *   • a patient is found by Patient ID OR Health Card ID, from any health
 *     worker, and a search never creates a record
 *   • only demographic/contact fields can change — Patient ID, Health Card ID
 *     and the ORIGINAL registration stay attached to the record
 *   • an edit is recorded with who/when/which fields/previous+new value/reason
 *   • a stale edit is refused instead of overwriting a colleague's newer one
 *   • a hospital can neither read nor write a patient outside its scope
 */
import { describe, expect, test } from 'bun:test';

import {
  MAX_PATIENT_EDIT_HISTORY,
  changedPatientValues,
  findPatientByCode,
  isPlausiblePatientCode,
  normalizePatientCode,
  patientEditHistoryOf,
  patientEditVersionOf,
  patientMatchesCode,
  planPatientEdit,
  validatePatientDraft,
} from '../../src/lib/patient-record';
import { mergeAuthorizedWrite, scopeItemsForRead, type SessionScope } from '../../src/convex/authz';
import type { Patient } from '../../src/types';

const NOW = '2026-10-15T09:20:00.000Z';

/** Patient p7, registered by Health Worker A at hospital h1. */
const registeredByA = (over: Partial<Patient> = {}): Patient => ({
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
  recordVersion: 0,
  createdAt: '2026-09-20',
  ...over,
});

/** Health Worker B, at the SAME facility (a colleague, not the registrar). */
const workerB = { userId: 'uhw-2', name: 'Health Worker B', role: 'health_worker', facilityId: 'h1' };

const edit = (patient: Patient, draft: Parameters<typeof planPatientEdit>[0]['draft'], extra: Partial<Parameters<typeof planPatientEdit>[0]> = {}) =>
  planPatientEdit({ patient, draft, actor: workerB, now: NOW, entryId: 'pe-1', ...extra });

describe('Patient ID lookup', () => {
  test('the same record answers to its Patient ID and to its Health Card ID', () => {
    const patient = registeredByA();
    for (const code of ['p7', 'P7', ' p7 ', 'HC-2026-0007', 'hc-2026-0007']) {
      expect(patientMatchesCode(patient, code)).toBe(true);
      expect(findPatientByCode([patient], code)?.id).toBe('p7');
    }
    expect(normalizePatientCode(' hc-2026-0007 ')).toBe('HC-2026-0007');
  });

  test('a lookup returns the EXISTING record and creates nothing', () => {
    const patients = [registeredByA(), registeredByA({ id: 'p8', healthCardId: 'HC-2026-0008', name: 'Murugan' })];
    const before = patients.length;
    expect(findPatientByCode(patients, 'p8')?.name).toBe('Murugan');
    expect(findPatientByCode(patients, 'p999')).toBeUndefined();
    expect(patients.length).toBe(before);
    // …and a search is a pure read: the record it found is the same object.
    expect(findPatientByCode(patients, 'P8')).toBe(patients[1]);
  });

  test('a mistyped code is rejected before anyone is looked up', () => {
    for (const junk of ['', '   ', 'ZZZ', 'P7!', 'x'.repeat(40)]) {
      expect(isPlausiblePatientCode(junk)).toBe(false);
    }
    // Real ids, however they are typed, stay usable — including a stray space,
    // which is normalized away rather than treated as a different patient.
    for (const ok of ['p1', 'P12', 'HC-2026-0001', 'hc-2026-0001', 'p 7 8']) {
      expect(isPlausiblePatientCode(ok)).toBe(true);
    }
    expect(normalizePatientCode('p 7 8')).toBe('P78');
  });
});

describe('permitted demographic edit', () => {
  test('a colleague at the same facility corrects the contact details', () => {
    const plan = edit(registeredByA(), { phone: '9000011111', village: 'Alangudi', address: '5 New Street' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.patient.phone).toBe('9000011111');
    expect(plan.patient.village).toBe('Alangudi');
    expect(plan.changes.map(change => change.field).sort()).toEqual(['address', 'phone', 'village']);
  });

  test('the registering health worker stays on the record, and B is the editor', () => {
    const plan = edit(registeredByA(), { name: 'Lakshmi Devi M' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.patient.registeredByName).toBe('Health Worker A');
    expect(plan.patient.registeredByUserId).toBe('uhw-1');
    expect(plan.patient.registeredByFacilityId).toBe('h1');
    expect(plan.patient.lastEditedByName).toBe('Health Worker B');
    expect(plan.patient.lastEditedByUserId).toBe('uhw-2');
    expect(plan.patient.lastEditedAt).toBe(NOW);
  });

  test('identity stays immutable through an edit', () => {
    const plan = edit(registeredByA(), { name: 'Someone Else' });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    expect(plan.patient.id).toBe('p7');
    expect(plan.patient.healthCardId).toBe('HC-2026-0007');
    expect(plan.patient.registeredByEmail).toBe('lakshmi.devi@patient.aarogyalink.in');
    expect(plan.patient.registeredAt).toBe('2026-09-20');
    expect(plan.patient.createdAt).toBe('2026-09-20');
  });

  test('a patch cannot smuggle an identity field in', () => {
    const errors = validatePatientDraft(registeredByA(), {
      name: 'Lakshmi Devi',
      // A crafted caller trying to reassign the health card or the registrar.
      ...({ healthCardId: 'HC-2026-9999', registeredByName: 'Impostor' } as object),
    });
    expect(errors.map(error => error.code)).toContain('not_editable');
    expect(errors.every(error => error.field === 'immutable' || error.field === 'name')).toBe(true);
  });

  test('values are validated, and every problem is reported at once', () => {
    const errors = validatePatientDraft(registeredByA(), {
      name: '   ',
      age: '150',
      gender: 'unknown',
      phone: '12',
      aadhaarLast4: '123',
      bloodGroup: 'ZZ',
    });
    const fields = errors.map(error => error.field).sort();
    expect(fields).toEqual(['aadhaarLast4', 'age', 'bloodGroup', 'gender', 'name', 'phone']);
    expect(validatePatientDraft(registeredByA(), { age: 41 }).length).toBe(0);
    expect(validatePatientDraft(registeredByA(), { emergencyContact: '' }).length).toBe(0);
  });

  test('an edit that changes nothing is refused, so no empty audit entry is written', () => {
    const plan = edit(registeredByA(), { name: 'Lakshmi Devi', phone: '9876543210' });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.errors[0]?.code).toBe('no_changes');

    const blank = edit(registeredByA(), {});
    expect(blank.ok).toBe(false);
  });

  test('repeatable fields are normalized (trimmed, deduped, empty dropped)', () => {
    const plan = edit(registeredByA(), {
      allergies: [' Penicillin ', 'penicillin', '', 'Sulfa'],
      chronicConditions: ['None'],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.patient.allergies).toEqual(['Penicillin', 'Sulfa']);
    expect(plan.patient.chronicConditions).toEqual([]);
  });

  test('a change of an array field is recorded as readable from/to text', () => {
    const changes = changedPatientValues(registeredByA(), { allergies: ['Penicillin', 'Sulfa'] });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: 'allergies', from: 'Penicillin', to: 'Penicillin, Sulfa' });
  });
});

describe('audit history', () => {
  test('each accepted edit records who, when, what and why', () => {
    const first = edit(registeredByA(), { phone: '9000011111' }, { reason: 'patient changed number', entryId: 'pe-1' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const entry = first.patient.editHistory?.[0];
    expect(entry).toBeDefined();
    expect(entry?.patientId).toBe('p7');
    expect(entry?.healthCardId).toBe('HC-2026-0007');
    expect(entry?.editedAt).toBe(NOW);
    expect(entry?.editedByName).toBe('Health Worker B');
    expect(entry?.editedByUserId).toBe('uhw-2');
    expect(entry?.editedByRole).toBe('health_worker');
    expect(entry?.reason).toBe('patient changed number');
    expect(entry?.previousVersion).toBe(0);
    expect(entry?.newVersion).toBe(1);
    expect(entry?.changes).toEqual([{ field: 'phone', from: '9876543210', to: '9000011111' }]);
  });

  test('the trail is append-only and reads newest first', () => {
    const first = edit(registeredByA(), { phone: '9000011111' }, { entryId: 'pe-1' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = edit(first.patient, { village: 'Alangudi' }, {
      entryId: 'pe-2',
      now: '2026-10-16T08:00:00.000Z',
      expectedVersion: 1,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.patient.editHistory).toHaveLength(2);
    const history = patientEditHistoryOf(second.patient);
    expect(history.map(entry => entry.id)).toEqual(['pe-2', 'pe-1']);
    // The first edit is still recorded exactly as it was written.
    expect(history[1]?.changes).toEqual([{ field: 'phone', from: '9876543210', to: '9000011111' }]);
    expect(second.patient.recordVersion).toBe(2);
  });

  test('the trail cannot grow without bound', () => {
    let patient = registeredByA();
    for (let i = 0; i < MAX_PATIENT_EDIT_HISTORY + 5; i += 1) {
      const plan = edit(patient, { phone: `900001${String(1000 + i)}` }, { entryId: `pe-${i}` });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      patient = plan.patient;
    }
    expect(patient.editHistory).toHaveLength(MAX_PATIENT_EDIT_HISTORY);
  });
});

describe('concurrent edits', () => {
  test('a save from a stale copy is refused, not applied', () => {
    const newer = registeredByA({ phone: '9000011111', recordVersion: 1, lastEditedByName: 'Health Worker B' });
    const plan = edit(newer, { phone: '9000099999' }, { expectedVersion: 0 });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.errors[0]?.code).toBe('stale');
  });

  test('a device that has not yet seen the newer edit cannot roll the record back', () => {
    const stored = [registeredByA({ phone: '9000011111', recordVersion: 1 })];
    const stalePush = [registeredByA({ phone: '9876543210', recordVersion: 0 })];
    const scope: SessionScope = { kind: 'hospital', hospitalId: 'h1', staffUserId: 'uhw-2' };

    const merged = mergeAuthorizedWrite('patients', stored, stalePush, scope) as Patient[];
    expect(merged).toHaveLength(1);
    expect(merged[0]?.phone).toBe('9000011111');
    expect(merged[0]?.recordVersion).toBe(1);
  });

  test('the newer of two whole-collection writes wins', () => {
    const stored = [registeredByA({ phone: '9000011111', recordVersion: 1 })];
    const freshPush = [registeredByA({ phone: '9000022222', recordVersion: 2 })];
    const scope: SessionScope = { kind: 'hospital', hospitalId: 'h1', staffUserId: 'uhw-2' };

    const merged = mergeAuthorizedWrite('patients', stored, freshPush, scope) as Patient[];
    expect(merged[0]?.phone).toBe('9000022222');
    expect(patientEditVersionOf(merged[0]!)).toBe(2);
  });
});

describe('facility and district isolation', () => {
  const hospitalH1: SessionScope = { kind: 'hospital', hospitalId: 'h1' };
  const hospitalH3: SessionScope = { kind: 'hospital', hospitalId: 'h3' };
  const districtMadurai: SessionScope = { kind: 'district', districtId: 'DIST-MDU', districtName: 'Madurai' };

  test('another facility neither reads nor writes the patient', () => {
    const patients = [registeredByA()];
    expect(scopeItemsForRead('patients', patients, hospitalH3, {})).toEqual([]);
    expect(scopeItemsForRead('patients', patients, hospitalH1, {})).toHaveLength(1);

    const hijack = mergeAuthorizedWrite(
      'patients',
      patients,
      [registeredByA({ name: 'HIJACKED', registeredByFacilityId: 'h3' })],
      hospitalH3,
    ) as Patient[];
    expect(hijack[0]?.name).toBe('Lakshmi Devi');
    expect(hijack[0]?.registeredByFacilityId).toBe('h1');
  });

  test('a hospital outside the district receives nothing from it', () => {
    const hospitals = [{ id: 'h1', district: 'Madurai', districtId: 'DIST-MDU' }, { id: 'h9', district: 'Salem', districtId: 'DIST-SLM' }];
    const patients = [registeredByA(), registeredByA({ id: 'p9', healthCardId: 'HC-2026-0009', registeredByFacilityId: 'h9' })];
    const visible = scopeItemsForRead('patients', patients, districtMadurai, { hospitals }) as Patient[];
    expect(visible.map(patient => patient.id)).toEqual(['p7']);
  });

  test('patients with no facility link stay shared reference data', () => {
    const seeded = registeredByA({ id: 'p1', healthCardId: 'HC-2026-0001', registeredByFacilityId: undefined });
    expect(scopeItemsForRead('patients', [seeded], hospitalH3, {})).toHaveLength(1);
  });
});
