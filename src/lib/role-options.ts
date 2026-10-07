// ============================================================================
// AarogyaLink — the six selectable roles on the entry screen
// ----------------------------------------------------------------------------
// Data only (no icons, no JSX) so the exact labels and one-line descriptions
// have a single source of truth that can be asserted in tests without a DOM.
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
  /** One short line. Deliberately not a sentence. */
  description: string;
  tint: RoleTint;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { role: 'patient', label: 'Patient', description: 'Access your care', tint: 'teal' },
  {
    role: 'health_worker',
    label: 'Health Worker',
    description: 'Register & refer patients',
    tint: 'blue',
  },
  { role: 'doctor', label: 'Doctor', description: 'Consult & manage care', tint: 'violet' },
  {
    role: 'hospital_admin',
    label: 'Hospital Administrator',
    description: 'Manage referrals & staff',
    tint: 'teal',
  },
  {
    role: 'gov_admin',
    label: 'District Administrator',
    description: 'Monitor district healthcare',
    tint: 'amber',
  },
  {
    role: 'overall_admin',
    label: 'Overall Administrator',
    description: 'Manage system & districts',
    tint: 'slate',
  },
];
