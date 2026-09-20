import { useEffect } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import {
  beginAnonymousSignIn,
  endAnonymousSignIn,
  isAnonymousAuthSuspended,
} from '@/lib/backend-session';

/**
 * Establishes a Convex Auth session so the backend functions (appData) can be
 * called with authorization.
 *
 * AarogyaLink's demo login (staff username/password, patient email, district
 * auto-login) is the application-level session and is NOT a Convex Auth
 * credential. This hook adds the transport-level session the backend requires:
 * if the visitor already has a Convex Auth session it is used as-is, otherwise
 * an anonymous session is created once.
 *
 * Returns `true` only when an authenticated Convex session is usable. Callers
 * gate cloud queries on it so they never fire unauthenticated and throw; when
 * it stays `false` (offline / auth unavailable) the app keeps working on its
 * localStorage cache.
 *
 * Two things it deliberately does NOT do:
 *   • it never creates an anonymous session while a real sign-in is in flight
 *     (Overall Administrator, master email + emailed code) — that would replace
 *     the freshly verified session and leave the backend looking at a caller
 *     with no email address;
 *   • it never reports ready without a session, so a failed sign-in or a logout
 *     drops the app back to its offline cache instead of firing queries it is
 *     not authorized to make.
 *
 * Failure is retried with backoff (capped) so a start made offline does not
 * disable cloud sync for the rest of the session: once connectivity returns,
 * the session is established and queued offline changes sync up.
 */

/** Backoff between session attempts. */
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 30000;
/** How often to re-check while a real sign-in is in progress. */
const SUSPENDED_POLL_MS = 400;

export function useConvexSessionReady(): boolean {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();

  useEffect(() => {
    // Wait for the stored-session check to settle before deciding, and do
    // nothing when a session already exists.
    if (isLoading || isAuthenticated) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const attempt = () => {
      if (cancelled) return;
      // A real sign-in (master email + emailed code) is in progress: creating
      // an anonymous session now would REPLACE it. Wait for it to finish.
      if (isAnonymousAuthSuspended()) {
        timer = setTimeout(attempt, SUSPENDED_POLL_MS);
        return;
      }
      // Flag the attempt as in flight, so a real sign-in starting now can wait
      // for it instead of having its verified session overwritten by anonymous
      // tokens landing a moment later.
      beginAnonymousSignIn();
      void signIn('anonymous')
        .catch((error: unknown) => {
          if (cancelled) return;
          attempts += 1;
          if (attempts === 1) {
            console.warn(
              '[auth] Convex session not available yet — running on the local cache and retrying.',
              error,
            );
          }
          const delay = Math.min(RETRY_BASE_MS * attempts, RETRY_MAX_MS);
          timer = setTimeout(attempt, delay);
        })
        .finally(endAnonymousSignIn);
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, isAuthenticated, signIn]);

  // Ready exactly when a Convex Auth session is live; until then the cloud query
  // is skipped and the app runs from its offline cache.
  return isAuthenticated;
}
