// ============================================================================
// AarogyaLink — referral status labels and next-step lookup
// ----------------------------------------------------------------------------
// The canonical workflow lives in src/convex/referralStatus.ts (statuses,
// order, transitions). This module maps those statuses onto translation keys so
// every surface shows the SAME wording, translated — a status is never spelled
// out in English in one place and Tamil in another.
// ============================================================================

import { REFERRAL_STEPS, type ReferralStatusValue } from '@/convex/referralStatus';
import type { TranslationKey } from '@/lib/i18n';

const STATUS_KEYS: Record<string, TranslationKey> = {
  created: 'created',
  accepted: 'hospitalAccepted',
  doctor_assigned: 'doctorAssigned',
  scheduled: 'appointmentScheduled',
  patient_arrived: 'arrivalVerified',
  consultation: 'consultationCompleted',
  treatment: 'treatmentStarted',
  followup: 'followup',
  closed: 'referralClosed',
  cancelled: 'cancelled',
};

/** The translation key for one canonical referral status. */
export function referralStatusKey(status: string): TranslationKey {
  return STATUS_KEYS[status] ?? 'currentStatus';
}

/**
 * The next status in the canonical chain, or null when the status is the last
 * step (or is not part of the chain). Used for the "next step" hint, so it can
 * only ever describe a step the backend actually allows.
 */
export function nextReferralStatus(status: string): ReferralStatusValue | null {
  const idx = REFERRAL_STEPS.findIndex(s => s.status === status);
  if (idx === -1 || idx === REFERRAL_STEPS.length - 1) return null;
  return REFERRAL_STEPS[idx + 1].status;
}

/** The translation key for the step AFTER `status`, or null at the end. */
export function nextReferralStepKey(status: string): TranslationKey | null {
  const next = nextReferralStatus(status);
  return next === null ? null : referralStatusKey(next);
}

/** 1-based position of a status in the canonical chain (0 when unknown). */
export function referralStepNumber(status: string): number {
  return REFERRAL_STEPS.findIndex(s => s.status === status) + 1;
}
