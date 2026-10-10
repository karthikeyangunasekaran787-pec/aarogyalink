/**
 * Tests for the medical-report workflow added on top of the existing policy —
 * run with: bun test
 *
 * Two layers are pinned here:
 *
 *   1. src/convex/authz.ts — the report collection must behave exactly like the
 *      other clinical collections (patient-linked, never cross-hospital) and
 *      `authorizedPatientIdsForHospital` must include walk-in scan grants.
 *   2. the client-side contract — the Health Card QR carries a REFERENCE only,
 *      the login form pre-fills nothing, and the retired circular-network logo
 *      files are gone.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  authorizedPatientIdsForHospital,
  mergeAuthorizedWrite,
  scopeItemsForRead,
  type SessionScope,
} from '../../src/convex/authz';
import {
  HEALTH_CARD_QR_PREFIX,
  healthCardQrPayload,
  parseHealthCardQr,
  reportTypeLabel,
} from '../../src/lib/health-card';

const hospitalA: SessionScope = { kind: 'hospital', hospitalId: 'h1', staffUserId: 'ustaff-1' };
const patientX: SessionScope = { kind: 'patient', patientId: 'p1' };

const patients = [
  { id: 'p1', name: 'Patient One', registeredByFacilityId: 'h1' },
  { id: 'p2', name: 'Patient Two', registeredByFacilityId: 'h2' },
];

const reports = [
  { id: 'mr1', reportId: 'RPT-2026-000001', patientId: 'p1', hospitalId: 'h1', title: 'Blood Test', type: 'lab_report' },
  { id: 'mr2', reportId: 'RPT-2026-000002', patientId: 'p2', hospitalId: 'h2', title: 'Chest X-Ray', type: 'imaging' },
];

const ids = (list: unknown[]) => (list as { id: string }[]).map(r => r.id).sort();

describe('medical report scoping', () => {
  test('a patient reads only their own reports', () => {
    expect(ids(scopeItemsForRead('medicalReports', reports, patientX) as unknown[])).toEqual(['mr1']);
  });

  test('a hospital reads reports for the patients it is authorized for', () => {
    const visiblePatients = scopeItemsForRead('patients', patients, hospitalA, {}) as unknown[];
    const read = scopeItemsForRead('medicalReports', reports, hospitalA, { patients: visiblePatients }) as unknown[];
    expect(ids(read)).toEqual(['mr1']);
  });

  test('reports uploaded elsewhere still follow the patient link (history travels)', () => {
    // mr3 was uploaded by a PHC (h2) but belongs to a patient the receiving
    // hospital h1 can see — the doctor must see previous reports after
    // authorization, wherever they were uploaded.
    const elsewhere = [
      ...reports,
      { id: 'mr3', reportId: 'RPT-2026-000003', patientId: 'p2', hospitalId: 'h2', title: 'Prescription', type: 'prescription' },
    ];
    // h1 may see p2 because of the referral, so p2's history travels with them.
    const visiblePatients = scopeItemsForRead('patients', patients, hospitalA, {
      referrals: [{ id: 'r1', patientId: 'p2', sourceFacilityId: 'h2', destinationFacilityId: 'h1' }],
    }) as unknown[];
    const read = scopeItemsForRead('medicalReports', elsewhere, hospitalA, { patients: visiblePatients }) as unknown[];
    expect(ids(read)).toEqual(['mr1', 'mr2', 'mr3']);
  });

  test('a hospital cannot attach a report to a patient outside its scope', () => {
    const forged = { id: 'mr9', patientId: 'p2', hospitalId: 'h1', title: 'Forged' };
    const merged = mergeAuthorizedWrite('medicalReports', reports, [...reports, forged], hospitalA, {
      writablePatientIds: new Set(['p1']),
    }) as unknown[];
    expect(ids(merged)).not.toContain('mr9');
    expect(ids(merged)).toContain('mr2'); // the other hospital's report is preserved
  });

  test('a patient cannot write reports at all', () => {
    const merged = mergeAuthorizedWrite('medicalReports', reports, [{ id: 'mr9', patientId: 'p1' }], patientX) as unknown[];
    expect(ids(merged)).toEqual(['mr1', 'mr2']);
  });
});

describe('health card scan authorization', () => {
  const referrals = [{ id: 'r1', patientId: 'p2', sourceFacilityId: 'h2', destinationFacilityId: 'h1' }];

  test('registration, referral and booking all authorize a hospital', () => {
    const own = authorizedPatientIdsForHospital(patients, [], [], 'h1');
    expect([...own].sort()).toEqual(['p1']);

    const referred = authorizedPatientIdsForHospital(patients, referrals, [], 'h1');
    expect([...referred].sort()).toEqual(['p1', 'p2']);

    const booked = authorizedPatientIdsForHospital(patients, [], [{ id: 'a1', patientId: 'p2', facilityId: 'h1' }], 'h1');
    expect([...booked].sort()).toEqual(['p1', 'p2']);
  });

  test('a scanned walk-in Health Card grants access to that hospital only', () => {
    const withGrant = authorizedPatientIdsForHospital(patients, [], [], 'h1', new Set(['p2']));
    expect([...withGrant].sort()).toEqual(['p1', 'p2']);

    // The grant is per hospital: another hospital is still refused.
    const other = authorizedPatientIdsForHospital(patients, [], [], 'h3', new Set(['p2']));
    expect([...other].sort()).toEqual(['p2']);
  });
});

describe('health card QR payload', () => {
  test('carries a card reference and nothing medical', () => {
    const payload = healthCardQrPayload('al-pt-2026-001');
    expect(payload).toBe(`${HEALTH_CARD_QR_PREFIX}AL-PT-2026-001`);
    // No patient id, name, diagnosis or vitals can be encoded into the code.
    expect(payload).not.toContain('undefined');
    expect(payload.split(':').length).toBe(3);
  });

  test('parses the current payload, the legacy form and a bare card number', () => {
    expect(parseHealthCardQr('AAROGYALINK:HC:AL-PT-2026-001')).toBe('AL-PT-2026-001');
    expect(parseHealthCardQr('AAROGYALINK|AL-PT-2026-001|p1')).toBe('AL-PT-2026-001');
    expect(parseHealthCardQr('  al-pt-2026-001 ')).toBe('al-pt-2026-001');
    expect(parseHealthCardQr('   ')).toBeNull();
  });

  test('report types have human labels for the UI', () => {
    expect(reportTypeLabel('lab_report')).toBe('Lab Report');
    expect(reportTypeLabel('unknown_type')).toBe('Report');
  });
});

describe('branding and login surface', () => {
  const read = (path: string) => readFileSync(resolve(import.meta.dir, '../..', path), 'utf8');

  test('the retired circular-network logo is no longer referenced', () => {
    for (const path of [
      'src/pages/RoleSelect.tsx',
      'src/pages/Auth.tsx',
      'src/components/layout/AppLayout.tsx',
      'index.html',
      'public/manifest.webmanifest',
    ]) {
      expect(read(path)).not.toContain('aarogyalink-logo.jpeg');
    }
  });

  test('the new brand lockup is used by the entry, auth and app header', () => {
    for (const path of ['src/pages/RoleSelect.tsx', 'src/pages/Auth.tsx', 'src/components/layout/AppLayout.tsx']) {
      expect(read(path)).toContain('BrandLogo');
    }
    // The role-selection page shows the full lockup, and only once.
    const roleSelect = read('src/pages/RoleSelect.tsx');
    expect(roleSelect).toContain('variant="full"');
    expect(roleSelect).not.toMatch(/<h1[^>]*>\s*AarogyaLink\s*<\/h1>/);
  });

  test('the login form starts empty with the requested placeholders', () => {
    const auth = read('src/pages/Auth.tsx');
    expect(auth).toContain('placeholder="Enter username"');
    expect(auth).toContain('placeholder="Enter password"');
    // No credential is ever pre-filled into the form.
    expect(auth).toMatch(/const \[username, setUsername\] = useState\(''\)/);
    expect(auth).toMatch(/const \[password, setPassword\] = useState\(''\)/);
    for (const demo of ['distadmin_pdk', 'distadmin_trichy', 'doctor_try', 'worker_try', 'hosadmin_try']) {
      expect(auth).not.toContain(demo);
    }
    expect(auth).not.toContain('defaultValue=');
  });
});
