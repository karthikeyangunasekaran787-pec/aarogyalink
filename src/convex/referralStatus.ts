// ============================================================================
// AarogyaLink — canonical Referral Closure Engine status model
// ----------------------------------------------------------------------------
// ONE source of truth for referral statuses, their order, the allowed
// transitions and the display labels. The backend (appReferral.ts, authz.ts)
// and every UI surface import this module, so a status can never mean two
// different things in two places.
//
// The canonical names below map onto the status values the prototype has always
// stored (kept unchanged so existing referrals, events and demo data stay
// valid) — `ARRIEVAL_VERIFIED` maps to the app's existing `patient_arrived`.
// order shows how the chain progresses:
//
//   CREATED → ACCEPTED → DOCTOR_ASSIGNED → SCHEDULED → ARRIVAL_VERIFIED
//   → CONSULTATION_COMPLETED → TREATMENT_STARTED → FOLLOW_UP → CLOSED
// ============================================================================

export const REFERRAL_STATUS = {
  CREATED: 'created',
  ACCEPTED: 'accepted',
  DOCTOR_ASSIGNED: 'doctor_assigned',
  SCHEDULED: 'scheduled',
  ARRIVAL_VERIFIED: 'patient_arrived',
  CONSULTATION_COMPLETED: 'consultation',
  TREATMENT_STARTED: 'treatment',
  FOLLOW_UP: 'followup',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const;

export type ReferralStatusValue = (typeof REFERRAL_STATUS)[keyof typeof REFERRAL_STATUS];

/** Ordered workflow steps (the timeline / progress indicator renders these). */
export const REFERRAL_STEPS: { status: ReferralStatusValue; canonical: string; label: string }[] = [
  { status: REFERRAL_STATUS.CREATED, canonical: 'CREATED', label: 'Created' },
  { status: REFERRAL_STATUS.ACCEPTED, canonical: 'ACCEPTED', label: 'Hospital Accepted' },
  { status: REFERRAL_STATUS.DOCTOR_ASSIGNED, canonical: 'DOCTOR_ASSIGNED', label: 'Doctor Assigned' },
  { status: REFERRAL_STATUS.SCHEDULED, canonical: 'SCHEDULED', label: 'Appointment Scheduled' },
  { status: REFERRAL_STATUS.ARRIVAL_VERIFIED, canonical: 'ARRIVAL_VERIFIED', label: 'Arrival Verified' },
  { status: REFERRAL_STATUS.CONSULTATION_COMPLETED, canonical: 'CONSULTATION_COMPLETED', label: 'Consultation' },
  { status: REFERRAL_STATUS.TREATMENT_STARTED, canonical: 'TREATMENT_STARTED', label: 'Treatment' },
  { status: REFERRAL_STATUS.FOLLOW_UP, canonical: 'FOLLOW_UP', label: 'Follow-up' },
  { status: REFERRAL_STATUS.CLOSED, canonical: 'CLOSED', label: 'Referral Closed' },
];

/** Number of ordered workflow steps (used for the "x of y" progress display). */
export const REFERRAL_TOTAL_STEPS = REFERRAL_STEPS.length;

/**
 * Allowed forward transitions. The terminal statuses allow nothing further, and
 * a referral may be EXITED (to a terminal state) at any point — which is why the
 * UI distinguishes the normal path from an explicit cancellation.
 */
export const REFERRAL_TRANSITIONS: Record<ReferralStatusValue, ReferralStatusValue[]> = {
  [REFERRAL_STATUS.CREATED]: [REFERRAL_STATUS.ACCEPTED, REFERRAL_STATUS.CANCELLED],
  [REFERRAL_STATUS.ACCEPTED]: [REFERRAL_STATUS.DOCTOR_ASSIGNED, REFERRAL_STATUS.CANCELLED],
  [REFERRAL_STATUS.DOCTOR_ASSIGNED]: [REFERRAL_STATUS.SCHEDULED, REFERRAL_STATUS.CANCELLED],
  [REFERRAL_STATUS.SCHEDULED]: [REFERRAL_STATUS.ARRIVAL_VERIFIED, REFERRAL_STATUS.CANCELLED],
  [REFERRAL_STATUS.ARRIVAL_VERIFIED]: [REFERRAL_STATUS.CONSULTATION_COMPLETED, REFERRAL_STATUS.CANCELLED],
  [REFERRAL_STATUS.CONSULTATION_COMPLETED]: [
    REFERRAL_STATUS.TREATMENT_STARTED,
    REFERRAL_STATUS.CANCELLED,
  ],
  // No follow-up required → direct closure is explicitly supported.
  [REFERRAL_STATUS.TREATMENT_STARTED]: [REFERRAL_STATUS.FOLLOW_UP, REFERRAL_STATUS.CLOSED],
  [REFERRAL_STATUS.FOLLOW_UP]: [REFERRAL_STATUS.CLOSED],
  [REFERRAL_STATUS.CLOSED]: [],
  [REFERRAL_STATUS.CANCELLED]: [],
};

/** Step number (1-based) of a status in the workflow. Unknown values → 1. */
export function referralStepOf(status: string | undefined): number {
  const idx = REFERRAL_STEPS.findIndex(s => s.status === status);
  return idx === -1 ? 1 : idx + 1;
}

export function referralStatusLabel(status: string | undefined): string {
  if (status === REFERRAL_STATUS.CANCELLED) return 'Cancelled';
  return REFERRAL_STEPS.find(s => s.status === status)?.label ?? 'Created';
}

/** Is a transition allowed? A no-op (same status) is NOT a transition. */
export function canTransition(from: string | undefined, to: string): boolean {
  if (!from) return false;
  if (from === to) return false;
  const allowed = REFERRAL_TRANSITIONS[from as ReferralStatusValue];
  return Array.isArray(allowed) && allowed.includes(to as ReferralStatusValue);
}

/** Terminal statuses — nothing may follow them (closure is permanent). */
export function isTerminalStatus(status: string | undefined): boolean {
  return status === REFERRAL_STATUS.CLOSED || status === REFERRAL_STATUS.CANCELLED;
}

// ============================================================================
// Engine actions
// ----------------------------------------------------------------------------
// The UI never sends a status: it sends an ACTION, and the server derives the
// target status from this table plus the stored record.
// ============================================================================

export type ReferralAction =
  | 'accept'
  | 'reject'
  | 'assign_doctor'
  | 'schedule'
  | 'verify_arrival'
  | 'start_consultation'
  | 'complete_consultation'
  | 'record_treatment'
  | 'schedule_followup'
  | 'close'
  | 'cancel';

interface ActionSpec {
  /** Status the referral must be in for this action to apply. */
  from: ReferralStatusValue;
  /** Resulting status. */
  to: ReferralStatusValue;
  /** Which side of the referral may perform it. */
  permission: 'destination' | 'source_or_destination' | 'assigned_doctor';
  /** Canonical event(s) recorded by this action. */
  events: { type: string; canonical: string; description: string }[];
}

export const REFERRAL_ACTIONS: Record<ReferralAction, ActionSpec> = {
  accept: {
    from: REFERRAL_STATUS.CREATED,
    to: REFERRAL_STATUS.ACCEPTED,
    permission: 'destination',
    events: [{ type: 'accepted', canonical: 'ACCEPTED', description: 'Referral accepted by the receiving hospital.' }],
  },
  reject: {
    from: REFERRAL_STATUS.CREATED,
    to: REFERRAL_STATUS.CANCELLED,
    permission: 'destination',
    events: [{ type: 'cancelled', canonical: 'CANCELLED', description: 'Referral rejected by the receiving hospital.' }],
  },
  assign_doctor: {
    from: REFERRAL_STATUS.ACCEPTED,
    to: REFERRAL_STATUS.DOCTOR_ASSIGNED,
    permission: 'destination',
    events: [{ type: 'doctor_assigned', canonical: 'DOCTOR_ASSIGNED', description: 'Doctor assigned to the referral.' }],
  },
  schedule: {
    from: REFERRAL_STATUS.DOCTOR_ASSIGNED,
    to: REFERRAL_STATUS.SCHEDULED,
    permission: 'destination',
    events: [{ type: 'scheduled', canonical: 'SCHEDULED', description: 'Consultation appointment scheduled.' }],
  },
  verify_arrival: {
    from: REFERRAL_STATUS.SCHEDULED,
    to: REFERRAL_STATUS.ARRIVAL_VERIFIED,
    permission: 'destination',
    events: [{ type: 'patient_arrived', canonical: 'ARRIVAL_VERIFIED', description: 'Patient arrival verified with the referral QR.' }],
  },
  start_consultation: {
    from: REFERRAL_STATUS.ARRIVAL_VERIFIED,
    to: REFERRAL_STATUS.CONSULTATION_COMPLETED,
    permission: 'assigned_doctor',
    events: [{ type: 'consultation_started', canonical: 'CONSULTATION_IN_PROGRESS', description: 'Consultation started.' }],
  },
  // The prototype combines "consultation completed" and "treatment started"
  // into one doctor action, so both canonical events are recorded.
  complete_consultation: {
    from: REFERRAL_STATUS.CONSULTATION_COMPLETED,
    to: REFERRAL_STATUS.TREATMENT_STARTED,
    permission: 'assigned_doctor',
    events: [
      { type: 'consultation_completed', canonical: 'CONSULTATION_COMPLETED', description: 'Consultation completed.' },
      { type: 'treatment_started', canonical: 'TREATMENT_STARTED', description: 'Treatment plan recorded and started.' },
    ],
  },
  record_treatment: {
    from: REFERRAL_STATUS.TREATMENT_STARTED,
    to: REFERRAL_STATUS.TREATMENT_STARTED,
    permission: 'assigned_doctor',
    events: [{ type: 'treatment_updated', canonical: 'TREATMENT_STARTED', description: 'Treatment information updated.' }],
  },
  schedule_followup: {
    from: REFERRAL_STATUS.TREATMENT_STARTED,
    to: REFERRAL_STATUS.FOLLOW_UP,
    permission: 'assigned_doctor',
    events: [{ type: 'followup', canonical: 'FOLLOW_UP', description: 'Follow-up scheduled.' }],
  },
  close: {
    from: REFERRAL_STATUS.FOLLOW_UP,
    to: REFERRAL_STATUS.CLOSED,
    permission: 'assigned_doctor',
    events: [{ type: 'closed', canonical: 'CLOSED', description: 'Referral closed.' }],
  },
  cancel: {
    from: REFERRAL_STATUS.FOLLOW_UP,
    to: REFERRAL_STATUS.CANCELLED,
    permission: 'assigned_doctor',
    events: [{ type: 'cancelled', canonical: 'CANCELLED', description: 'Referral cancelled.' }],
  },
};

/** Actions that may also be performed on other statuses (see `actionFrom`). */
const ACTION_OVERRIDES: Partial<Record<ReferralAction, ReferralStatusValue[]>> = {
  // The doctor may close straight after treatment when no follow-up is needed.
  close: [REFERRAL_STATUS.TREATMENT_STARTED, REFERRAL_STATUS.FOLLOW_UP],
  // Either side may walk away from any referral that is still in flight.
  cancel: [
    REFERRAL_STATUS.CREATED,
    REFERRAL_STATUS.ACCEPTED,
    REFERRAL_STATUS.DOCTOR_ASSIGNED,
    REFERRAL_STATUS.SCHEDULED,
    REFERRAL_STATUS.ARRIVAL_VERIFIED,
    REFERRAL_STATUS.CONSULTATION_COMPLETED,
  ],
};

/** Statuses an action may be applied from. */
export function actionFroms(action: ReferralAction): ReferralStatusValue[] {
  return ACTION_OVERRIDES[action] ?? [REFERRAL_ACTIONS[action].from];
}
