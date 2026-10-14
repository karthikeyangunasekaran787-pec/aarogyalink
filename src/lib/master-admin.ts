// ============================================================================
// AarogyaLink — the Overall Administrator's master address
// ----------------------------------------------------------------------------
// There is exactly ONE Overall Administrator, and this address is what proves
// it: the account has no password, a one-time code is emailed here, and the
// backend opens the master session binding only for the authenticated identity
// that owns this address (see src/convex/appSession.ts).
//
// Both sides import THIS module, so the rule cannot drift apart:
//   - the server refuses every other address (authoritative), and
//   - the sign-in screen refuses a wrong address before a code is even sent, so
//     the operator gets an immediate, accurate message instead of an emailed
//     code followed by a confusing rejection.
//
// The address is deliberately not configurable: "the Overall Administrator" is
// one specific person, and letting an environment value or a client payload
// name somebody else is the hole this closes.
// ============================================================================

/** The only address that may hold the Overall Administrator session. */
export const OVERALL_ADMIN_EMAIL = 'karthikeyangunasekaran787@gmail.com';

/** Compare an address the way the server does: trimmed, case-insensitive. */
export function normalizeMasterEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Is this address the one — and only — Overall Administrator address? */
export function isOverallAdminEmail(email: string | null | undefined): boolean {
  return normalizeMasterEmail(email) === OVERALL_ADMIN_EMAIL;
}

/** Why a master sign-in attempt was refused before any code was sent. */
export type MasterEmailRejection = 'missing' | 'not_master';

/**
 * Pre-flight check for the master sign-in form. Returns null when the address
 * may request a code, otherwise the reason it may not, so the form can show the
 * right message without guessing.
 */
export function checkMasterEmail(email: string): MasterEmailRejection | null {
  const value = email.trim();
  if (!value || !value.includes('@')) return 'missing';
  return isOverallAdminEmail(value) ? null : 'not_master';
}
