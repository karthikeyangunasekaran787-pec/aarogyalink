// ============================================================================
// AarogyaLink — the six selectable roles on the entry screen
// ----------------------------------------------------------------------------
// Data only (no icons, no JSX) so the exact role names have a single source of
// truth that can be asserted in tests without a DOM.
//
// Each card carries the role NAME and nothing else — no description, no
// supporting copy. The name is the only text a visitor should read there.
//
// Order matters: it is the grid order, which lays out as
//
//   Patient              Health Worker        Doctor
//   Hospital Administrator  District Administrator  Overall Administrator
//
// on desktop (3 columns), 2 columns on tablet and a single column on mobile.
// ============================================================================

import type { Role } from '@/types';

/** Restrained per-role tint for the card's icon tile. */
export type RoleTint = 'teal' | 'blue' | 'violet' | 'amber' | 'slate';

export interface RoleOption {
  role: Role;
  label: string;
  tint: RoleTint;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { role: 'patient', label: 'Patient', tint: 'teal' },
  { role: 'health_worker', label: 'Health Worker', tint: 'blue' },
  { role: 'doctor', label: 'Doctor', tint: 'violet' },
  { role: 'hospital_admin', label: 'Hospital Administrator', tint: 'teal' },
  { role: 'gov_admin', label: 'District Administrator', tint: 'amber' },
  { role: 'overall_admin', label: 'Overall Administrator', tint: 'slate' },
];
