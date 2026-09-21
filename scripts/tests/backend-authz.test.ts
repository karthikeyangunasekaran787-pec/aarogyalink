/**
 * Unit tests for src/convex/authz.ts (backend authorization policy) and the
 * dynamic facility merge in DataContext — run with: bun test
 *
 * The live deployment is exercised separately by scripts/tests/convex-authz.ts;
 * these tests pin the policy rules themselves so a future edit cannot silently
 * widen access.
 */
import { describe, expect, test } from 'bun:test';
import {
  hospitalInDistrict,
  mergeAuthorizedWrite,
  payloadFits,
  scopeCollectionsForRead,
  scopeFromBinding,
  scopeItemsForRead,
  serializeEnvelope,
  writablePatientIdsForHospital,
  type SessionScope,
} from '../../src/convex/authz';
import { hospitalToFacility, mergedFacilities } from '../../src/contexts/DataContext';
import { seedDistricts, seedVillageScores } from '../../src/lib/seed-multidistrict';
import type { Facility, Hospital } from '../../src/types';

const overall: SessionScope = { kind: 'overall' };
const districtPdk: SessionScope = { kind: 'district', districtId: 'DIST-PDK', districtName: 'Pudukkottai' };
const districtTry: SessionScope = { kind: 'district', districtId: 'DIST-TRY', districtName: 'Tiruchirappalli' };
const hospitalA: SessionScope = { kind: 'hospital', hospitalId: 'h1', staffUserId: 'ustaff-1' };
const patientX: SessionScope = { kind: 'patient', patientId: 'p1' };

// Two districts, one hospital each (hospitals carry their district id).
const districtHospitals = [
  { id: 'h1', hospitalId: 'HOS-PDK-001', name: 'Pudukkottai Government Hospital', district: 'Pudukkottai', districtId: 'DIST-PDK' },
  { id: 'h6', hospitalId: 'HOS-TRY-001', name: 'Tiruchirappalli Government Hospital', district: 'Tiruchirappalli', districtId: 'DIST-TRY' },
];
const districtStaff = [
  { id: 'ustaff-1', name: 'PDK Doctor', facilityId: 'h1', role: 'doctor' },
  { id: 'ustaff-6', name: 'TRY Doctor', facilityId: 'h6', role: 'doctor' },
  { id: 'ustaff-da1', name: 'PDK District Administrator', role: 'gov_admin', districtId: 'DIST-PDK' },
  { id: 'ustaff-da2', name: 'TRY District Administrator', role: 'gov_admin', districtId: 'DIST-TRY' },
];
const districtPatients = [
  { id: 'p1', name: 'PDK Patient', registeredByFacilityId: 'h1' },
  { id: 'p9', name: 'TRY Patient', registeredByFacilityId: 'h6' },
];
const districtReferrals = [
  { id: 'r1', patientId: 'p1', sourceFacilityId: 'h1', destinationFacilityId: 'h1' },
  { id: 'r9', patientId: 'p9', sourceFacilityId: 'h6', destinationFacilityId: 'h6' },
];

const staff = [
  { id: 'ustaff-1', name: 'Staff A', facilityId: 'h1', role: 'doctor', username: 'a', password: 'x' },
  { id: 'ustaff-2', name: 'Staff B', facilityId: 'h2', role: 'doctor', username: 'b', password: 'y' },
];
const doctors = [
  { id: 'd1', name: 'Doctor A', facilityId: 'h1' },
  { id: 'd2', name: 'Doctor B', facilityId: 'h2' },
];
const referrals = [
  { id: 'r1', patientId: 'p1', sourceFacilityId: 'h1', destinationFacilityId: 'h2' },
  { id: 'r2', patientId: 'p2', sourceFacilityId: 'h3', destinationFacilityId: 'h3' },
];
const vitals = [
  { id: 'v1', patientId: 'p1', spO2: 97 },
  { id: 'v2', patientId: 'p2', spO2: 99 },
];

