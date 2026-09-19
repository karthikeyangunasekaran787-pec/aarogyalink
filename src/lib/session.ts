// ============================================================================
// AarogyaLink - Persisted application session
// ----------------------------------------------------------------------------
// The demo login (staff username/password, patient email, district admin)
// produces an application session that must survive a browser refresh so the
// user stays on their dashboard. It is stored in localStorage — which is
// intentional, since AarogyaLink is offline-first — and kept separate from
// temporary React state.
//
// Kept dependency-free so the restore logic can be unit tested without a DOM.
// ============================================================================

export const AUTH_SESSION_KEY = 'aal_auth_session';

export interface StoredSession<U = unknown> {
  user: U;
  role: string;
}

/** Read the persisted session, or null when absent/corrupted. */
export function readStoredSession<U = unknown>(): StoredSession<U> | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession<U> | null;
    if (parsed && typeof parsed === 'object' && parsed.user && parsed.role) {
      return parsed;
    }
  } catch {
    /* corrupted cache or storage unavailable — treat as signed out */
  }
  return null;
}

/** Persist (or clear, when passed null) the application session. */
export function writeStoredSession<U = unknown>(session: StoredSession<U> | null): void {
  try {
    if (session) localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    /* quota exceeded / private mode — the app still works for this tab */
  }
}
