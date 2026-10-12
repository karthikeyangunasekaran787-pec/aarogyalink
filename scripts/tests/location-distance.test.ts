/**
 * Location → distance: the numbers the facility finder shows.
 *
 * Why this exists: the facility cards used to print a distance hardcoded per
 * facility id (`f.id === 'f1' ? '3.2km' : …`), and every hospital registered by
 * a District Administrator was converted with latitude/longitude set to 0, 0.
 * So the distance was wrong for the hospital the demo actually uses, and it did
 * not change with the patient's location.
 *
 * These tests cover the rule that replaced it: distance is computed between the
 * patient's resolved position and the facility's, and an unknown position
 * produces an honest "no distance" rather than a made-up number.
 */
import { describe, expect, test } from 'bun:test';

import {
  PLACE_COORDINATES,
  coordsForPlace,
  coordsForPlaceIn,
  distanceToFacilityKm,
  estimateTravelMinutes,
  facilityCoordinates,
  formatDistanceKm,
  haversineKm,
  isUsableCoordinates,
} from '../../src/lib/geo';
// Imported from the pure mapping module, not the data provider: DataContext is
// mocked by a sibling render test in the same process, and this file needs the
// real function.
import { hospitalToFacility, mergedFacilities } from '../../src/lib/facility-mapping';
import { facilities, hospitals, patients, villageAccessScores } from '../../src/lib/mock-data';