describe('READ scoping', () => {
  test('unbound session receives nothing', () => {
    expect(scopeItemsForRead('doctors', doctors, null)).toBeNull();
  });

  test('overall scope is unfiltered (master administrator)', () => {
    expect(scopeItemsForRead('doctors', doctors, overall)).toHaveLength(2);
    expect(scopeItemsForRead('referrals', districtReferrals, overall)).toHaveLength(2);
  });

  test('district scope keeps only its own district facilities and staff', () => {
    const ctx = { hospitals: districtHospitals };
    expect(
      (scopeItemsForRead('hospitals', districtHospitals, districtPdk, ctx) as { id: string }[]).map(h => h.id),
    ).toEqual(['h1']);
    expect(
      (scopeItemsForRead('staffUsers', districtStaff, districtTry, ctx) as { id: string }[]).map(u => u.id),
    ).toEqual(['ustaff-6', 'ustaff-da2']);
  });

  test('district scope keeps only its own district patients and clinical records', () => {
    const ctx = { hospitals: districtHospitals };
    const visiblePatients = scopeItemsForRead('patients', districtPatients, districtPdk, ctx) as { id: string }[];
    expect(visiblePatients.map(p => p.id)).toEqual(['p1']);
    // Clinical records follow the visible patients (p9 belongs to Tiruchirappalli).
    const clinicalCtx = { ...ctx, patients: visiblePatients };
    expect(
      (scopeItemsForRead('vitals', vitals, districtPdk, clinicalCtx) as { id: string }[]).map(v => v.id),
    ).toEqual(['v1']);
    // Referrals are filtered by their source/destination facility.
    expect(
      (scopeItemsForRead('referrals', districtReferrals, districtTry, ctx) as { id: string }[]).map(r => r.id),
    ).toEqual(['r9']);
  });

  test('district scope sees only its own district record (and its analytics)', () => {
    const ctx = { hospitals: districtHospitals };
    const districts = [
      { id: 'dist-pdk', districtId: 'DIST-PDK', name: 'Pudukkottai' },
      { id: 'dist-try', districtId: 'DIST-TRY', name: 'Tiruchirappalli' },
    ];
    const seen = scopeItemsForRead('districts', districts, districtPdk, ctx) as { districtId: string }[];
    expect(seen.map(d => d.districtId)).toEqual(['DIST-PDK']);
  });

  test('legacy hospitals with no district id match by district NAME', () => {
    expect(hospitalInDistrict({ district: 'Pudukkottai' }, 'DIST-PDK', 'Pudukkottai')).toBe(true);
    expect(hospitalInDistrict({ district: 'Pudukkottai' }, 'DIST-TRY', 'Tiruchirappalli')).toBe(false);
    expect(hospitalInDistrict({ districtId: 'DIST-TRY' }, 'DIST-PDK', 'Pudukkottai')).toBe(false);
  });

  test('hospital scope keeps only records carrying its facility id', () => {
    expect((scopeItemsForRead('doctors', doctors, hospitalA) as { id: string }[]).map(d => d.id)).toEqual(['d1']);
    expect((scopeItemsForRead('staffUsers', staff, hospitalA) as { id: string }[]).map(u => u.id)).toEqual(['ustaff-1']);
  });

  test('hospital scope keeps referrals where it is source OR destination', () => {
    // r1 is h1 -> h2 (visible to h1); r2 is h3 -> h3 (not visible).
    expect(scopeItemsForRead('referrals', referrals, hospitalA)).toHaveLength(1);
  });

  test('hospital scope withholds district analytics', () => {
    expect(scopeItemsForRead('villageAccessScores', [{ villageId: 'v1' }], hospitalA)).toBeNull();
  });

  test('patient scope receives only their own health records', () => {
    expect(scopeItemsForRead('vitals', vitals, patientX)).toHaveLength(1);
    expect(scopeItemsForRead('referrals', referrals, patientX)).toHaveLength(1);
    expect(scopeItemsForRead('patients', [{ id: 'p1' }, { id: 'p2' }], patientX)).toHaveLength(1);
  });

  test('patient scope never receives staff credentials or analytics', () => {
    expect(scopeItemsForRead('staffUsers', staff, patientX)).toBeNull();
    expect(scopeItemsForRead('villageAccessScores', [{ villageId: 'v1' }], patientX)).toBeNull();
  });

  test('patient scope keeps the reference directories it needs to book care', () => {
    expect(scopeItemsForRead('doctors', doctors, patientX)).toHaveLength(2);
    expect(scopeItemsForRead('hospitals', [{ id: 'h1' }], patientX)).toHaveLength(1);
    expect(scopeItemsForRead('medicineStock', [{ id: 'm1', facilityId: 'h2' }], patientX)).toHaveLength(1);
  });

  test('deletion tombstones reach every bound device', () => {
    expect(scopeItemsForRead('tombstones', ['patients:id:p1'], patientX)).toHaveLength(1);
  });

  test('collection-level scoping omits withheld collections entirely', () => {
    const raw = {
      staffUsers: serializeEnvelope('v1', staff),
      vitals: serializeEnvelope('v1', vitals),
    };
    const asPatient = scopeCollectionsForRead(raw, patientX);
    expect(asPatient.staffUsers).toBeUndefined();
    expect(JSON.parse(asPatient.vitals).items).toHaveLength(1);

    const unbound = scopeCollectionsForRead(raw, null);
    expect(Object.keys(unbound)).toHaveLength(0);
  });
});

