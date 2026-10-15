// ============================================================================
// AarogyaLink — Referral closure rules (pure)
// ----------------------------------------------------------------------------
// ONE place that decides whether a referral may actually be closed, shared by
// the backend engine (convex/appReferral.ts), the collection-path merge
// (convex/authz.ts) and the UI. The rules are pure functions of the stored
// record, so the same payload can never be accepted in one place and refused in
// another — and every refusal carries the reason the person sees.
//
// Two closures exist, and they need different evidence:
//
//   • the CARE path (treatment → closed, follow-up → closed): the care that was
//     given IS the completion information, so the outcome is derived as
//     `treatment_completed`. A referral that went through the missed-referral
//     follow-up cannot be closed that way — see the follow-up gate below.
//
//   • the MISSED path (missed → closed): a person has to say what happened.
//     The outcome comes from the canonical vocabulary, a note is required, and
//     attendance at another hospital must name that hospital.
//
// Follow-up gate: a referral sitting at FOLLOW-UP is only closed once its
// follow-up is resolved — a recorded follow-up, a follow-up date that has
// already passed, or the clinician explicitly confirming it was done. Closing
// is permanent, so it is never derived from the mere existence of a scheduled
// follow-up.
// ============================================================================

// Relative imports on purpose: this module is bundled into the Convex functions
// as well as the app, and the Convex tsconfig does not know the `@/` alias.
import { REFERRAL_STATUS } from '../convex/referralStatus';
import { MISSED_CLOSURE_OUTCOMES, expectedAttendanceAt } from './missed-referrals';
import type { FollowupStatus, MissedClosureOutcome } from '../types';

/** The outcome recorded when care finished (there is nothing else to document). */
export const CARE_COMPLETION_OUTCOME = 'treatment_completed';

export type ClosureOutcome = MissedClosureOutcome | typeof CARE_COMPLETION_OUTCOME;

/** Every outcome a closure may carry — nothing else is a documented outcome. */
export const CLOSURE_OUTCOME_VALUES: ClosureOutcome[] = [
  CARE_COMPLETION_OUTCOME,
  ...MISSED_CLOSURE_OUTCOMES.map(outcome => outcome.value),
];

/**
 * Statuses whose closure must be documented by a person. A referral that went
 * through the missed visit is never closed by the care-pathway shortcut.
 */
const MISSED_PATH_STATUSES = new Set<string>([
  REFERRAL_STATUS.AWAITING_CONFIRMATION,
  REFERRAL_STATUS.MISSED,
  REFERRAL_STATUS.CONTACTED,
]);

/** Statuses a follow-up is expected from (the referral is at the last stage). */
const FOLLOW_UP_STATUS = REFERRAL_STATUS.FOLLOW_UP;

/** What the caller supplies when closing a referral. */
export interface ClosureDraft {
  /** Documented outcome. Omitted on the care path — it is then derived. */
  outcome?: string;
  notes?: string;
  /** Hospital the patient attended instead (attendance elsewhere). */
  otherHospitalName?: string;
  /**
   * The clinician confirms the follow-up was actually completed. Only ever set
   * by a person: nothing here infers that a scheduled follow-up happened.
   */
  followUpResolved?: boolean;
}

/** The stored facts a closure is judged against. */
export interface ClosureContext {
  /** Status the referral is stored at (or, on the collection path, came from). */
  from: string | undefined;
  now: Date;
  /** Scheduled follow-up date / time on the referral (YYYY-MM-DD, HH:mm). */
  followUpDate?: string;
  followUpTime?: string;
  /** Stored follow-up record of this referral, if one exists. */
  followUpStatus?: FollowupStatus | string;
  /** Hospital the patient attended elsewhere (stored field of the record). */
  attendedElsewhereHospital?: string;
}

export type ClosureValidation =
  | { ok: true; outcome: ClosureOutcome; notes?: string }
  | { ok: false; message: string };

