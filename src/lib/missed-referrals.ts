// ============================================================================
// AarogyaLink — Missed-referral follow-up engine (pure)
// ----------------------------------------------------------------------------
// ONE place that decides what "missed" means, so the health-worker queue, the
// hospital desk, the district metrics and the backend sweep can never disagree:
//
//   • attendance is UNCERTAIN, not missed, when the expected time has passed and
//     nobody has recorded anything. A hospital failing to update its records is
//     never treated as proof that the patient did not attend.
//   • a referral becomes MISSED only when a person documents non-attendance
//     (confirm_missed) — never by a timer and never by this module.
//   • nothing here guesses a patient's response, diagnoses anybody, or changes
//     the clinical priority: escalation below is an ADMINISTRATIVE contact
//     deadline derived from the priority a clinician already set.
//
// Everything is derived from stored records, so it is idempotent by construction
// (no duplicate missed records, no repeated detection) and identical on every
// device after a refresh.
// ============================================================================

// Relative imports on purpose: this module is bundled into the Convex functions
// as well as the app, and the Convex tsconfig does not know the `@/` alias.
import { REFERRAL_STATUS } from '../convex/referralStatus';
import type {
  ContactMethod,
  MissedClosureOutcome,
  MissedReason,
  Referral,
  ReferralEvent,
  ReferralFollowupState,
  ReferralStatus,
} from '../types';

/** The stored timing fields the follow-up engine reads. */
export interface AppointmentLike {
  appointmentDate?: string;
  appointmentTime?: string;
}

// ── Canonical vocabularies (translation keys live in i18n.ts) ───────────────

export const MISSED_REASONS: { value: MissedReason; key: string }[] = [
  { value: 'transport', key: 'reasonTransport' },
  { value: 'financial', key: 'reasonFinancial' },
  { value: 'forgot', key: 'reasonForgot' },
  { value: 'no_appointment_available', key: 'reasonNoAppointment' },
  { value: 'could_not_contact', key: 'reasonCouldNotContact' },
  { value: 'patient_refused', key: 'reasonPatientRefused' },
  { value: 'attended_another_hospital', key: 'reasonAttendedAnother' },
  { value: 'other', key: 'reasonOther' },
];

export const CONTACT_METHODS: { value: ContactMethod; key: string }[] = [
  { value: 'phone_call', key: 'methodPhoneCall' },
  { value: 'home_visit', key: 'methodHomeVisit' },
  { value: 'in_person', key: 'methodInPerson' },
  { value: 'sms', key: 'methodSms' },
  { value: 'whatsapp', key: 'methodWhatsapp' },
  { value: 'other', key: 'methodOther' },
];

export const MISSED_CLOSURE_OUTCOMES: { value: MissedClosureOutcome; key: string }[] = [
  { value: 'patient_unreachable', key: 'outcomeUnreachable' },
  { value: 'patient_refused', key: 'outcomeRefused' },
  { value: 'attended_another_hospital', key: 'outcomeAttendedElsewhere' },
  { value: 'clinically_resolved', key: 'outcomeClinicallyResolved' },
  { value: 'duplicate_referral', key: 'outcomeDuplicate' },
];

export const MISSED_REASON_VALUES = MISSED_REASONS.map(r => r.value);
export const CONTACT_METHOD_VALUES = CONTACT_METHODS.map(m => m.value);

/**
 * What a health worker records about one follow-up contact. Every field is
 * supplied by the person making the contact — nothing is inferred, and `reached`
 * is only ever true when the patient was actually spoken to.
 */
export interface FollowupContactInput {
  method: ContactMethod;
  /** Did the contact actually reach the patient? */
  reached?: boolean;
  /** What the health worker did about it. */
  actionTaken?: string;
  /** When to try again (YYYY-MM-DD). */
  nextFollowUpDate?: string;
  /** Free-text note kept in the audit trail. */
  notes?: string;
  /** When the contact happened, if it was not just now (ISO datetime). */
  contactAt?: string;
  /** Updated/confirmed reason for the missed appointment. */
  reason?: MissedReason;
}

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * How long after the appointment the referral is still treated as "the patient
 * may be on their way". Within this window nothing is flagged at all; after it,
 * the referral is AWAITING CONFIRMATION — not missed.
 */
