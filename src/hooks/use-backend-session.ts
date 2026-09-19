import { useEffect } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useApp } from '@/contexts/AppContext';
import {
  clearPendingLogin,
  derivePendingLogin,
  peekPendingLogin,
  readBackendToken,
  writeBackendToken,
} from '@/lib/backend-session';

export interface BackendSession {
  role: string;
  hospitalId: string | null;
  patientId: string | null;
  staffUserId: string | null;
  name: string | null;
}

/**
 * Establishes the backend session binding the Convex API requires and reports
 * it to the caller.
 *
 * Returns:
 *   undefined — still resolving
 *   null      — authenticated but not bound (no cloud data is shared)
 *   object    — bound; the backend scopes data to this role/hospital/patient
 *
 * The binding is created server-side (appSession.ts) from stored credentials,
 * so the client never gets to declare its own role. It is resumed from the
 * device token after a refresh, and, for a login that happened while offline,
 * established as soon as the pending in-memory credentials can be verified.
 */
export function useBackendSession(): BackendSession | null | undefined {
  const { currentUser } = useApp();
  const { isAuthenticated } = useConvexAuth();
  const session = useQuery(api.appSession.getMySession, isAuthenticated ? {} : 'skip');
  const resume = useMutation(api.appSession.resumeSession);
  const loginStaff = useMutation(api.appSession.loginStaffSession);
  const loginDistrict = useMutation(api.appSession.loginDistrictSession);
  const loginPatient = useMutation(api.appSession.loginPatientSession);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (session === undefined || session !== null) return; // resolving, or already bound

    let cancelled = false;
    const establish = async () => {
      // 1) Resume this device's existing binding.
      const token = readBackendToken();
      if (token) {
        const resumed = await resume({ token });
        if (cancelled) return;
        if (resumed?.ok) return;
        writeBackendToken(null); // stale token — fall through to a fresh bind
      }

      // 2) Bind a login that was completed while the backend was unreachable,
      //    or a session restored from before a binding existed (district and
      //    patient sessions can be re-derived without a password).
      const pending = peekPendingLogin() ?? derivePendingLogin(currentUser);
      if (!pending) return;
      const result =
        pending.kind === 'staff'
          ? await loginStaff({ username: pending.username, password: pending.password, fallback: pending.fallback })
          : pending.kind === 'district'
            ? await loginDistrict({ username: pending.username })
            : await loginPatient({
                email: pending.email,
                healthCardId: pending.healthCardId,
                fallback: pending.fallback,
              });
      if (cancelled) return;
      if (result?.ok && 'token' in result && result.token) {
        writeBackendToken(result.token as string);
        clearPendingLogin();
      }
    };

    void establish().catch((error: unknown) => {
      console.warn('[auth] Backend session unavailable — running on the local cache.', error);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, session, resume, loginStaff, loginDistrict, loginPatient, currentUser]);

  return session as BackendSession | null | undefined;
}