/** Is this the missed-referral path (documentation required)? */
export function isMissedClosurePath(from: string | undefined): boolean {
  return MISSED_PATH_STATUSES.has(from ?? '');
}

/**
 * The outcome a closure records: the caller's documented outcome, or — on the
 * care pathway, where the treatment itself is the completion information —
 * `treatment_completed`.
 */
export function closureOutcomeFor(draft: ClosureDraft, from: string | undefined): string | undefined {
  if (draft.outcome && draft.outcome.length > 0) return draft.outcome;
  return isMissedClosurePath(from) ? undefined : CARE_COMPLETION_OUTCOME;
}

/** When the follow-up was due, from the stored follow-up date/time. */
export function followUpDueAt(context: Pick<ClosureContext, 'followUpDate' | 'followUpTime'>): Date | null {
  return expectedAttendanceAt({
    appointmentDate: context.followUpDate,
    appointmentTime: context.followUpTime,
  });
}

/**
 * Is the follow-up behind this referral resolved? True when it was recorded
 * (completed or missed), when its date has genuinely passed, or when the
 * clinician confirms it was done. A scheduled-but-future follow-up is NOT
 * resolved: nobody knows yet whether it happened.
 */
export function isFollowUpResolved(draft: ClosureDraft, context: ClosureContext): boolean {
  if (draft.followUpResolved === true) return true;
  const status = context.followUpStatus;
  if (status === 'completed' || status === 'missed') return true;
  const due = followUpDueAt(context);
  return due !== null && context.now.getTime() >= due.getTime();
}

/**
 * May this referral be closed, with the information supplied?
 *
 * Returns the outcome to store, or the message explaining exactly what is
 * missing — the same wording the UI shows, because the backend owns this rule.
 */
export function validateReferralClosure(draft: ClosureDraft, context: ClosureContext): ClosureValidation {
  const from = context.from;
  const missedPath = isMissedClosurePath(from);
  const outcome = closureOutcomeFor(draft, from);

  if (!outcome || !CLOSURE_OUTCOME_VALUES.includes(outcome as ClosureOutcome)) {
    return {
      ok: false,
      message: missedPath
        ? 'A documented outcome is required to close a missed referral.'
        : 'A documented outcome is required to close this referral.',
    };
  }

  // A referral that went through the missed visit is never closed with the
  // care-pathway outcome: the follow-up that was made IS the completion
  // information, and it has to be recorded explicitly.
  if (missedPath && outcome === CARE_COMPLETION_OUTCOME) {
    return {
      ok: false,
      message: 'Choose the outcome of the follow-up that was made, so the missed visit is closed with what actually happened.',
    };
  }

  const notes = typeof draft.notes === 'string' && draft.notes.trim().length > 0 ? draft.notes.trim() : undefined;
  if (missedPath && !notes) {
    return { ok: false, message: 'A note is required to close a missed referral.' };
  }

  if (outcome === 'attended_another_hospital') {
    const hospital = draft.otherHospitalName?.trim() || context.attendedElsewhereHospital?.trim();
    if (!hospital) {
      return { ok: false, message: 'Name the hospital the patient attended.' };
    }
  }

  // ── Follow-up gate ────────────────────────────────────────────────
  // Closure is permanent: a referral at FOLLOW-UP is only closed once the
  // follow-up behind it is resolved (recorded, due, or confirmed by the
  // clinician). Unresolved, the next step is the follow-up — not closure.
  if (!missedPath && from === FOLLOW_UP_STATUS && !isFollowUpResolved(draft, context)) {
    const due = followUpDueAt(context);
    return {
      ok: false,
      message: due
        ? `The follow-up scheduled for ${due.toISOString().slice(0, 10)} has not been recorded yet. Complete the follow-up, or confirm it was done, before closing the referral.`
        : 'The follow-up for this referral has not been recorded yet. Complete the follow-up, or confirm it was done, before closing the referral.',
    };
  }

  return { ok: true, outcome: outcome as ClosureOutcome, notes };
}
