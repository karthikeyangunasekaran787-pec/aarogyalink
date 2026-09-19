import { useEffect, useRef, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';

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
 */
export function useConvexSessionReady(): boolean {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      setReady(true);
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    signIn('anonymous')
      .then(() => setReady(true))
      .catch((error) => {
        console.warn(
          '[auth] Anonymous Convex session unavailable — running on the local cache only.',
          error,
        );
        setReady(false);
      });
  }, [isLoading, isAuthenticated, signIn]);

  return ready;
}
