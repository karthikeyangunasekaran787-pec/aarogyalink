// ============================================================================
// Care destinations — where a patient can be sent for care
// ----------------------------------------------------------------------------
// Two flows share this logic so they can never disagree:
//
//   • a doctor / health worker REFERS a patient to a hospital
//   • a patient BOOKS an appointment at a hospital
//
// Both must be able to reach EVERY hospital in the platform — including one in
// another district (an SIH demo requirement) — so the lists are built from the
// whole hospital directory, not just the caller's own facility.
//
// A hospital is the only kind of referral target that has an administrator to
// accept and process the referral. Seeded facility-finder entries (f1, f2, …)
// are therefore offered only as a fallback, otherwise a referral sent to one of
// them would sit in a queue nobody owns.
// ============================================================================

import type { Doctor, Facility, Hospital } from '@/types';

export interface CareDestination {
  id: string;
  name: string;
  /** District shown next to the name — the same hospital name can exist twice. */
  district?: string;
  kind: 'hospital' | 'facility';
  doctorCount: number;
}

/** Name plus district, so two same-named hospitals are distinguishable. */
export function destinationLabel(destination: CareDestination): string {
  return destination.district ? `${destination.name} — ${destination.district}` : destination.name;
}

function orderByDistrict(own: string | undefined) {
  return (a: CareDestination, b: CareDestination) => {
    const aOwn = !!own && a.district === own;
    const bOwn = !!own && b.district === own;
    if (aOwn !== bOwn) return aOwn ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

/**
 * Referral targets: every active hospital except the caller's own (a specialist
 * referral is always to another facility), with the caller's district first.
 * Facilities are only offered when no hospital is available at all.
 */
export function referralTargets(
  hospitals: Hospital[],
  facilities: Facility[],
  ownFacilityId: string,
  ownDistrict?: string,
): CareDestination[] {
  const targets: CareDestination[] = hospitals
    .filter(h => h.status === 'active' && h.id !== ownFacilityId)
    .map(h => ({
      id: h.id,
      name: h.name,
      district: h.district ?? h.districtName,
      kind: 'hospital' as const,
      doctorCount: 0,
    }));

  if (targets.length === 0) {
    for (const f of facilities) {
      if (f.id === ownFacilityId || hospitals.some(h => h.id === f.id)) continue;
      targets.push({ id: f.id, name: f.name, district: f.district, kind: 'facility', doctorCount: 0 });
    }
  }

  return targets.sort(orderByDistrict(ownDistrict));
}

/**
 * Locations a patient can book at: facilities that actually have a doctor.
 * Booking into a location with no doctor is a dead end, so those are hidden —
 * unless nothing at all has a doctor, in which case every location is offered
 * (better to show the directory than an empty screen).
 */
export function bookingLocations(
  facilities: Facility[],
  hospitals: Hospital[],
  doctors: Doctor[],
  ownDistrict?: string,
): CareDestination[] {
  const byId = new Map<string, CareDestination>();
  const add = (
    id: string,
    name: string,
    district: string | undefined,
    kind: 'hospital' | 'facility',
  ) => {
    if (byId.has(id)) return;
    byId.set(id, {
      id,
      name,
      district,
      kind,
      doctorCount: doctors.filter(d => d.facilityId === id).length,
    });
  };

  for (const h of hospitals) {
    if (h.status === 'active') add(h.id, h.name, h.district ?? h.districtName, 'hospital');
  }
  for (const f of facilities) add(f.id, f.name, f.district, 'facility');

  const all = [...byId.values()];
  const staffed = all.filter(l => l.doctorCount > 0);
  return (staffed.length > 0 ? staffed : all).sort(orderByDistrict(ownDistrict));
}
