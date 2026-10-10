// ============================================================================
// AarogyaLink — District + District Administrator workflow rules
// ----------------------------------------------------------------------------
// Creating a district and creating its administrator are TWO separate steps
// with a strict dependency: an administrator can only be created from the
// details of a district that already exists.
//
// These rules live here (not inline in the Overall Administrator console) so
// the console, the data layer and the tests all agree on one set of checks.
// The backend applies the same district-existence rule independently (see
// src/convex/authz.ts), so the UI is never the only thing enforcing it.
// ============================================================================

import type { District, User } from '@/types';

/** A district code is 2–4 letters; it becomes the district id `DIST-<CODE>`. */
export const DISTRICT_CODE_RE = /^[A-Za-z]{2,4}$/;

/** Minimum length enforced for a District Administrator's password. */
export const MIN_ADMIN_PASSWORD_LENGTH = 6;

/** The district's permanent, human-readable id derived from its short code. */
export function districtIdForCode(code: string): string {
  return `DIST-${code.trim().toUpperCase()}`;
}

export interface DistrictDraft {
  name: string;
  code: string;
  headquarters: string;
}

export interface AdminDraft {
  name: string;
  email: string;
  username: string;
  password: string;
}

export type RuleResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Validate a new district on its own — name, code and code uniqueness. Nothing
 * here creates an administrator; that is a separate, later operation.
 */
export function validateDistrictDraft(
  draft: DistrictDraft,
  districts: District[],
): RuleResult<DistrictDraft> {
  const name = draft.name.trim();
  const code = draft.code.trim();
  const headquarters = draft.headquarters.trim();

  if (!name) return { ok: false, error: 'Enter the district name.' };
  if (!code) return { ok: false, error: 'Enter a short district code (e.g. KRR).' };
  if (!DISTRICT_CODE_RE.test(code)) {
    return { ok: false, error: 'The district code must be 2–4 letters (it becomes DIST-<code>).' };
  }
  const districtId = districtIdForCode(code);
  if (districts.some(d => d.districtId === districtId)) {
    return { ok: false, error: `${districtId} already exists. Choose a different code.` };
  }
  return { ok: true, value: { name, code, headquarters } };
}

/** The administrators bound to one district (matched by district id, never name). */
export function districtAdmins(users: User[], districtId: string): User[] {
  return users.filter(u => u.role === 'gov_admin' && u.districtId === districtId);
}

/**
 * Validate a new District Administrator against an EXISTING district.
 *
 * The district must be passed in as a stored record, so the account is always
 * linked by the district's database id rather than by a name typed into a form.
 */
export function validateDistrictAdminDraft(
  admin: AdminDraft,
  district: District | undefined,
  users: User[],
): RuleResult<District> {
  if (!district) {
    return { ok: false, error: 'Create the district first — an administrator can only be added to an existing district.' };
  }
  if (districtAdmins(users, district.districtId).length > 0) {
    return {
      ok: false,
      error: `${district.displayName} already has a District Administrator. Delete that account before registering another.`,
    };
  }

  const name = admin.name.trim();
  const email = admin.email.trim();
  const username = admin.username.trim();

  if (!name || !email || !username || !admin.password) {
    return { ok: false, error: 'Name, email, username and password are all required.' };
  }
  if (!email.includes('@')) return { ok: false, error: 'Enter a valid email address.' };
  if (admin.password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return { ok: false, error: `The password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.` };
  }
  if (users.some(u => u.username?.toLowerCase() === username.toLowerCase())) {
    return { ok: false, error: `Username "${username}" is already taken.` };
  }
  return { ok: true, value: district };
}