export const ATTENDANCE_GRACE_HOURS = 4;

/**
 * The moment attendance was expected, from the stored appointment date/time.
 * `appointmentDate` is YYYY-MM-DD and `appointmentTime` is HH:mm; a missing time
 * is read as the start of that day, and a missing date means there is nothing to
 * compare against (a referral is never flagged without one).
 */
export function expectedAttendanceAt(referral: AppointmentLike): Date | null {
  const date = referral.appointmentDate?.trim();
  if (!date) return null;
  const time = referral.appointmentTime?.trim();
  const iso = time && /^\d{1,2}:\d{2}/.test(time)
    ? `${date}T${time.length === 4 ? `0${time}` : time}:00`
    : `${date}T00:00:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Hours since the expected attendance (negative = still in the future). */
export function hoursOverdue(referral: AppointmentLike, now: Date): number | null {
  const expected = expectedAttendanceAt(referral);
  if (!expected) return null;
  return (now.getTime() - expected.getTime()) / 36e5;
}

/** Whole days past the expected attendance (0 while it is still in the future). */
export function daysOverdue(referral: AppointmentLike, now: Date): number {
  const hours = hoursOverdue(referral, now);
  if (hours === null || hours <= 0) return 0;
  return Math.floor(hours / 24);
}

/** Statuses where the visit is finished or withdrawn — never flagged. */
const SETTLED = new Set<string>([
  REFERRAL_STATUS.CLOSED,
  REFERRAL_STATUS.CANCELLED,
  REFERRAL_STATUS.ARRIVAL_VERIFIED,
  REFERRAL_STATUS.CONSULTATION_COMPLETED,
  REFERRAL_STATUS.TREATMENT_STARTED,
  REFERRAL_STATUS.FOLLOW_UP,
]);

/**
 * The derived follow-up state of one referral. This is the classification the
 * whole app displays; it is computed from stored records every time, so it can
 * never be stale, duplicated or out of step between devices.
 */
export function followupStateOf(
  referral: AppointmentLike & { status: ReferralStatus },
  now: Date,
): ReferralFollowupState {
  const status = referral.status;
  if (status === REFERRAL_STATUS.CANCELLED) return 'cancelled';
  if (SETTLED.has(status)) return 'closed';
  if (status === REFERRAL_STATUS.CONTACTED) return 'contacted';
  if (status === REFERRAL_STATUS.MISSED) return 'missed';
  if (status === REFERRAL_STATUS.RESCHEDULED || status === REFERRAL_STATUS.AWAITING_CONFIRMATION) {
    // Already recorded as uncertain/awaiting; keep reporting it as such.
    if (status === REFERRAL_STATUS.AWAITING_CONFIRMATION) return 'awaiting_confirmation';
    return followupStateOf({ ...referral, status: REFERRAL_STATUS.SCHEDULED }, now) === 'awaiting_confirmation'
      ? 'awaiting_confirmation'
      : 'rescheduled';
  }
  // In flight: only a scheduled appointment can become uncertain, and only once
  // the grace window has passed. Everything else is on track.
  if (status !== REFERRAL_STATUS.SCHEDULED) return 'on_track';
  const hours = hoursOverdue(referral, now);
  if (hours === null || hours <= ATTENDANCE_GRACE_HOURS) return 'on_track';
  return 'awaiting_confirmation';
}

/** Is this referral worked on by the missed-referral queue right now? */
export function isInFollowupQueue(state: ReferralFollowupState): boolean {
  return state === 'awaiting_confirmation' || state === 'missed' || state === 'contacted' || state === 'rescheduled';
}

/**
 * The Automatic detection decision for one referral.
 *
 * Returns null when nothing should be written (still in the future, already
 * flagged, settled, or the event already exists — which is what makes repeated
 * sweeps harmless). The status it returns is AWAITING CONFIRMATION: the sweep
 * never marks a referral MISSED, because that requires a person.
 */
export function sweepDecision(
  referral: AppointmentLike & { id: string; status: ReferralStatus },
  now: Date,
  existingEventIds: ReadonlySet<string> = new Set(),
): { status: typeof REFERRAL_STATUS.AWAITING_CONFIRMATION; eventId: string } | null {
  if (referral.status !== REFERRAL_STATUS.SCHEDULED && referral.status !== REFERRAL_STATUS.RESCHEDULED) return null;
  const hours = hoursOverdue(referral, now);
  if (hours === null || hours <= ATTENDANCE_GRACE_HOURS) return null;
  // Deterministic id: one detection record per referral per appointment cycle,
  // so a repeated sweep (or a second device) can never add a duplicate.
  const eventId = detectionEventId(referral.id, referral.appointmentDate, referral.appointmentTime);
  if (existingEventIds.has(eventId)) return null;
  return { status: REFERRAL_STATUS.AWAITING_CONFIRMATION, eventId };
}

/** Deterministic audit id for one appointment cycle's detection record. */
export function detectionEventId(
  referralId: string,
  appointmentDate?: string,
  appointmentTime?: string,
): string {
  return `re-${referralId}-awaiting_confirmation-${appointmentDate ?? 'none'}-${appointmentTime ?? 'none'}`;
}

// ── Escalation (administrative only) ───────────────────────────────────────

export type EscalationLevel = 'follow_up_queue' | 'prompt' | 'emergency_protocol';

export interface EscalationRule {
  level: EscalationLevel;
  /** Hours a person has to contact the patient before the rule is breached. */
  contactWithinHours: number;
  /** Human-readable rule, shown in the UI so the deadline is never a mystery. */
  key: string;
}

/**
 * Configured clinical escalation rules, keyed by the referral's CLINICAL
 * priority. These are contact deadlines for staff, not treatment decisions: the
 * app never upgrades a priority, prescribes anything or diagnoses anybody.
 */
export const ESCALATION_RULES: Record<Referral['priority'], EscalationRule> = {
  routine: { level: 'follow_up_queue', contactWithinHours: 72, key: 'escalationRoutine' },
  urgent: { level: 'prompt', contactWithinHours: 24, key: 'escalationUrgent' },
  emergency: { level: 'emergency_protocol', contactWithinHours: 4, key: 'escalationEmergency' },
};

export interface Escalation {
  level: EscalationLevel;
  ruleKey: string;
  /** When the patient must have been contacted by. */
  dueAt: Date | null;
  /** True once that deadline has passed without a recorded contact. */
  breached: boolean;
}

/**
 * Escalation for a missed referral, measured from the moment it was confirmed
 * missed (`missedAt`). No missedAt → nothing to escalate yet.
 */
export function escalationFor(
  referral: Pick<Referral, 'priority' | 'missedAt' | 'lastContactReached' | 'status'>,
  now: Date,
): Escalation | null {
  const rule = ESCALATION_RULES[referral.priority] ?? ESCALATION_RULES.routine;
  const from = referral.missedAt ? new Date(referral.missedAt) : null;
  if (!from || Number.isNaN(from.getTime())) {
    return { level: rule.level, ruleKey: rule.key, dueAt: null, breached: false };
  }
  const dueAt = new Date(from.getTime() + rule.contactWithinHours * 36e5);
  const reached =
    referral.lastContactReached === true || referral.status === REFERRAL_STATUS.CONTACTED;
  return {
    level: rule.level,
    ruleKey: rule.key,
    dueAt,
    breached: !reached && now.getTime() > dueAt.getTime(),
  };
}

// ── Notification attempts ──────────────────────────────────────────────────

/**
 * Deterministic id for a notification attempt record.
 *
 * Keyed by referral AND appointment cycle, so the same notice can never be
 * recorded twice for the same missed visit (which is what stops repeated
 * notifications), while a re-scheduled visit gets its own record.
 *
 * The only delivery channel implemented is the in-app audit record: the app
 * does not send SMS, WhatsApp or push, and never claims to.
 */
export function notificationEventId(referralId: string, cycleKey: string, kind: string): string {
  return `nt-${referralId}-${kind}-${cycleKey}`;
}

/** The cycle a missed visit belongs to: its expected appointment. */
export function appointmentCycleKey(referral: AppointmentLike): string {
  return `${referral.appointmentDate ?? 'none'}T${referral.appointmentTime ?? 'none'}`;
}

// ── Follow-up rows (what the dashboards list) ───────────────────────────────

export interface FollowupRow {
  referral: Referral;
  state: ReferralFollowupState;
  hoursOverdue: number | null;
  daysOverdue: number;
  escalation: Escalation | null;
  reason: MissedReason | null;
  lastContactAt: string | null;
  lastContactMethod: ContactMethod | null;
  lastContactReached: boolean | null;
  contactAttempts: number;
  nextFollowUpDate: string | null;
}

/** Build the follow-up view of one referral from the stored record. */
export function followupRowOf(referral: Referral, now: Date): FollowupRow {
  const state = followupStateOf(referral, now);
  return {
    referral,
    state,
    hoursOverdue: hoursOverdue(referral, now),
    daysOverdue: daysOverdue(referral, now),
    escalation: referral.missedAt ? escalationFor(referral, now) : null,
    reason: referral.missedReason ?? null,
    lastContactAt: referral.lastContactAt ?? null,
    lastContactMethod: referral.lastContactMethod ?? null,
    lastContactReached: referral.lastContactReached ?? null,
    contactAttempts: referral.contactAttemptCount ?? 0,
    nextFollowUpDate: referral.nextFollowUpDate ?? null,
  };
}

/**
 * Every referral the follow-up workflow owns right now, most urgent first.
 * Derived from stored records only — no separate "missed referrals" table that
 * could disagree with them.
 */
export function followupQueue(referrals: Referral[], now: Date): FollowupRow[] {
  return referrals
    .map(referral => followupRowOf(referral, now))
    .filter(row => isInFollowupQueue(row.state))
    .sort((a, b) => {
      const rank = (row: FollowupRow) =>
        row.state === 'missed' ? 0 : row.state === 'awaiting_confirmation' ? 1 : row.state === 'contacted' ? 2 : 3;
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const priority: Record<Referral['priority'], number> = { emergency: 0, urgent: 1, routine: 2 };
      if (priority[a.referral.priority] !== priority[b.referral.priority]) {
        return priority[a.referral.priority] - priority[b.referral.priority];
      }
      return (b.hoursOverdue ?? 0) - (a.hoursOverdue ?? 0);
    });
}

// ── Metrics (one set of formulas for every dashboard) ──────────────────────

export interface MissedReferralMetrics {
  totalReferrals: number;
  /** Expected time passed and attendance not recorded (uncertain). */
  awaitingConfirmation: number;
  /** Referrals in the follow-up queue right now (uncertain or missed). */
  overdue: number;
  /** Non-attendance documented by a person (ever). */
  confirmedMissed: number;
  /** Missed and still unresolved (not closed, not rescheduled, not attended). */
  unresolvedMissed: number;
  /** Missed referrals where the patient was actually reached. */
  successfulFollowUps: number;
  /** Appointments rescheduled after a missed visit. */
  rescheduledAppointments: number;
  /** Missed referrals that have been closed with a documented outcome. */
  resolvedMissed: number;
  /** closed / total, as a percentage — null when there is nothing to measure. */
  completionRate: number | null;
  /** confirmedMissed / total, as a percentage — null when there is nothing. */
  missedReferralRate: number | null;
  /** Why patients missed appointments, counted from the stored reasons. */
  reasons: { reason: MissedReason; count: number }[];
  /** Mean hours from confirming a missed visit to resolving it (or null). */
  avgFollowUpCompletionHours: number | null;
  /** The same measure as a median, which outliers do not distort. */
  medianFollowUpCompletionHours: number | null;
  /** Escalations whose contact deadline has already passed. */
  breachedEscalations: number;
  /** Confirmed-missed referrals with no recorded contact attempt at all. */
  neverContacted: number;
}

function percentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

/**
 * Missed-referral metrics computed from the ACTUAL records. Every rate is
 * derived from the same counts the lists show, so two dashboards can never
 * report different numbers for the same district, and an empty district reports
 * null (no data) instead of a made-up 0%.
 */
export function missedReferralMetrics(referrals: Referral[], now: Date): MissedReferralMetrics {
  const rows = referrals.map(referral => followupRowOf(referral, now));
  const totalReferrals = referrals.length;

  const awaitingConfirmation = rows.filter(r => r.state === 'awaiting_confirmation').length;
  const missedRows = rows.filter(r => r.state === 'missed');
  const contactedRows = rows.filter(r => r.state === 'contacted');
  const rescheduledRows = rows.filter(r => r.state === 'rescheduled');
  const overdue = awaitingConfirmation + missedRows.length + contactedRows.length + rescheduledRows.length;

  const confirmedMissed = referrals.filter(r => r.missedAt).length;
  const resolvedMissed = referrals.filter(r => r.missedAt && r.closureOutcome).length;
  const unresolvedMissed = missedRows.length + contactedRows.length;
  const successfulFollowUps = referrals.filter(r => r.lastContactReached === true).length;
  const rescheduledAppointments = referrals.filter(r => (r.rescheduleCount ?? 0) > 0 || r.status === REFERRAL_STATUS.RESCHEDULED).length;

  const reasonCounts = new Map<MissedReason, number>();
  for (const referral of referrals) {
    if (!referral.missedReason) continue;
    reasonCounts.set(referral.missedReason, (reasonCounts.get(referral.missedReason) ?? 0) + 1);
  }

  // Follow-up completion time: confirmation of the missed visit → the moment it
  // was resolved (a contact that reached the patient, or a documented closure).
  const durations: number[] = [];
  for (const referral of referrals) {
    if (!referral.missedAt) continue;
    const resolvedAt = referral.closureOutcome
      ? new Date(referral.closedAt ?? referral.updatedAt).getTime()
      : referral.lastContactReached === true
        ? new Date(referral.lastContactAt ?? referral.updatedAt).getTime()
        : null;
    if (resolvedAt === null) continue;
    const start = new Date(referral.missedAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(resolvedAt) || resolvedAt < start) continue;
    durations.push((resolvedAt - start) / 36e5);
  }

  return {
    totalReferrals,
    awaitingConfirmation,
    overdue,
    confirmedMissed,
    unresolvedMissed,
    successfulFollowUps,
    rescheduledAppointments,
    resolvedMissed,
    completionRate: percentage(referrals.filter(r => r.status === REFERRAL_STATUS.CLOSED).length, totalReferrals),
    missedReferralRate: percentage(confirmedMissed, totalReferrals),
    reasons: MISSED_REASONS
      .map(r => ({ reason: r.value, count: reasonCounts.get(r.value) ?? 0 }))
      .filter(entry => entry.count > 0),
    avgFollowUpCompletionHours: durations.length === 0
      ? null
      : Math.round((durations.reduce((sum, d) => sum + d, 0) / durations.length) * 10) / 10,
    medianFollowUpCompletionHours: median(durations),
    breachedEscalations: rows.filter(r => r.escalation?.breached === true).length,
    neverContacted: referrals.filter(r => r.missedAt && (r.contactAttemptCount ?? 0) === 0).length,
  };
}

// ── Scope helpers ──────────────────────────────────────────────────────────

/**
 * Does this referral belong to one of these facilities (either side)? Used to
 * keep a District Administrator's actions inside their own district: the
 * facility ids come from the STORED hospitals, never from the request.
 */
export function referralTouchesFacilities(
  referral: Pick<Referral, 'sourceFacilityId' | 'destinationFacilityId'>,
  facilityIds: ReadonlySet<string>,
): boolean {
  return facilityIds.has(referral.sourceFacilityId) || facilityIds.has(referral.destinationFacilityId);
}

/** The audit events of one referral, oldest first. */
export function eventsFor(referralId: string, events: ReferralEvent[]): ReferralEvent[] {
  return events
    .filter(event => event.referralId === referralId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

/** The last recorded contact attempt for one referral (or null). */
export function lastContactEvent(referralId: string, events: ReferralEvent[]): ReferralEvent | null {
  const attempts = eventsFor(referralId, events).filter(event => event.eventType === 'contact_attempt');
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}