describe('great-circle distance', () => {
  test('a point is zero kilometres from itself', () => {
    expect(haversineKm({ latitude: 10.05, longitude: 78.62 }, { latitude: 10.05, longitude: 78.62 })).toBe(0);
  });

  test('Madurai to Pudukkottai is about 92 km — not a hand-written constant', () => {
    const km = haversineKm(
      { latitude: 9.925, longitude: 78.119 },
      { latitude: 10.38, longitude: 78.82 },
    );
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(100);
  });

  test('the distance is symmetric', () => {
    const a = { latitude: 10.05, longitude: 78.12 };
    const b = { latitude: 10.38, longitude: 78.82 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe('usable coordinates', () => {
  test('(0, 0) is treated as "no position recorded"', () => {
    // This is what a hospital created before location capture looks like, and
    // it sits in the Gulf of Guinea — never a distance to show.
    expect(isUsableCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
  });

  test('missing, non-finite and out-of-range values are rejected', () => {
    expect(isUsableCoordinates(null)).toBe(false);
    expect(isUsableCoordinates(undefined)).toBe(false);
    expect(isUsableCoordinates({ latitude: Number.NaN, longitude: 78 })).toBe(false);
    expect(isUsableCoordinates({ latitude: 120, longitude: 78 })).toBe(false);
    expect(isUsableCoordinates({ latitude: 10, longitude: 200 })).toBe(false);
  });

  test('a real position is accepted', () => {
    expect(isUsableCoordinates({ latitude: 10.05, longitude: 78.62 })).toBe(true);
  });
});

describe('resolving a place to a position', () => {
  test('the seeded villages resolve to the coordinates stored in the village data', () => {
    for (const village of villageAccessScores) {
      const coords = coordsForPlace(village.villageName);
      expect(coords).toEqual({ latitude: village.latitude, longitude: village.longitude });
    }
  });

  test('a district headquarters resolves too', () => {
    expect(coordsForPlace('Pudukkottai')).toEqual({ latitude: 10.38, longitude: 78.82 });
    expect(coordsForPlace('Tiruchirappalli')).toEqual({ latitude: 10.79, longitude: 78.7 });
  });

  test('every place and district pair is unique and inside India', () => {
    const keys = PLACE_COORDINATES.map(p => `${p.name}|${p.district}`);
    expect(new Set(keys).size).toBe(keys.length);
    // A repeated name is only allowed across districts (Alangudi is in both
    // Madurai and Pudukkottai), never twice in the same district — that would
    // make resolution ambiguous for real.
    for (const place of PLACE_COORDINATES) {
      expect(place.latitude).toBeGreaterThan(8);
      expect(place.latitude).toBeLessThan(14);
      expect(place.longitude).toBeGreaterThan(76);
      expect(place.longitude).toBeLessThan(81);
    }
  });

  test('matching ignores case and picks the most specific place in one string', () => {
    expect(coordsForPlace('KALLIKUDI')).toEqual({ latitude: 10.05, longitude: 78.12 });
    // "Illupur Government Hospital, Pudukkottai" contains both names; the
    // longer (more specific) one wins rather than the first in table order.
    expect(coordsForPlace('Illupur Government Hospital, Pudukkottai'))
      .toEqual({ latitude: 10.38, longitude: 78.82 });
  });

  test('a district hint separates two villages that share a name', () => {
    // There is an Alangudi in Madurai district and another in Pudukkottai,
    // about 44 km apart. The record's own district decides which one applies.
    expect(coordsForPlaceIn('Madurai', 'Alangudi')).toEqual({ latitude: 10.15, longitude: 78.22 });
    expect(coordsForPlaceIn('Pudukkottai', 'Alangudi')).toEqual({ latitude: 10.05, longitude: 78.62 });
    // No hint: the first entry wins, so behaviour stays predictable.
    expect(coordsForPlace('Alangudi')).toEqual({ latitude: 10.15, longitude: 78.22 });
  });

  test('a facility is placed in its own district, not by name alone', () => {
    // The Pudukkottai PHC must not be dropped on the Madurai village of the
    // same name — that would misplace it by ~44 km.
    const phc = { village: 'Alangudi', name: 'Alangudi Primary Health Centre', district: 'Pudukkottai' };
    expect(facilityCoordinates(phc)).toEqual({ latitude: 10.05, longitude: 78.62 });
    const village = { village: 'Alangudi', name: 'Village of Alangudi', district: 'Madurai' };
    expect(facilityCoordinates(village)).toEqual({ latitude: 10.15, longitude: 78.22 });
  });

  test('an unknown place resolves to nothing rather than to a default', () => {
    expect(coordsForPlace('Nowhereville')).toBeNull();
    expect(coordsForPlace(null, undefined)).toBeNull();
  });
});

describe('facility distances vary with the patient location', () => {
  test('every seeded facility resolves to a position', () => {
    for (const facility of facilities) {
      expect(facilityCoordinates(facility)).not.toBeNull();
    }
  });

  test('two patients get different distances to the same facility', () => {
    const facility = facilities[0]; // Kallikudi PHC
    const fromKallikudi = distanceToFacilityKm(coordsForPlace('Kallikudi'), facility);
    const fromUsilampatti = distanceToFacilityKm(coordsForPlace('Usilampatti'), facility);

    expect(fromKallikudi).not.toBeNull();
    expect(fromUsilampatti).not.toBeNull();
    expect(fromKallikudi as number).toBeLessThan(1); // the patient is in that village
    expect(fromUsilampatti as number).toBeGreaterThan(15); // and this one is not
  });

  test('the nearest facility depends on where the patient lives', () => {
    const nearestFrom = (place: string) =>
      [...facilities]
        .map(f => ({ id: f.id, km: distanceToFacilityKm(coordsForPlace(place), f) }))
        .filter(e => e.km !== null)
        .sort((a, b) => (a.km as number) - (b.km as number))[0].id;

    // A patient in Kallikudi walks to Kallikudi's own PHC; a patient in
    // Usilampatti is nearest to the District Hospital instead.
    expect(nearestFrom('Kallikudi')).toBe('f1');
    expect(nearestFrom('Usilampatti')).not.toBe('f1');
  });

  test('no position means no distance — never a fabricated one', () => {
    expect(distanceToFacilityKm(null, facilities[0])).toBeNull();
    expect(distanceToFacilityKm({ latitude: 0, longitude: 0 }, facilities[0])).toBeNull();
    expect(distanceToFacilityKm(
      coordsForPlace('Kallikudi'),
      {
        ...facilities[0],
        latitude: 0,
        longitude: 0,
        village: 'Nowhereville',
        name: 'Unknown Clinic',
        address: 'Unmapped Road',
        district: 'Unmapped',
      },
    )).toBeNull();
  });
});

describe('registered hospitals carry a position', () => {
  test('a hospital with recorded coordinates keeps them in the facility view', () => {
    const [first] = hospitals;
    const facility = hospitalToFacility(first);
    expect(facility.latitude).toBe(first.latitude as number);
    expect(facility.longitude).toBe(first.longitude as number);
    expect(facility.village).toBe('Pudukkottai');
  });

  test('a hospital registered without coordinates is still resolvable by its place', () => {
    // The District Administrator form does not capture coordinates, so this is
    // the common case: the facility must still be placed by its village.
    const facility = hospitalToFacility({
      ...hospitals[1],
      latitude: undefined,
      longitude: undefined,
    });
    expect(facility.latitude).toBe(0);
    expect(facilityCoordinates(facility)).toEqual({ latitude: 10.05, longitude: 78.62 });
    expect(distanceToFacilityKm(coordsForPlace('Pudukkottai'), facility)).toBeGreaterThan(30);
  });

  test('a facility already in the seeded list is not listed twice', () => {
    const merged = mergedFacilities(facilities, hospitals);
    expect(merged.map(f => f.id)).toEqual([...new Set(merged.map(f => f.id))]);
    expect(merged.length).toBe(facilities.length + hospitals.length);
  });

  test('the seeded patients all resolve to a position', () => {
    for (const patient of patients) {
      expect(coordsForPlace(patient.village, patient.district)).not.toBeNull();
    }
  });
});

describe('how the distance is displayed', () => {
  test('one decimal up close, whole kilometres further out, never below 0.1', () => {
    expect(formatDistanceKm(3.24)).toBe('3.2 km');
    expect(formatDistanceKm(9.99)).toBe('10.0 km');
    expect(formatDistanceKm(12.4)).toBe('12 km');
    expect(formatDistanceKm(0)).toBe('0.1 km');
  });

  test('an unknown distance is a dash, not a number', () => {
    expect(formatDistanceKm(null)).toBe('—');
    expect(formatDistanceKm(undefined)).toBe('—');
    expect(formatDistanceKm(Number.NaN)).toBe('—');
  });

  test('travel time is derived from the distance and scales with it', () => {
    expect(estimateTravelMinutes(null)).toBeNull();
    const near = estimateTravelMinutes(5) as number;
    const far = estimateTravelMinutes(50) as number;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeLessThan(far);
  });
});
