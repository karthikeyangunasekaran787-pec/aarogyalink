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
  staffUserId?: string;
  name?: string;
  email?: string;
  departmentId?: string;
}

/** Username of the demo District Administrator account (no password by design). */
export const DISTRICT_ADMIN_USERNAME = 'collector.dist';

/**
 * Credentials that can be re-derived from a restored session without asking
 * the user anything: the district demo account and a patient's registered
 * email. Staff roles need their password, which is never persisted, so a staff
 * session restored from before the backend binding existed must sign in again.
 */
export function derivePendingLogin(user: {
  role?: string;
  email?: string;
  healthCardId?: string;
} | null): PendingLogin | null {
  if (!user?.role) return null;
  if (user.role === 'gov_admin') return { kind: 'district', username: DISTRICT_ADMIN_USERNAME };
  if (user.role === 'patient' && user.email) {
    return { kind: 'patient', email: user.email, healthCardId: user.healthCardId };
  }
  return null;
}

export type PendingLogin =
  | { kind: 'staff'; username: string; password: string; fallback?: StaffFallback }
  | { kind: 'district'; username: string }
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
