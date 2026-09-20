// ============================================================================
// AarogyaLink — Referral Closure Engine (client hook)
// ----------------------------------------------------------------------------
// Two workflow steps are only valid at the RECEIVING hospital and are validated
// agent the stored record server-side:
//
//   • assign_doctor   — the assigned doctor must belong to that hospital
//   • verify_arrival  — the scanned QR must be for that hospital, unused and
//                       the referral must be scheduled (not closed)
//
// Both go through the Convex engine (src/convex/appReferral.ts), which writes
// the referral record and its audit event together and returns the stored
// result. The rest of the client state follows automatically through the shared
// collection subscription, so no local record is invented here.
//
// Offline: without a backend session the QR scan still works against this
// device's cached referrals (offline-first), and the message says so.
// ============================================================================

import { useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useBackendSession } from '@/hooks/use-backend-session';
import { useData } from '@/contexts/DataContext';
import { REFERRAL_STATUS } from '@/convex/referralStatus';

export interface EngineResult {
  ok: boolean;
  message: string;
  /** True when the change was applied from the local cache (no connectivity). */
  offline?: boolean;
  duplicate?: boolean;
}

/** Loose shape of what the engine mutations return (a union of ok/not-ok). */
interface EngineResponse {
  ok: boolean;
  message: string;
  duplicate?: boolean;
}

export function useReferralEngine() {
  const session = useBackendSession();
  const bound = session !== undefined && session !== null;
  const transitionReferral = useMutation(api.appReferral.transitionReferral);
  const verifyArrival = useMutation(api.appReferral.verifyArrival);
  const { referrals, confirmArrival } = useData();

  /** Destination hospital assigns one of ITS OWN doctors to the referral. */
  const assignDoctor = useCallback(async (
    referralId: string,
    doctorId: string,
    department?: string,
  ): Promise<EngineResult> => {
    if (!doctorId) return { ok: false, message: 'Select a doctor first.' };
    if (!bound) {
      return {
        ok: false,
        message: 'Assigning a doctor needs a connection — reconnect to assign the doctor and schedule the appointment.',
      };
    }
    try {
      const result = await transitionReferral({
        referralId,
        action: 'assign_doctor',
        doctorId,
        department,
      }) as unknown as EngineResponse;
      return { ok: result.ok, message: result.message, duplicate: result.duplicate };
    } catch {
      return { ok: false, message: 'Network unavailable — the doctor could not be assigned. Try again once you are back online.' };
    }
  }, [bound, transitionReferral]);

  /**
   * Verify a patient's arrival from the referral QR code.
   * The scanned value may be the referral id, the health card id or the QR
   * payload; the backend resolves it and reports the specific refusal.
   */
  const verifyArrivalByQr = useCallback(async (scanned: string): Promise<EngineResult> => {
    const code = scanned.trim();
    if (!code) return { ok: false, message: 'Scan or type the referral QR code first.' };

    if (!bound) {
      // Offline: fall back to this device's authorised referrals only.
      const match = referrals.find(r =>
        [r.referralId, r.id, r.healthCardId].some(v => !!v && v.toUpperCase() === code.toUpperCase()));
      if (!match) return { ok: false, message: 'No matching referral on this device. Reconnect to verify this QR code.' };
      if (match.status !== REFERRAL_STATUS.SCHEDULED) {
        return { ok: false, message: `Arrival can only be verified once the referral is scheduled (currently ${match.status.replace('_', ' ')}).` };
      }
      const result = await confirmArrival(match.id);
      return result.ok
        ? { ok: true, offline: true, message: `${result.message} (saved on this device — it will synchronise when you are back online.)` }
        : { ok: false, message: result.message };
    }

    try {
      const result = await verifyArrival({ scanned: code }) as unknown as EngineResponse;
      return { ok: result.ok, message: result.message };
    } catch {
      return { ok: false, message: 'Network unavailable — arrival could not be verified. Reconnect and scan again.' };
    }
  }, [bound, referrals, confirmArrival, verifyArrival]);

  return { assignDoctor, verifyArrivalByQr, engineBound: bound };
}