describe('WRITE scoping', () => {
  test('unbound session leaves stored data untouched', () => {
    expect(mergeAuthorizedWrite('doctors', doctors, [], null)).toEqual(doctors);
  });

  test('overall scope replaces the payload (full control)', () => {
    expect(mergeAuthorizedWrite('doctors', doctors, [doctors[0]], overall)).toEqual([doctors[0]]);
  });

  test("hospital cannot modify another hospital's record", () => {
    const tampered = { id: 'd2', name: 'HACKED', facilityId: 'h2' };
    const merged = mergeAuthorizedWrite('doctors', doctors, [doctors[0], tampered], hospitalA) as {
      id: string;
      name: string;
    }[];
    expect(merged.find(d => d.id === 'd2')?.name).toBe('Doctor B');
  });

  test("hospital cannot delete another hospital's records by omitting them", () => {
    const merged = mergeAuthorizedWrite('doctors', doctors, [doctors[0]], hospitalA) as { id: string }[];
    expect(merged.map(d => d.id).sort()).toEqual(['d1', 'd2']);
  });

  test('hospital can create and edit its own records', () => {
    const updatedA = { id: 'd1', name: 'Doctor A (updated)', facilityId: 'h1' };
    const newInScope = { id: 'd9', name: 'New Doctor', facilityId: 'h1' };
    const merged = mergeAuthorizedWrite('doctors', doctors, [updatedA, newInScope], hospitalA) as {
      id: string;
      name: string;
    }[];
    expect(merged.find(d => d.id === 'd1')?.name).toBe('Doctor A (updated)');
    expect(merged.find(d => d.id === 'd9')).toBeDefined();
    expect(merged.find(d => d.id === 'd2')?.name).toBe('Doctor B');
  });

  test('hospital cannot forge a record into another hospital on create', () => {
    const forged = { id: 'd7', name: 'Forged', facilityId: 'h2' };
    const merged = mergeAuthorizedWrite('doctors', doctors, [forged], hospitalA) as { id: string }[];
    expect(merged.find(d => d.id === 'd7')).toBeUndefined();
  });

  test('hospital user cannot mint a District Administrator account', () => {
    const escalate = {
      id: 'ustaff-evil',
      name: 'Evil',
      username: 'evil.gov',
      role: 'gov_admin',
      facilityId: 'h1',
    };
    const merged = mergeAuthorizedWrite('staffUsers', staff, [...staff, escalate], hospitalA) as {
      id: string;
    }[];
    expect(merged.find(u => u.id === 'ustaff-evil')).toBeUndefined();
  });

  test('clinical records are scoped through the writable-patient set', () => {
    const newVitals = { id: 'v3', patientId: 'p9', spO2: 95 };
    // A hospital may only record vitals for patients inside its scope…
    const scoped = mergeAuthorizedWrite('vitals', vitals, [...vitals, newVitals], hospitalA, {
      writablePatientIds: new Set(['p1', 'p2']),
    }) as { id: string }[];
    expect(scoped.map(v => v.id).sort()).toEqual(['v1', 'v2']);
    // …including patients it can see through a referral or appointment.
    const withReferralScope = mergeAuthorizedWrite('vitals', vitals, [...vitals, newVitals], hospitalA, {
      writablePatientIds: new Set(['p1', 'p2', 'p9']),
    }) as { id: string }[];
    expect(withReferralScope).toHaveLength(3);
  });

  test('unknown collections are NOT writable by a hospital (deny by default)', () => {
    const tampered = [{ villageId: 'v1', overallScore: 100 }];
    const merged = mergeAuthorizedWrite('villageAccessScores', [{ villageId: 'v1', overallScore: 10 }], tampered, hospitalA);
    expect((merged as { overallScore: number }[])[0].overallScore).toBe(10);
  });

  test('district admin writes only its own district and never mints an administrator', () => {
    const write = { facilityIds: new Set(['h1']), foreignReferralIds: new Set<string>() };
    // Own-district hospital change is applied…
    const mine = { ...districtHospitals[0], name: 'Renamed PDK Hospital' };
    const other = { ...districtHospitals[1], name: 'Hijacked TRY Hospital' };
    const merged = mergeAuthorizedWrite('hospitals', districtHospitals, [mine, other], districtPdk, write) as {
      id: string;
      name: string;
    }[];
    expect(merged.find(h => h.id === 'h1')?.name).toBe('Renamed PDK Hospital');
    expect(merged.find(h => h.id === 'h6')?.name).toBe('Tiruchirappalli Government Hospital');

    // …the other district's staff is preserved…
    const newAdmin = { id: 'ustaff-da9', name: 'Rogue', role: 'gov_admin', districtId: 'DIST-TRY', username: 'rogue' };
    const staffMerged = mergeAuthorizedWrite(
      'staffUsers',
      districtStaff,
      [...districtStaff, newAdmin],
      districtPdk,
      write,
    ) as { id: string }[];
    expect(staffMerged.find(u => u.id === 'ustaff-da9')).toBeUndefined();

    // …and a district admin cannot create a district either.
    const districtsMerged = mergeAuthorizedWrite(
      'districts',
      seedDistricts,
      [{ id: 'dist-9', districtId: 'DIST-XXX', name: 'Rogue' }],
      districtPdk,
      write,
    ) as { districtId: string }[];
    expect(districtsMerged.map(d => d.districtId)).toEqual(seedDistricts.map(d => d.districtId));
  });

  test('district analytics are per-district: villages never mix', () => {
    const villages = [
      { villageId: 'v1', villageName: 'Kallikudi', district: 'Pudukkottai' },
      { villageId: 'v4', villageName: 'Manapparai', district: 'Tiruchirappalli' },
    ];
    const context = { hospitals: districtHospitals };
    const pdkRead = scopeItemsForRead('villageAccessScores', villages, districtPdk, context) as {
      district: string;
    }[];
    const tryRead = scopeItemsForRead('villageAccessScores', villages, districtTry, context) as {
      district: string;
    }[];
    expect(pdkRead.map(v => v.district)).toEqual(['Pudukkottai']);
    expect(tryRead.map(v => v.district)).toEqual(['Tiruchirappalli']);
    // …while the Overall Administrator still sees the whole platform.
    expect(scopeItemsForRead('villageAccessScores', villages, overall, context)).toHaveLength(2);
    // Village analytics are never part of a hospital's or patient's payload.
    expect(scopeItemsForRead('villageAccessScores', villages, hospitalA, context)).toBeNull();
    expect(scopeItemsForRead('villageAccessScores', villages, patientX, context)).toBeNull();
  });

  test('an overall administrator binding is derived server-side, never from the client', () => {
    expect(scopeFromBinding({ role: 'overall_admin' })).toEqual({ kind: 'overall' });
    expect(scopeFromBinding({ role: 'gov_admin', districtId: 'DIST-TRY', districtName: 'Tiruchirappalli' })).toEqual({
      kind: 'district',
      districtId: 'DIST-TRY',
      districtName: 'Tiruchirappalli',
      staffUserId: undefined,
    });
    // A district binding without a district cannot be authorized at all.
    expect(scopeFromBinding({ role: 'gov_admin' })).toBeNull();
    expect(scopeFromBinding(null)).toBeNull();
  });

  test('patient can only write their own records', () => {
    const mine = { id: 'v1', patientId: 'p1', spO2: 96 };
    const theirs = { id: 'v2', patientId: 'p2', spO2: 1 };
    const merged = mergeAuthorizedWrite('vitals', vitals, [mine, theirs], patientX) as {
      id: string;
      spO2: number;
    }[];
    expect(merged.find(v => v.id === 'v1')?.spO2).toBe(96);
    expect(merged.find(v => v.id === 'v2')?.spO2).toBe(99);
  });

  test("patient cannot delete another patient's records", () => {
    const merged = mergeAuthorizedWrite('vitals', vitals, [{ id: 'v1', patientId: 'p1' }], patientX) as {
      id: string;
    }[];
    expect(merged.map(v => v.id).sort()).toEqual(['v1', 'v2']);
  });

  test('patient cannot modify reference data or analytics', () => {
    expect(mergeAuthorizedWrite('medicineStock', [{ id: 'm1', quantity: 5 }], [], patientX)).toEqual([
      { id: 'm1', quantity: 5 },
    ]);
    expect(mergeAuthorizedWrite('villageAccessScores', [{ villageId: 'v1' }], [], patientX)).toEqual([
      { villageId: 'v1' },
    ]);
  });

  test('oversized payloads are rejected before hitting the Convex limit', () => {
    expect(payloadFits('v1', [{ id: 'a' }])).toBe(true);
    expect(payloadFits('v1', [{ id: 'a', blob: 'x'.repeat(1000 * 1024) }])).toBe(false);
  });
});

