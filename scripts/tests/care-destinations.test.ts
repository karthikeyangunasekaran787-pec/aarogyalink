/**
 * Unit tests for src/lib/care-destinations.ts — run with: bun test
 *
 * These pin the rule the SIH demo depends on: a doctor or health worker can
 * refer to ANY hospital (another district included) and a patient can book at
 * any hospital, while never being offered a destination nobody owns.
 */
import { describe, expect, test } from 'bun:test';
import { bookingLocations, destinationLabel, referralTargets } from '../../src/lib/care-destinations';
import type { Doctor, Facility, Hospital } from '../../src/types';

const hospital = (over: Partial<Hospital> & { id: string; name: string }): Hospital =>
  ({ status: 'active', district: '', ...over }) as unknown as Hospital;
const facility = (over: Partial<Facility> & { id: string; name: string }): Facility =>
  ({ district: '', ...over }) as unknown as Facility;
const doctor = (id: string, facilityId: string): Doctor => ({ id, facilityId }) as unknown as Doctor;

const hospitals = [
  hospital({ id: 'h1', name: 'Pudukkottai Government Hospital', district: 'Pudukkottai', districtId: 'DIST-PDK' }),
  hospital({ id: 'h6', name: 'Tiruchirappalli Government Hospital', district: 'Tiruchirappalli', districtId: 'DIST-TRY' }),
  hospital({ id: 'h7', name: 'Manapparai Government Hospital', district: 'Tiruchirappalli', districtId: 'DIST-TRY' }),
  hospital({ id: 'h9', name: 'Closed Hospital', district: 'Pudukkottai', status: 'inactive' }),
];
const facilities = [facility({ id: 'f1', name: 'Kallikudi Primary Health Centre', district: 'Madurai' })];

describe('referral targets', () => {
  test('every active hospital is offered, across districts', () => {
    const ids = referralTargets(hospitals, facilities, 'h1', 'Pudukkottai').map(t => t.id);
    expect(ids.sort()).toEqual(['h6', 'h7']);
  });

  test('the caller’s own hospital and inactive hospitals are excluded', () => {
    const ids = referralTargets(hospitals, facilities, 'h1', 'Pudukkottai').map(t => t.id);
    expect(ids).not.toContain('h1');
    expect(ids).not.toContain('h9');
  });

  test('hospitals in the caller’s own district come first', () => {
    const first = referralTargets(hospitals, facilities, 'h6', 'Tiruchirappalli')[0];
    expect(first.id).toBe('h7');
  });

  test('facilities are only offered when there is no hospital at all', () => {
    const withHospitals = referralTargets(hospitals, facilities, 'h1');
    expect(withHospitals.some(t => t.kind === 'facility')).toBe(false);
    const withoutHospitals = referralTargets([], facilities, 'h1');
    expect(withoutHospitals.map(t => t.id)).toEqual(['f1']);
  });

  test('the label carries the district so same-named hospitals differ', () => {
    const target = referralTargets(hospitals, facilities, 'h1')[0];
    expect(destinationLabel(target)).toBe(`${target.name} — ${target.district}`);
    expect(destinationLabel({ id: 'x', name: 'Solo', kind: 'hospital', doctorCount: 0 })).toBe('Solo');
  });
});

describe('booking locations', () => {
  const doctors = [doctor('d1', 'h1'), doctor('d2', 'h6'), doctor('d3', 'h7')];

  test('only locations with a doctor are bookable', () => {
    const ids = bookingLocations(facilities, hospitals, doctors).map(l => l.id);
    expect(ids.sort()).toEqual(['h1', 'h6', 'h7']);
    expect(ids).not.toContain('f1');
  });

  test('a facility that has a doctor is kept, even without a hospital record', () => {
    const ids = bookingLocations(facilities, [], [doctor('d9', 'f1')]).map(l => l.id);
    expect(ids).toEqual(['f1']);
  });

  test('when nothing is staffed the whole directory is offered instead of an empty screen', () => {
    const ids = bookingLocations(facilities, hospitals, []).map(l => l.id);
    expect(ids.sort()).toEqual(['f1', 'h1', 'h6', 'h7']);
  });

  test('inactive hospitals are never bookable', () => {
    const ids = bookingLocations(facilities, hospitals, doctors).map(l => l.id);
    expect(ids).not.toContain('h9');
  });

  test('each location reports how many doctors practise there', () => {
    const locations = bookingLocations(facilities, hospitals, [...doctors, doctor('d4', 'h1')]);
    expect(locations.find(l => l.id === 'h1')?.doctorCount).toBe(2);
    expect(locations.find(l => l.id === 'h6')?.doctorCount).toBe(1);
  });

  test('the caller’s own district is listed first', () => {
    const locations = bookingLocations(facilities, hospitals, doctors, 'Tiruchirappalli');
    expect(locations.slice(0, 2).every(l => l.district === 'Tiruchirappalli')).toBe(true);
  });
});
