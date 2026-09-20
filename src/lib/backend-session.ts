// ============================================================================
// Backend session helpers
// ----------------------------------------------------------------------------
// The Convex backend authorizes every call from a server-side session binding
// (see src/convex/appSession.ts). This module holds the two pieces the client
// needs around that:
//
//   TOKEN  — an opaque resume token, persisted so a refresh keeps the binding.
//            It is not a password and carries no health data.
//   PENDING — the credentials of a login that could not reach the backend yet
//            (offline-first demo): kept in MEMORY ONLY so it is never written
//            to storage, and used to establish the binding once connectivity
//            returns without a page reload.
// ============================================================================

// ----------------------------------------------------------------------------
// Anonymous-session suspension
// ----------------------------------------------------------------------------
// The app keeps an ANONYMOUS Convex Auth session purely as transport so the
// backend can authorize the demo logins. While a real sign-in is in flight
// (Overall Administrator: master email + emailed one-time code) that anonymous
// session must not be (re)created, otherwise it replaces the freshly verified
// session and the backend then sees a caller with no email address.
// ----------------------------------------------------------------------------

let anonymousAuthSuspended = false;
let anonymousSignInsInFlight = 0;

/** Pause automatic anonymous sign-in while a real sign-in is in progress. */
export function setAnonymousAuthSuspended(value: boolean): void {
  anonymousAuthSuspended = value;
}

export function isAnonymousAuthSuspended(): boolean {
  return anonymousAuthSuspended;
}

/**
 * Count an anonymous sign-in that has started but not yet finished. A real
 * sign-in must wait for these to settle: one completing mid-flow would write
 * anonymous tokens over the freshly verified session, and the backend would
 * then see a caller with no email address.
 */
export function beginAnonymousSignIn(): void {
  anonymousSignInsInFlight += 1;
}

export function endAnonymousSignIn(): void {
  anonymousSignInsInFlight = Math.max(0, anonymousSignInsInFlight - 1);
}

export function isAnonymousSignInInFlight(): boolean {
  return anonymousSignInsInFlight > 0;
}

export const BACKEND_TOKEN_KEY = 'aal_backend_token';

export function readBackendToken(): string | null {
  try {
    return localStorage.getItem(BACKEND_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeBackendToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(BACKEND_TOKEN_KEY, token);
    else localStorage.removeItem(BACKEND_TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply will not survive a refresh */
  }
}

export interface StaffFallback {
  role: string;
  facilityId?: string;
  districtId?: string;
  districtName?: string;
  staffUserId?: string;
  name?: string;
  email?: string;
  departmentId?: string;
}

/**
 * Credentials that can be re-derived from a restored session without asking the
 * user anything: the Overall Administrator (whose identity comes from the
 * authenticated master email, verified server-side) and a patient's registered
 * email. Username-based roles — staff AND District Administrators, who are
 * scoped to one district — need their password, which is never persisted, so a
 * session restored without its backend token signs in again rather than
 * guessing a district.
 */
export function derivePendingLogin(user: {
  role?: string;
  email?: string;
  healthCardId?: string;
} | null): PendingLogin | null {
  if (!user?.role) return null;
  if (user.role === 'overall_admin') return { kind: 'overall' };
  if (user.role === 'patient' && user.email) {
    return { kind: 'patient', email: user.email, healthCardId: user.healthCardId };
  }
  return null;
}

export type PendingLogin =
  | { kind: 'staff'; username: string; password: string; fallback?: StaffFallback }
  | { kind: 'overall' }
  | { kind: 'patient'; email: string; healthCardId?: string; fallback?: { patientId: string; name?: string } };

// Module-level (never persisted): cleared on logout and on a successful bind.
let pendingLogin: PendingLogin | null = null;

export function rememberPendingLogin(login: PendingLogin | null): void {
  pendingLogin = login;
}

export function peekPendingLogin(): PendingLogin | null {
  return pendingLogin;
}

export function clearPendingLogin(): void {
  pendingLogin = null;
}