describe('dynamic facilities (Fix 3)', () => {
  const seeded = [
    { id: 'f1', name: 'Seeded PHC', type: 'phc' },
    { id: 'f2', name: 'Seeded CHC', type: 'chc' },
  ] as unknown as Facility[];
  const hospital = {
    id: 'h9',
    name: 'Hospital C',
    hospitalId: 'HOS-009',
    type: 'government',
    address: 'Main Road',
    district: 'Madurai',
    state: 'Tamil Nadu',
    phone: '9000000000',
    email: 'c@gov.in',
    departments: ['General Medicine'],
    services: ['Emergency'],
    totalBeds: 100,
    occupiedBeds: 40,
    status: 'active',
    adminUserId: 'ustaff-ha9',
    createdByUserId: 'uga1',
  } as unknown as Hospital;

  test('a newly created hospital appears in the facility list', () => {
    const merged = mergedFacilities(seeded, [hospital]);
    expect(merged.map(f => f.id)).toContain('h9');
    expect(merged.find(f => f.id === 'h9')?.name).toBe('Hospital C');
  });

  test('seeded facilities are never removed', () => {
    const merged = mergedFacilities(seeded, [hospital]);
    expect(merged.map(f => f.id)).toEqual(['f1', 'f2', 'h9']);
  });

  test('a hospital already present in the seeded list is not duplicated', () => {
    const overlapping = { ...hospital, id: 'f1', name: 'Hospital C (renamed)' } as unknown as Hospital;
    const merged = mergedFacilities(seeded, [overlapping]);
    expect(merged.filter(f => f.id === 'f1')).toHaveLength(1);
    expect(merged.find(f => f.id === 'f1')?.name).toBe('Seeded PHC');
  });

  test('hospital-to-facility conversion keeps id, name and capacity', () => {
    const facility = hospitalToFacility(hospital);
    expect(facility.id).toBe('h9');
    expect(facility.name).toBe('Hospital C');
    expect(facility.totalBeds).toBe(100);
  });
});

