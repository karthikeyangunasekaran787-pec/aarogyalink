// ============================================================================
// AarogyaLink — care-pathway network model
// ----------------------------------------------------------------------------
// The pure data behind the 3D background on the role-selection page: the order
// of the care pathway, and which node lights up when a role is chosen.
//
// Kept free of Three.js so the mapping can be unit-tested without a WebGL
// context (the scene itself cannot run in the test environment).
// ============================================================================

import type { Role } from '@/types';

/**
 * The pathway the background depicts, in order — the same care chain the
 * product implements:
 *
 *   Patient → Health Worker → Primary Health Centre → Hospital
 *           → Doctor → Treatment → Follow-up
 *
 * `district` and `hub` are the two coordinating nodes rather than clinical
 * stops: the district layer oversees facilities, and the hub represents the
 * AarogyaLink network itself.
 */
export const NETWORK_NODES = [
  { key: 'patient', label: 'Patient' },
  { key: 'health_worker', label: 'Health Worker' },
  { key: 'facility', label: 'Primary Health Centre' },
  { key: 'hospital', label: 'Hospital' },
  { key: 'doctor', label: 'Doctor' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'district', label: 'District Network' },
  { key: 'hub', label: 'AarogyaLink Network' },
] as const;

export type NetworkNodeKey = (typeof NETWORK_NODES)[number]['key'];

/** The seven clinical stops, i.e. the path drawn as a connected chain. */
export const PATHWAY_NODES: NetworkNodeKey[] = [
  'patient',
  'health_worker',
  'facility',
  'hospital',
  'doctor',
  'treatment',
  'followup',
];

/** Nodes that coordinate rather than treat — drawn off the main path. */
export const COORDINATING_NODES: NetworkNodeKey[] = ['district', 'hub'];

/**
 * Which background node responds to each selectable role.
 *
 *   Patient                → the patient at the start of the pathway
 *   Health Worker          → the field health worker
 *   Doctor                 → the treating doctor
 *   Hospital Administrator → the hospital they run
 *   District Administrator → the district coordinating node
 *   Overall Administrator  → the central AarogyaLink network node
 */
export const ROLE_NODE: Record<Role, NetworkNodeKey> = {
  patient: 'patient',
  health_worker: 'health_worker',
  doctor: 'doctor',
  hospital_admin: 'hospital',
  gov_admin: 'district',
  overall_admin: 'hub',
};

/** The node a role highlights, or null when nothing is selected yet. */
export function nodeForRole(role: Role | null | undefined): NetworkNodeKey | null {
  if (!role) return null;
  return ROLE_NODE[role] ?? null;
}
