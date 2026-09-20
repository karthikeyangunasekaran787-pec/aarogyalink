import { useEffect, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { isAnonymousAuthSuspended } from '@/lib/backend-session';

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
  // Set from the sign-in promise (asynchronously, never during the effect
  // body) so readiness does not depend solely on the auth flag re-rendering.
  const [signInComplete, setSignInComplete] = useState(false);

  // Readiness is about the SESSION, so drop it when the session goes away
  // (logout, failed sign-in) — otherwise the cloud query would fire
  // unauthenticated and the app would keep asking for data it cannot get.
  useEffect(() => {
    if (!isAuthenticated) setSignInComplete(false);
  }, [isAuthenticated]);

  useEffect(() => {
    // Wait for the stored-session check to settle before deciding.
    if (isLoading) return;
    // A real session already exists: nothing to do.
    if (isAuthenticated) {
      setSignInComplete(true);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const attempt = () => {
      if (cancelled) return;
      // A real sign-in (master email + emailed code) is in progress: creating
      // an anonymous session now would REPLACE it and leave the backend with a
      // caller that has no email address. Wait for the sign-in to finish.
      if (isAnonymousAuthSuspended()) {
        timer = setTimeout(attempt, SUSPENDED_POLL_MS);
        return;
      }
      signIn('anonymous')
        .then(() => {
          if (!cancelled) setSignInComplete(true);
        })
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
        });
    };

    attempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isLoading, isAuthenticated, signIn]);

  // Ready when a Convex session exists; until then the cloud query is skipped
  // and the app runs from its offline cache.
  return isAuthenticated && signInComplete;
}
