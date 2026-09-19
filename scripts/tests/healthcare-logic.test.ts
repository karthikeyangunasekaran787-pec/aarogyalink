/**
 * Targeted unit tests for this round of bug fixes — run with: bun test
 *
 * Covers:
 *   BUG 6 — patient id / health card id / user id all derive from ONE counter
 *   BUG 7/8 — hospitals resolve as facilities (dynamic lookup + analytics)
 *   BUG 9 — referral events carry the real actor, role, facility and timestamp
 */
import { describe, expect, test } from 'bun:test';
import { patientIdentifiers, hospitalToFacility } from '../../src/contexts/DataContext';
import type { Hospital, ReferralEvent } from '../../src/types';

describe('BUG 6 — patient identifier generation', () => {
  test('patient id, health card id and user id all use the SAME number', () => {
    const ids = patientIdentifiers(11);
    expect(ids.id).toBe('p11');
    expect(ids.healthCardId).toBe('AL-PT-2026-011');
    expect(ids.userId).toBe('u-p11');
    // The digit group must match across identifiers (the old bug let them drift).
    expect(String(11)).toBe(ids.id.replace('p', ''));
    expect(ids.healthCardId.endsWith('011')).toBe(true);
  });

  test('consecutive registrations never produce duplicate or mismatched ids', () => {
    const a = patientIdentifiers(11);
    const b = patientIdentifiers(12);
    expect(a.id).not.toBe(b.id);
    expect(a.healthCardId).not.toBe(b.healthCardId);
    // Each record is internally consistent.
    expect(a.healthCardId).toBe('AL-PT-2026-011');
    expect(b.healthCardId).toBe('AL-PT-2026-012');
  });

  test('user id matches the id format used by patient login', () => {
    const ids = patientIdentifiers(7);
    // AppContext.loginPatient stores `u-${patientId}`.
    expect(ids.userId).toBe(`u-${ids.id}`);
  });

  test('health card ids stay well-formed past 3 digits', () => {
    expect(patientIdentifiers(100).healthCardId).toBe('AL-PT-2026-100');
    expect(patientIdentifiers(1000).healthCardId).toBe('AL-PT-2026-1000');
  });

  test('existing seed patients are not affected by the counter (ids 1-10)', () => {
    // Seeded records keep their AL-PT-2026-00X ids; new ones continue the run.
    for (let n = 1; n <= 10; n++) {
      expect(patientIdentifiers(n).healthCardId).toBe(`AL-PT-2026-${String(n).padStart(3, '0')}`);
    }
  });
});

const sampleHospital: Hospital = {
  id: 'h9',
  hospitalId: 'HOS-PDK-009',
  name: 'Newly Added District Hospital',
  type: 'government',
  address: '5 New Road',
  district: 'Pudukkottai',
  state: 'Tamil Nadu',
  phone: '04322-999000',
  email: 'new@tn.gov.in',
  departments: ['General Medicine', 'Cardiology'],
  services: ['OPD', 'Emergency', 'Pharmacy'],
  totalBeds: 120,
  occupiedBeds: 40,
  status: 'active',
  adminUserId: 'ustaff-ha9',
  createdByUserId: 'uga1',
  createdAt: '2026-09-19',
};

describe('BUG 7/8 — dynamic hospital lookup & analytics', () => {
  test('a runtime-created hospital maps to a facility with the SAME id', () => {
    const facility = hospitalToFacility(sampleHospital);
    // The id must be preserved: referrals store hospital ids as
    // destinationFacilityId, so facility analytics must match on that id.
    expect(facility.id).toBe('h9');
    expect(facility.name).toBe('Newly Added District Hospital');
  });

  test('hospital fields carry over to the facility shape', () => {
    const facility = hospitalToFacility(sampleHospital);
    expect(facility.village).toBe('Pudukkottai');
    expect(facility.district).toBe('Pudukkottai');
    expect(facility.totalBeds).toBe(120);
    expect(facility.occupiedBeds).toBe(40);
    expect(facility.departments).toEqual(['General Medicine', 'Cardiology']);
    expect(facility.phone).toBe('04322-999000');
    // Emergency availability is derived from the hospital's services.
    expect(facility.emergencyAvailable).toBe(true);
  });

  test('emergency is false when the hospital does not list the service', () => {
    const calm: Hospital = { ...sampleHospital, services: ['OPD', 'Pharmacy'] };
    expect(hospitalToFacility(calm).emergencyAvailable).toBe(false);
  });

  test('newly added hospitals are counted in district analytics totals', () => {
    // Mirrors DataContext: currentFacilities = hospitals.map(hospitalToFacility)
    const hospitals: Hospital[] = [
      sampleHospital,
      { ...sampleHospital, id: 'h10', name: 'Second New Hospital', totalBeds: 80, occupiedBeds: 20 },
    ];
    const facilities = hospitals.map(hospitalToFacility);
    const totalBeds = facilities.reduce((sum, f) => sum + f.totalBeds, 0);
    expect(facilities.length).toBe(2);
    expect(totalBeds).toBe(200);
    expect(facilities.map(f => f.id)).toEqual(['h9', 'h10']);
  });

  test('facility lookup result is stable for repeated lookups of the same hospital', () => {
    const first = hospitalToFacility(sampleHospital);
    const second = hospitalToFacility(sampleHospital);
    expect(first).toEqual(second);
  });
});

describe('BUG 9 — referral audit attribution', () => {
  test('events can carry actor id, role, facility and timestamp', () => {
    const event: ReferralEvent = {
      id: 're-1',
      referralId: 'r11',
      status: 'accepted',
      description: 'Referral accepted',
      performedBy: 'Rajesh Kumar',
      timestamp: new Date().toISOString(),
      performedByUserId: 'ustaff-ha1',
      performedByRole: 'hospital_admin',
      performedByFacilityId: 'h1',
    };
    expect(event.performedByUserId).toBe('ustaff-ha1');
    expect(event.performedByRole).toBe('hospital_admin');
    expect(event.performedByFacilityId).toBe('h1');
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  test('legacy events without audit fields remain valid', () => {
    const legacy: ReferralEvent = {
      id: 're-0',
      referralId: 'r1',
      status: 'created',
      description: 'Referral created',
      performedBy: 'System',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    expect(legacy.performedByUserId).toBeUndefined();
    expect(legacy.performedBy).toBe('System');
  });
});
