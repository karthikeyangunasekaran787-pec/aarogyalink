// ============================================================================
// AarogyaLink — "what happens next" for every open referral (pure)
// ----------------------------------------------------------------------------
// An open referral is one somebody still has to act on. This module derives, for
// each one, the NEXT step of the canonical workflow (src/convex/referralStatus.ts
// — the same actions the engine accepts), who owns it, and when it was due.
//
// Nothing is invented: the step comes from the referral's stored status, the
// deadline from the stored appointment/follow-up/escalation fields, and the
// missed-visit classification from src/lib/missed-referrals.ts. That is what
// makes the tracker and the follow-up queue agree on every device.
// ============================================================================

import {
  REFERRAL_STATUS,
  type ReferralAction,
} from '../convex/referralStatus';
import {
  ATTENDANCE_GRACE_HOURS,
  expectedAttendanceAt,
  escalationFor,
  followupStateOf,
  type Escalation,
} from './missed-referrals';
import type { TranslationKey } from './i18n';
import type { Referral, ReferralEvent, ReferralFollowupState } from '../types';

/** Which side of the referral the step belongs to. */
export type NextActionOwner = 'source' | 'destination' | 'assigned_doctor' | 'either';

export interface NextAction {
  /** The engine action that performs this step (never a raw status). */
  action: ReferralAction;
  /** Translation key for the action label. */
  labelKey: TranslationKey;
  /** Who has to do it. */
  owner: NextActionOwner;
  /** When it was due, when the record carries a date for it. */
  dueAt: Date | null;
  /** True once that moment has passed. */
  overdue: boolean;
}

interface NextActionSpec {
  action: ReferralAction;
  labelKey: TranslationKey;
  owner: NextActionOwner;
}

/**
 * The step that moves each status forward, using the engine's own action names.
 * Statuses with no step (terminal) are absent on purpose.
 */
const NEXT_ACTION_BY_STATUS: Record<string, NextActionSpec> = {
  [REFERRAL_STATUS.CREATED]: { action: 'accept', labelKey: 'acceptReferral', owner: 'destination' },
  [REFERRAL_STATUS.ACCEPTED]: { action: 'assign_doctor', labelKey: 'assignDoctor', owner: 'destination' },
  [REFERRAL_STATUS.DOCTOR_ASSIGNED]: { action: 'schedule', labelKey: 'scheduleAppointment', owner: 'destination' },
  [REFERRAL_STATUS.SCHEDULED]: { action: 'verify_arrival', labelKey: 'verifyArrival', owner: 'destination' },
  // Uncertain attendance: a person establishes what actually happened. The app
  // never decides this by itself (see missed-referrals.ts).
  [REFERRAL_STATUS.AWAITING_CONFIRMATION]: {
    action: 'confirm_missed',
    labelKey: 'awaitingConfirmation',
    owner: 'either',
  },
  [REFERRAL_STATUS.MISSED]: { action: 'record_contact', labelKey: 'recordContact', owner: 'either' },
  [REFERRAL_STATUS.CONTACTED]: { action: 'reschedule_referral', labelKey: 'rescheduleAppointment', owner: 'either' },
  [REFERRAL_STATUS.RESCHEDULED]: { action: 'verify_arrival', labelKey: 'verifyArrival', owner: 'destination' },
  [REFERRAL_STATUS.ARRIVAL_VERIFIED]: { action: 'start_consultation', labelKey: 'startConsultation', owner: 'assigned_doctor' },
  [REFERRAL_STATUS.CONSULTATION_COMPLETED]: {
    action: 'complete_consultation',
    labelKey: 'completeConsultation',
    owner: 'assigned_doctor',
  },
  [REFERRAL_STATUS.TREATMENT_STARTED]: { action: 'close', labelKey: 'closeReferral', owner: 'assigned_doctor' },
  [REFERRAL_STATUS.FOLLOW_UP]: { action: 'close', labelKey: 'closeReferral', owner: 'assigned_doctor' },
};

/** Is the referral finished (nothing left to do)? */
export function isOpenReferral(referral: Pick<Referral, 'status'>): boolean {
  const status = referral.status;
  return status !== REFERRAL_STATUS.CLOSED && status !== REFERRAL_STATUS.CANCELLED;
}

/**
 * When this step was due, from the stored record.
 *
 *   • awaiting an arrival  → the appointment that was missed (plus the grace
 *                            window in which a patient may still turn up)
 *   • a missed referral    → the escalation deadline its priority already set
 *   • a follow-up to close → the scheduled follow-up date
 */