describe('hospital patient isolation', () => {
  const patientRecords = [
    { id: 'p1', name: 'Patient One', registeredByFacilityId: 'h1' },
    { id: 'p2', name: 'Patient Two', registeredByFacilityId: 'h2' },
    { id: 'p9', name: 'Seeded Patient' }, // unattributed: shared demo data
  ];
  const clinical = [
    { id: 'v1', patientId: 'p1', spO2: 97 },
    { id: 'v2', patientId: 'p2', spO2: 99 },
    { id: 'v3', patientId: 'p9', spO2: 95 },
  ];
  const ids = (list: unknown[]) => (list as { id: string }[]).map(r => r.id).sort();

  test('hospital sees only its own and unattributed patients', () => {
    expect(ids(scopeItemsForRead('patients', patientRecords, hospitalA) as unknown[])).toEqual(['p1', 'p9']);
  });

  test('another hospital’s patient is not readable', () => {
    const visible = scopeItemsForRead('patients', patientRecords, hospitalA) as { id: string }[];
    expect(visible.some(p => p.id === 'p2')).toBe(false);
  });

  test('a referred patient becomes visible to the receiving hospital', () => {
    const visible = scopeItemsForRead('patients', patientRecords, hospitalA, {
      referrals: [{ id: 'r1', patientId: 'p2', sourceFacilityId: 'h2', destinationFacilityId: 'h1' }],
    }) as unknown[];
    expect(ids(visible)).toEqual(['p1', 'p2', 'p9']);
  });

  test('a patient booked at the hospital becomes visible too', () => {
    const visible = scopeItemsForRead('patients', patientRecords, hospitalA, {
      appointments: [{ id: 'a1', patientId: 'p2', facilityId: 'h1' }],
    }) as unknown[];
    expect(ids(visible)).toEqual(['p1', 'p2', 'p9']);
  });

  test('clinical records follow the visible patients', () => {
    const visiblePatients = scopeItemsForRead('patients', patientRecords, hospitalA, {}) as unknown[];
    const vitalsRead = scopeItemsForRead('vitals', clinical, hospitalA, { patients: visiblePatients }) as unknown[];
    expect(ids(vitalsRead)).toEqual(['v1', 'v3']);
  });

  test('staff notifications without a patient link are kept', () => {
    // Patient notifications are addressed to `u-<patientId>`; staff ones use a
    // staff user id. Only the patient-addressed kind may be scoped away.
    const notes = [
      { id: 'n1', userId: 'ustaff-1' },
      { id: 'n2', userId: 'u-p2' },
    ];
    const visiblePatients = scopeItemsForRead('patients', patientRecords, hospitalA, {}) as unknown[];
    const read = scopeItemsForRead('notifications', notes, hospitalA, { patients: visiblePatients }) as unknown[];
    expect(ids(read)).toEqual(['n1']);
  });

  test('hospital can register a patient attributed to itself', () => {
    const owned = { id: 'p11', name: 'New Patient', registeredByFacilityId: 'h1' };
    const merged = mergeAuthorizedWrite('patients', patientRecords, [...patientRecords, owned], hospitalA) as unknown[];
    expect(ids(merged)).toContain('p11');
  });

  test('hospital cannot register a patient for another hospital', () => {
    const forged = { id: 'p12', name: 'Forged', registeredByFacilityId: 'h2' };
    const merged = mergeAuthorizedWrite('patients', patientRecords, [...patientRecords, forged], hospitalA) as unknown[];
    expect(ids(merged)).not.toContain('p12');
  });

  test("hospital cannot take over another hospital's patient record", () => {
    const tampered = { id: 'p2', name: 'TAMPERED', registeredByFacilityId: 'h1' };
    const merged = mergeAuthorizedWrite('patients', patientRecords, [tampered], hospitalA) as {
      id: string;
      name: string;
    }[];
    expect(merged.find(p => p.id === 'p2')?.name).toBe('Patient Two');
  });

  test('a hospital payload never deletes other or shared patients', () => {
    const merged = mergeAuthorizedWrite('patients', patientRecords, [], hospitalA) as unknown[];
    expect(ids(merged)).toEqual(['p2', 'p9']);
  });

  test('clinical writes are limited to patients in scope', () => {
    const writable = new Set(['p1', 'p9']);
    const tampered = { ...clinical[1], spO2: 1 };
    const merged = mergeAuthorizedWrite('vitals', clinical, [...clinical, tampered], hospitalA, {
      writablePatientIds: writable,
    }) as { id: string; spO2: number }[];
    expect(merged.find(v => v.id === 'v2')?.spO2).toBe(99);
    expect(merged).toHaveLength(3);
  });

  test('writable patient ids mirror the read scope', () => {
    const writable = writablePatientIdsForHospital(
      patientRecords,
      [{ id: 'r1', patientId: 'p2', sourceFacilityId: 'h2', destinationFacilityId: 'h1' }],
      [],
      'h1',
    );
    expect([...writable].sort()).toEqual(['p1', 'p2', 'p9']);
  });
});

