// ============================================================================
// AarogyaLink — hospital → facility mapping (pure)
// ----------------------------------------------------------------------------
// These two functions were defined inside DataContext.tsx, which meant anything
// that wanted them had to import the whole data provider (React, the Convex
// client, browser storage). They are pure data transforms, so they live here:
//
//   - hospitals are created at runtime by the District Administrator, and every
//     lookup, analytics total and distance calculation treats them as the same
//     Facility records the seeded facility finder uses,
//   - a hospital registered without coordinates stays resolvable, because the
//     place it sits in (`village`, else the district) is carried through and
//     src/lib/geo.ts can turn that into a position.
//
// DataContext re-exports both, so existing imports keep working.
// ============================================================================

import type { Facility, Hospital } from '@/types';

/**
 * Present a hospital as a Facility record. Hospitals are created dynamically by
 * the District Administrator, so lookups and analytics must consider them in
 * addition to the seeded facility-finder list.
 */
export function hospitalToFacility(h: Hospital): Facility {
  return {
    id: h.id,
    name: h.name,
    type: 'dh',
    address: h.address,
    // The village keeps the hospital resolvable to a position for distance
    // calculations even when the exact coordinates were not recorded.
    village: h.village ?? h.district,
    district: h.district,
    state: h.state,
    latitude: h.latitude ?? 0,
    longitude: h.longitude ?? 0,
    phone: h.phone,
    emergencyAvailable: h.services.includes('Emergency'),
    departments: h.departments,
    totalBeds: h.totalBeds,
    occupiedBeds: h.occupiedBeds,
    specialistsAvailable: 0,
    diagnosticsAvailable: [],
    medicinesAvailable: [],
    averageWaitTime: 30,
    rating: 4.0,
  };
}

/**
 * Merge the seeded facility finder list with hospitals created at runtime,
 * deduplicated by id so nothing is listed twice and no seeded facility is lost.
 */
export function mergedFacilities(seed: Facility[], hospitals: Hospital[]): Facility[] {
  const byId = new Map<string, Facility>(seed.map(f => [f.id, f]));
  for (const hospital of hospitals) {
    if (!byId.has(hospital.id)) byId.set(hospital.id, hospitalToFacility(hospital));
  }
  return [...byId.values()];
}
