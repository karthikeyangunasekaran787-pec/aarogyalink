// ============================================================================
// AarogyaLink — geography helpers
// ----------------------------------------------------------------------------
// Every distance shown in the product is derived from coordinates, never typed
// into the UI. The patient's own location is the origin, so the same hospital
// shows a different distance for each patient:
//
//   origin = the patient's device location (if shared), otherwise the
//            coordinates of the village they are registered in, otherwise
//            their district headquarters.
//
// Doctors/Hospitals seeded without coordinates are still resolved, because a
// facility name ("Alangudi Primary Health Centre") carries the place it sits
// in. When nothing can be resolved the caller shows "distance unavailable"
// instead of inventing a number.
// ============================================================================

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * Places the demo dataset refers to, with their coordinates. Village records
 * carry the same coordinates as the seeded access scores, so a village is
 * resolved identically wherever it appears.
 */
export const PLACE_COORDINATES: ReadonlyArray<{ name: string; latitude: number; longitude: number }> = [
  // Madurai district (seeded villages)
  { name: 'Kallikudi', latitude: 10.05, longitude: 78.12 },
  { name: 'Thoor', latitude: 10.08, longitude: 78.15 },
  { name: 'Melur', latitude: 9.97, longitude: 78.28 },
  { name: 'Vadipatti', latitude: 10.02, longitude: 78.08 },
  { name: 'Usilampatti', latitude: 9.97, longitude: 77.95 },
  { name: 'Sedapatti', latitude: 10.1, longitude: 78.05 },
  { name: 'Peraiyur', latitude: 9.92, longitude: 78.2 },
  { name: 'Madurai', latitude: 9.925, longitude: 78.119 },
  // Pudukkottai district (registered hospitals)
  { name: 'Alangudi', latitude: 10.05, longitude: 78.62 },
  { name: 'Aranthangi', latitude: 10.17, longitude: 78.99 },
  { name: 'Illupur', latitude: 10.1, longitude: 78.72 },
  { name: 'Gandaravakottai', latitude: 10.3, longitude: 78.85 },
  { name: 'Pudukkottai', latitude: 10.38, longitude: 78.82 },
  // Tiruchirappalli district (registered hospitals)
  { name: 'Manapparai', latitude: 10.61, longitude: 78.42 },
  { name: 'Srirangam', latitude: 10.86, longitude: 78.69 },
  { name: 'Tiruchirappalli', latitude: 10.79, longitude: 78.7 },
];

/** Great-circle distance in kilometres between two coordinates. */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * True only for a real position. (0, 0) is the "no coordinates recorded" value
 * used by facilities created before location was captured, and is in the Gulf
 * of Guinea — never a distance we want to show.
 */
export function isUsableCoordinates(value: Partial<Coordinates> | null | undefined): boolean {
  if (!value) return false;
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Resolve a place from free text (a village, a facility name, an address, a
 * district…). Names are matched case-insensitively and the longest match wins,
 * so "Gandaravakottai PHC" is not mistaken for a shorter place.
 */
export function coordsForPlace(...values: Array<string | undefined | null>): Coordinates | null {
  for (const value of values) {
    if (!value) continue;
    const haystack = value.toLowerCase();
    let best: { name: string; latitude: number; longitude: number } | null = null;
    for (const place of PLACE_COORDINATES) {
      if (!haystack.includes(place.name.toLowerCase())) continue;
      if (!best || place.name.length > best.name.length) best = place;
    }
    if (best) return { latitude: best.latitude, longitude: best.longitude };
  }
  return null;
}

/** The coordinates of a facility, from its stored position or from its place. */
export function facilityCoordinates(facility: {
  latitude?: number;
  longitude?: number;
  village?: string;
  name?: string;
  address?: string;
  district?: string;
}): Coordinates | null {
  if (isUsableCoordinates(facility)) {
    return { latitude: facility.latitude as number, longitude: facility.longitude as number };
  }
  return coordsForPlace(facility.village, facility.name, facility.address, facility.district);
}

/** Distance in km from a facility to an origin, or null when it cannot be known. */
export function distanceToFacilityKm(
  origin: Coordinates | null | undefined,
  facility: Parameters<typeof facilityCoordinates>[0],
): number | null {
  if (!isUsableCoordinates(origin)) return null;
  const target = facilityCoordinates(facility);
  if (!target) return null;
  return haversineKm(origin as Coordinates, target);
}

/** "3.2 km", "12 km" — one decimal up close, whole kilometres further out. */
export function formatDistanceKm(km: number | null | undefined): string {
  if (typeof km !== 'number' || !Number.isFinite(km)) return '—';
  const rounded = km < 0.1 ? 0.1 : km;
  return `${rounded < 10 ? rounded.toFixed(1) : Math.round(rounded)} km`;
}

/**
 * Straight-line distance underestimates a road journey, so travel estimates
 * add a routing factor and a rural average speed rather than pretending the
 * crow-flies number is a drive.
 */
export function estimateTravelMinutes(km: number | null | undefined): number | null {
  if (typeof km !== 'number' || !Number.isFinite(km)) return null;
  const roadKm = km * 1.3;
  const averageSpeedKmh = 35;
  return Math.max(5, Math.round((roadKm / averageSpeedKmh) * 60));
}