describe('hospital directory (referral origin + appointment booking)', () => {
  // Two districts, each with its own hospital and its own administrator.
  const directory = [
    { id: 'h1', name: 'Pudukkottai Government Hospital', district: 'Pudukkottai', districtId: 'DIST-PDK', adminUsername: 'hosadmin.pdk001', adminTempPassword: 'Temp#1' },
    { id: 'h6', name: 'Tiruchirappalli Government Hospital', district: 'Tiruchirappalli', districtId: 'DIST-TRY', adminUsername: 'hosadmin.try1', adminTempPassword: 'Temp#6' },
  ];

  test('a hospital user receives every hospital, so any referral destination is reachable', () => {
    const rows = scopeItemsForRead('hospitals', directory, hospitalA) as { id: string }[];
    expect(rows.map(h => h.id).sort()).toEqual(['h1', 'h6']);
  });

  test('administrator credentials of OTHER hospitals are withheld', () => {
    const rows = scopeItemsForRead('hospitals', directory, hospitalA) as Record<string, unknown>[];
    const other = rows.find(h => h.id === 'h6')!;
    expect(other.adminUsername).toBeUndefined();
    expect(other.adminTempPassword).toBeUndefined();
    expect(other.name).toBe('Tiruchirappalli Government Hospital');
    // …while the caller's own hospital is untouched.
    expect(rows.find(h => h.id === 'h1')?.adminUsername).toBe('hosadmin.pdk001');
  });

  test('a patient may book at a hospital in another district, without credentials', () => {
    const rows = scopeItemsForRead('hospitals', directory, patientX) as Record<string, unknown>[];
    expect(rows.map(h => h.id).sort()).toEqual(['h1', 'h6']);
    expect(rows.every(h => h.adminTempPassword === undefined)).toBe(true);
  });

  test('a hospital user cannot write the directory (forged payload is dropped)', () => {
    const forged = [{ id: 'h6', name: 'Forged', adminTempPassword: 'Stolen' }];
    const merged = mergeAuthorizedWrite('hospitals', directory, forged, hospitalA) as Record<string, unknown>[];
    expect(merged.map(h => h.id)).toEqual(['h1', 'h6']);
    expect(merged.find(h => h.id === 'h6')?.name).toBe('Tiruchirappalli Government Hospital');
    expect(merged.find(h => h.id === 'h6')?.adminTempPassword).toBe('Temp#6');
  });
});

describe('district analytics seed', () => {
  test('every seeded village is attributed to a real district', () => {
    // The district console derives its Rural Healthcare Access Score from these
    // rows, so a district with no villages would silently show an empty map.
    const counts = new Map<string, number>();
    for (const village of seedVillageScores as unknown as { district: string }[]) {
      counts.set(village.district, (counts.get(village.district) ?? 0) + 1);
    }
    for (const district of seedDistricts) {
      expect(counts.get(district.name) ?? 0).toBeGreaterThan(0);
    }
    // No row may claim a district the platform does not have.
    const known = new Set(seedDistricts.map(d => d.name));
    expect([...counts.keys()].every(name => known.has(name))).toBe(true);
  });
});