function dueAtFor(referral: Referral, now: Date): Date | null {
  switch (referral.status) {
    case REFERRAL_STATUS.SCHEDULED:
    case REFERRAL_STATUS.RESCHEDULED: {
      const expected = expectedAttendanceAt(referral);
      if (!expected) return null;
      return new Date(expected.getTime() + ATTENDANCE_GRACE_HOURS * 36e5);
    }
    case REFERRAL_STATUS.AWAITING_CONFIRMATION:
      return expectedAttendanceAt(referral);
    case REFERRAL_STATUS.MISSED:
      return escalationFor(referral, now)?.dueAt ?? null;
    case REFERRAL_STATUS.FOLLOW_UP: {
      // The follow-up itself is the due date: it closes once it has happened.
      // The engine records it as `followUpDate`; the offline path stores it as
      // the appointment on the referral, so both are read here.
      const followUpDate = referral.followUpDate ?? referral.appointmentDate;
      return followUpDate
        ? expectedAttendanceAt({ appointmentDate: followUpDate, appointmentTime: referral.appointmentTime })
        : null;
    }
    default:
      return null;
  }
}

/** The single next step of an open referral, or null when it is finished. */
export function nextActionFor(referral: Referral, now: Date): NextAction | null {
  const spec = NEXT_ACTION_BY_STATUS[referral.status];
  if (!spec) return null;
  const dueAt = dueAtFor(referral, now);
  return {
    ...spec,
    dueAt,
    overdue: dueAt !== null && now.getTime() > dueAt.getTime(),
  };
}

export interface OpenReferralRow {
  referral: Referral;
  next: NextAction;
  /** Missed-visit classification — the same one the follow-up queue shows. */
  followupState: ReferralFollowupState;
  /** Escalation (administrative contact deadline) for a missed referral. */
  escalation: Escalation | null;
  /** Hours the referral has been in its current status (null without events). */
  hoursInStatus: number | null;
}

/** Hours since the record entered its current status, oldest event first. */
export function hoursInStatus(referral: Referral, events: ReferralEvent[], now: Date): number | null {
  const relevant = events
    .filter(event => event.referralId === referral.id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const last = [...relevant]
    .reverse()
    .find(event => (event.newStatus ?? event.canonicalStatus ?? event.status) === referral.status);
  const since = last?.timestamp ?? referral.updatedAt;
  const time = new Date(since).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, (now.getTime() - time) / 36e5);
}

/**
 * Every open referral, the most urgent next step first:
 *
 *   1. overdue steps (the deadline has passed), longest overdue first
 *   2. referrals in the missed-visit cycle (uncertain or missed) — those need a
 *      person before anything else
 *   3. by clinical priority, then by how long the referral has been waiting
 */
export function openReferralTracker(
  referrals: Referral[],
  events: ReferralEvent[],
  now: Date,
  limit?: number,
): OpenReferralRow[] {
  const rows: OpenReferralRow[] = [];
  for (const referral of referrals) {
    if (!isOpenReferral(referral)) continue;
    const next = nextActionFor(referral, now);
    if (!next) continue;
    rows.push({
      referral,
      next,
      followupState: followupStateOf(referral, now),
      escalation: referral.missedAt ? escalationFor(referral, now) : null,
      hoursInStatus: hoursInStatus(referral, events, now),
    });
  }

  const followupRank = (state: ReferralFollowupState): number =>
    state === 'missed' ? 0 : state === 'awaiting_confirmation' ? 1 : state === 'contacted' ? 2 : state === 'rescheduled' ? 3 : 4;
  const priorityRank: Record<Referral['priority'], number> = { emergency: 0, urgent: 1, routine: 2 };

  rows.sort((a, b) => {
    if (a.next.overdue !== b.next.overdue) return a.next.overdue ? -1 : 1;
    if (a.next.overdue && b.next.overdue) {
      const aDue = a.next.dueAt?.getTime() ?? 0;
      const bDue = b.next.dueAt?.getTime() ?? 0;
      if (aDue !== bDue) return aDue - bDue;
    }
    if (followupRank(a.followupState) !== followupRank(b.followupState)) {
      return followupRank(a.followupState) - followupRank(b.followupState);
    }
    if (priorityRank[a.referral.priority] !== priorityRank[b.referral.priority]) {
      return priorityRank[a.referral.priority] - priorityRank[b.referral.priority];
    }
    return (b.hoursInStatus ?? 0) - (a.hoursInStatus ?? 0);
  });

  return typeof limit === 'number' ? rows.slice(0, limit) : rows;
}

/** Counts for the tracker's summary line. */
export interface OpenReferralSummary {
  open: number;
  overdue: number;
  /** Open referrals waiting on a person in the missed-visit cycle. */
  followupQueue: number;
  /** The oldest overdue referral, if any. */
  worstOverdueHours: number | null;
}

export function openReferralSummary(rows: OpenReferralRow[], now: Date): OpenReferralSummary {
  const overdue = rows.filter(row => row.next.overdue);
  const overdueHours = overdue
    .map(row => (row.next.dueAt ? (now.getTime() - row.next.dueAt.getTime()) / 36e5 : 0));
  return {
    open: rows.length,
    overdue: overdue.length,
    followupQueue: rows.filter(row =>
      row.followupState === 'awaiting_confirmation' ||
      row.followupState === 'missed' ||
      row.followupState === 'contacted' ||
      row.followupState === 'rescheduled',
    ).length,
    worstOverdueHours: overdueHours.length > 0 ? Math.max(...overdueHours) : null,
  };
}
