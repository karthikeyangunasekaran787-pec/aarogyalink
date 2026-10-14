/**
 * Missed-referral follow-up workflow — run with: bun test
 *
 * The scenarios the workflow must get right, checked against the shared rules
 * (src/lib/missed-referrals.ts) and the backend's collection path:
 *
 *   • an appointment still in the future is never flagged
 *   • an overdue appointment is UNCERTAIN, never automatically "missed"
 *   • a confirmed missed visit opens a follow-up with the right escalation
 *   • contact, rescheduling, late arrival and attendance elsewhere all work
 *   • repeated sweeps and notices cannot duplicate anything
 *   • a District Administrator's actions stay inside their district
 *   • the queue survives a refresh, and nothing is closed without the required
 *     completion information
 */
import { describe, expect, test } from 'bun:test';

import {
  ATTENDANCE_GRACE_HOURS,
  CONTACT_METHODS,
  ESCALATION_RULES,
  MISSED_REASONS,
  appointmentCycleKey,
  daysOverdue,
  expectedAttendanceAt,
  escalationFor,
  followupQueue,
  followupStateOf,
  hoursOverdue,
  notificationEventId,
  referralTouchesFacilities,
  missedReferralMetrics,
  sweepDecision,
} from '../../src/lib/missed-referrals';
import {
  REFERRAL_STATUS,
  actionFroms,
  canTransition,
} from '../../src/convex/referralStatus';
import { mergeAuthorizedWrite, parseEnvelope, serializeEnvelope, type SessionScope } from '../../src/convex/authz';
import type { Referral } from '../../src/types';

const NOW = new Date('2026-10-14T12:00:00.000Z');

const referral = (over: Partial<Referral> = {}): Referral => ({
  id: 'r1',
  referralId: 'REF-PDK-0001',
  patientId: 'p1',
  patientName: 'Lakshmi Devi',
  healthCardId: 'HC-2026-0001',
  sourceFacilityId: 'h1',
  sourceFacilityName: 'Sending PHC',
  destinationFacilityId: 'h2',
  destinationFacilityName: 'Receiving Hospital',
  department: 'General Medicine',
  priority: 'routine',
  reason: 'Specialist review',
  status: 'scheduled',
  currentStep: 4,
  totalSteps: 9,
  appointmentDate: '2026-10-14',
  appointmentTime: '09:00',
  createdAt: '2026-10-10T09:00:00.000Z',
  updatedAt: '2026-10-10T09:00:00.000Z',
  isOverdue: false,
  ...over,
});

const hospital: SessionScope = { kind: 'hospital', hospitalId: 'h2', staffUserId: 'ustaff-admin' };
const actor = { id: 'ustaff-admin', name: 'Rajesh Kumar', role: 'hospital_admin', hospitalId: 'h2' };

describe('detection: a future appointment is never flagged', () => {
  const future = referral({ appointmentDate: '2026-10-20', appointmentTime: '10:00' });

  test('the state stays on track and the queue stays empty', () => {
    expect(followupStateOf(future, NOW)).toBe('on_track');
    expect(followupQueue([future], NOW)).toHaveLength(0);
    expect(hoursOverdue(future, NOW)).toBeLessThan(0);
    expect(daysOverdue(future, NOW)).toBe(0);
  });

  test('the sweep writes nothing', () => {
    expect(sweepDecision(future, NOW)).toBeNull();
  });
});

describe('an overdue appointment is uncertain — not missed', () => {
  const overdue = referral(); // 09:00, now 12:00 → 3h past (inside the grace window)
  const past = referral({ appointmentDate: '2026-10-12', appointmentTime: '09:00' });

  test('inside the grace window nothing is flagged at all', () => {
    expect(hoursOverdue(overdue, NOW)).toBeCloseTo(3, 5);
    expect(followupStateOf(overdue, NOW)).toBe('on_track');
  });

  test('after the window the state is awaiting confirmation, NOT missed', () => {
    const state = followupStateOf(past, NOW);
    expect(state).toBe('awaiting_confirmation');
    expect(state).not.toBe('missed');
    // The stored status is untouched until the sweep writes the uncertain
    // status, and even then it is never "missed".
    expect(past.status).toBe('scheduled');
    expect(sweepDecision(past, NOW)?.status).toBe(REFERRAL_STATUS.AWAITING_CONFIRMATION);
    expect(sweepDecision(past, NOW)?.status).not.toBe(REFERRAL_STATUS.MISSED);
  });

  test('the grace window is what the rule says it is', () => {
    expect(ATTENDANCE_GRACE_HOURS).toBeGreaterThan(0);
    const justInside = referral({ appointmentDate: '2026-10-14', appointmentTime: '08:30' });
    expect(hoursOverdue(justInside, NOW)).toBeCloseTo(3.5, 5);
    expect(followupStateOf(justInside, NOW)).toBe('on_track');
  });

  test('a hospital that has not updated its records still shows up for a human', () => {
    const queue = followupQueue([past], NOW);
    expect(queue).toHaveLength(1);
    expect(queue[0].state).toBe('awaiting_confirmation');
    expect(queue[0].daysOverdue).toBe(2);
  });

  test('a cancelled or completed referral is never flagged', () => {
    for (const status of ['cancelled', 'closed', 'patient_arrived', 'treatment', 'followup'] as const) {
      expect(followupStateOf(referral({ status, appointmentDate: '2026-10-01' }), NOW)).not.toBe('awaiting_confirmation');
      expect(sweepDecision(referral({ status, appointmentDate: '2026-10-01' }), NOW)).toBeNull();
    }
  });

  test('a referral with no appointment date is never flagged', () => {
    const noDate = referral({ appointmentDate: undefined, appointmentTime: undefined });
    expect(expectedAttendanceAt(noDate)).toBeNull();
    expect(followupStateOf(noDate, NOW)).toBe('on_track');
    expect(sweepDecision(noDate, NOW)).toBeNull();
  });
});

describe('a confirmed missed appointment', () => {
  test('a person confirms it: awaiting_confirmation → missed is a legal transition', () => {
    expect(canTransition(REFERRAL_STATUS.AWAITING_CONFIRMATION, REFERRAL_STATUS.MISSED)).toBe(true);
    expect(canTransition(REFERRAL_STATUS.SCHEDULED, REFERRAL_STATUS.MISSED)).toBe(true);
    expect(actionFroms('confirm_missed')).toEqual(['scheduled', 'awaiting_confirmation', 'rescheduled']);
  });

  test('only a reason from the documented list can be recorded', () => {
    expect(MISSED_REASONS.map(r => r.value)).toContain('transport');
    expect(MISSED_REASONS.map(r => r.value)).toContain('patient_refused');
    expect(MISSED_REASONS).toHaveLength(8);
  });

  test('it lands in the unresolved queue with its reason and escalation', () => {
    const missed = referral({
      status: 'missed',
      appointmentDate: '2026-10-12',
      missedAt: '2026-10-13T09:00:00.000Z',
      missedReason: 'transport',
      escalationLevel: 'follow_up_queue',
      followupDueAt: '2026-10-16T09:00:00.000Z',
    });
    const [row] = followupQueue([missed], NOW);
    expect(row.state).toBe('missed');
    expect(row.reason).toBe('transport');
    expect(row.escalation?.level).toBe('follow_up_queue');

    const metrics = missedReferralMetrics([missed], NOW);
    expect(metrics.confirmedMissed).toBe(1);
    expect(metrics.unresolvedMissed).toBe(1);
    expect(metrics.resolvedMissed).toBe(0);
    expect(metrics.successfulFollowUps).toBe(0);
    expect(metrics.neverContacted).toBe(1);
  });
});

describe('a patient who is successfully contacted', () => {
  test('the transition and the recorded attempt', () => {
    expect(canTransition(REFERRAL_STATUS.MISSED, REFERRAL_STATUS.CONTACTED)).toBe(true);
    expect(actionFroms('record_contact')).toEqual([REFERRAL_STATUS.MISSED]);
    // An attempt that did not reach the patient is recorded WITHOUT a status change.
    expect(actionFroms('log_contact_attempt')).toContain('missed');
    expect(actionFroms('log_contact_attempt')).toContain('awaiting_confirmation');
  });

  test('a reached contact makes the referral contacted and counts as a success', () => {
    const contacted = referral({
      status: 'contacted',
      missedAt: '2026-10-12T09:00:00.000Z',
      missedReason: 'forgot',
      lastContactAt: '2026-10-13T10:00:00.000Z',
      lastContactMethod: 'phone_call',
      lastContactReached: true,
      contactAttemptCount: 2,
      nextFollowUpDate: '2026-10-20',
    });
    const [row] = followupQueue([contacted], NOW);
    expect(row.state).toBe('contacted');
    expect(row.lastContactReached).toBe(true);
    expect(row.contactAttempts).toBe(2);
    expect(row.nextFollowUpDate).toBe('2026-10-20');

    const metrics = missedReferralMetrics([contacted], NOW);
    expect(metrics.successfulFollowUps).toBe(1);
    expect(metrics.unresolvedMissed).toBe(1);
    // missed 12th 09:00 → contacted 13th 10:00 = 25 h
    expect(metrics.avgFollowUpCompletionHours).toBe(25);
    expect(metrics.medianFollowUpCompletionHours).toBe(25);
    expect(CONTACT_METHODS.map(m => m.value)).toContain('phone_call');
  });

  test('an unreached attempt is NOT counted as a successful follow-up', () => {
    const attempted = referral({
      status: 'missed',
      missedAt: '2026-10-12T09:00:00.000Z',
      lastContactAt: '2026-10-13T10:00:00.000Z',
      lastContactMethod: 'phone_call',
      lastContactReached: false,
      contactAttemptCount: 1,
    });
    const metrics = missedReferralMetrics([attempted], NOW);
    expect(metrics.successfulFollowUps).toBe(0);
    expect(metrics.neverContacted).toBe(0); // an attempt exists
    expect(metrics.unresolvedMissed).toBe(1);
  });
});

describe('a rescheduled appointment', () => {
  test('contacted → rescheduled is legal, and the new date starts a new cycle', () => {
    expect(canTransition(REFERRAL_STATUS.CONTACTED, REFERRAL_STATUS.RESCHEDULED)).toBe(true);
    expect(canTransition(REFERRAL_STATUS.RESCHEDULED, REFERRAL_STATUS.ARRIVAL_VERIFIED)).toBe(true);

    const oldCycle = appointmentCycleKey(referral({ appointmentDate: '2026-10-12', appointmentTime: '09:00' }));
    const newCycle = appointmentCycleKey(referral({ appointmentDate: '2026-10-25', appointmentTime: '11:00' }));
    expect(oldCycle).not.toBe(newCycle);
    // A notice for the new cycle is a different record…
    expect(notificationEventId('r1', oldCycle, 'confirm_missed')).not.toBe(
      notificationEventId('r1', newCycle, 'confirm_missed'),
    );
  });

  test('the rescheduled referral is no longer overdue and waits for the new date', () => {
    const rescheduled = referral({
      status: 'rescheduled',
      appointmentDate: '2026-10-25',
      appointmentTime: '11:00',
      missedAt: '2026-10-12T09:00:00.000Z',
      missedReason: 'transport',
      rescheduledAt: '2026-10-13T10:00:00.000Z',
      rescheduleCount: 1,
      lastContactReached: true,
      lastContactAt: '2026-10-13T10:00:00.000Z',
    });
    const [row] = followupQueue([rescheduled], NOW);
    expect(row.state).toBe('rescheduled');
    expect(row.daysOverdue).toBe(0);
    expect(sweepDecision(rescheduled, NOW)).toBeNull();

    const metrics = missedReferralMetrics([rescheduled], NOW);
    expect(metrics.rescheduledAppointments).toBe(1);
    expect(metrics.confirmedMissed).toBe(1);
    expect(metrics.missedReferralRate).toBe(100);
    expect(metrics.completionRate).toBe(0);
  });

  test('once the new date passes, the referral is flagged again (new cycle)', () => {
    const again = referral({
      status: 'rescheduled',
      appointmentDate: '2026-10-10',
      appointmentTime: '09:00',
      rescheduleCount: 1,
    });
    expect(followupStateOf(again, NOW)).toBe('awaiting_confirmation');
    const previousCycle = sweepDecision(
      referral({ appointmentDate: '2026-10-13', appointmentTime: '09:00' }),
      NOW,
    );
    const nextCycle = sweepDecision(again, NOW);
    expect(previousCycle).not.toBeNull();
    expect(nextCycle).not.toBeNull();
    // A different appointment is a different cycle, so its record is its own.
    expect(previousCycle!.eventId).not.toBe(nextCycle!.eventId);
  });
});

describe('a patient who attends the hospital', () => {
  test('a LATE arrival is still an arrival, from every in-flight status', () => {
    expect(actionFroms('verify_arrival')).toEqual(['scheduled', 'awaiting_confirmation', 'rescheduled']);
    expect(canTransition(REFERRAL_STATUS.AWAITING_CONFIRMATION, REFERRAL_STATUS.ARRIVAL_VERIFIED)).toBe(true);
    expect(canTransition(REFERRAL_STATUS.RESCHEDULED, REFERRAL_STATUS.ARRIVAL_VERIFIED)).toBe(true);
    // …and once the visit happened, the follow-up queue lets it go.
    const arrived = referral({ status: 'patient_arrived', appointmentDate: '2026-10-12' });
    expect(followupQueue([arrived], NOW)).toHaveLength(0);
    expect(missedReferralMetrics([arrived], NOW).overdue).toBe(0);
  });

  test('attendance at another hospital closes the referral with that outcome', () => {
    expect(canTransition(REFERRAL_STATUS.AWAITING_CONFIRMATION, REFERRAL_STATUS.CLOSED)).toBe(true);
    expect(canTransition(REFERRAL_STATUS.MISSED, REFERRAL_STATUS.CLOSED)).toBe(true);
    expect(actionFroms('record_attendance_elsewhere')).toEqual(['awaiting_confirmation', 'missed']);

    const elsewhere = referral({
      status: 'closed',
      appointmentDate: '2026-10-12',
      closedAt: '2026-10-14T09:00:00.000Z',
      closureOutcome: 'attended_another_hospital',
      closureNotes: 'Seen at the district hospital instead.',
      attendedElsewhereHospital: 'District HQ Hospital',
      attendedElsewhereDate: '2026-10-12',
    });
    const metrics = missedReferralMetrics([elsewhere], NOW);
    expect(metrics.confirmedMissed).toBe(0); // the visit was not missed
    expect(metrics.unresolvedMissed).toBe(0);
    expect(followupQueue([elsewhere], NOW)).toHaveLength(0);
  });
});

describe('priority-based escalation', () => {
  const missedAt = '2026-10-13T09:00:00.000Z';

  test('routine, urgent and emergency have configured contact deadlines', () => {
    expect(ESCALATION_RULES.routine.contactWithinHours).toBe(72);
    expect(ESCALATION_RULES.urgent.contactWithinHours).toBe(24);
    expect(ESCALATION_RULES.emergency.contactWithinHours).toBe(4);
    expect(ESCALATION_RULES.routine.level).toBe('follow_up_queue');
    expect(ESCALATION_RULES.urgent.level).toBe('prompt');
    expect(ESCALATION_RULES.emergency.level).toBe('emergency_protocol');
  });

  test('an urgent referral must be contacted within 24 hours, and breaches are visible', () => {
    const urgent = referral({ status: 'missed', priority: 'urgent', missedAt });
    const escalation = escalationFor(urgent, NOW);
    expect(escalation?.level).toBe('prompt');
    expect(escalation?.dueAt?.toISOString()).toBe('2026-10-14T09:00:00.000Z');
    expect(escalation?.breached).toBe(true); // now is 12:00, three hours late

    const withinWindow = escalationFor(urgent, new Date('2026-10-14T08:00:00.000Z'));
    expect(withinWindow?.breached).toBe(false);

    expect(missedReferralMetrics([urgent], NOW).breachedEscalations).toBe(1);
  });

  test('a reached patient stops the escalation clock', () => {
    const urgent = referral({
      status: 'contacted',
      priority: 'urgent',
      missedAt,
      lastContactReached: true,
      lastContactAt: '2026-10-14T07:00:00.000Z',
    });
    expect(escalationFor(urgent, NOW)?.breached).toBe(false);
  });

  test('the clinical priority is never rewritten by the follow-up workflow', () => {
    const emergency = referral({ status: 'missed', priority: 'emergency', missedAt });
    const [row] = followupQueue([emergency], NOW);
    expect(row.referral.priority).toBe('emergency');
    expect(row.escalation?.level).toBe('emergency_protocol');
  });
});

describe('duplicate notification prevention', () => {
  test('the same missed visit produces one deterministic notice id', () => {
    const cycle = appointmentCycleKey(referral());
    expect(notificationEventId('r1', cycle, 'confirm_missed')).toBe(
      notificationEventId('r1', cycle, 'confirm_missed'),
    );
    expect(notificationEventId('r1', cycle, 'confirm_missed')).not.toBe(
      notificationEventId('r1', cycle, 'record_contact'),
    );
    expect(notificationEventId('r1', cycle, 'confirm_missed')).not.toBe(
      notificationEventId('r2', cycle, 'confirm_missed'),
    );
  });

  test('a repeated sweep writes nothing the second time', () => {
    const overdue = referral({ appointmentDate: '2026-10-12', appointmentTime: '09:00' });
    const first = sweepDecision(overdue, NOW);
    expect(first).not.toBeNull();
    const existing = new Set([first!.eventId]);
    expect(sweepDecision(overdue, NOW, existing)).toBeNull();
    // A second device sweeping the same list produces the same id, not a new one.
    expect(sweepDecision(overdue, NOW)?.eventId).toBe(first!.eventId);
  });
});

describe('cross-district access restriction', () => {
  test('a referral is only touched by the district that owns one of its facilities', () => {
    const mine = new Set(['h1', 'h4']);
    const other = new Set(['h9']);
    const r = referral({ sourceFacilityId: 'h1', destinationFacilityId: 'h2' });
    expect(referralTouchesFacilities(r, mine)).toBe(true);
    expect(referralTouchesFacilities(r, other)).toBe(false);

    const foreign = referral({ sourceFacilityId: 'h7', destinationFacilityId: 'h8' });
    expect(referralTouchesFacilities(foreign, mine)).toBe(false);
  });
});

describe('persistence and completion information', () => {
  test('a follow-up survives the storage round trip unchanged', () => {
    const missed = referral({
      status: 'missed',
      missedAt: '2026-10-13T09:00:00.000Z',
      missedReason: 'financial',
      appointmentDate: '2026-10-12',
      contactAttemptCount: 1,
      lastContactAt: '2026-10-13T10:00:00.000Z',
      lastContactMethod: 'home_visit',
      lastContactReached: false,
      nextFollowUpDate: '2026-10-16',
    });
    const stored = serializeEnvelope('1', [missed]);
    const [restored] = (parseEnvelope(stored)?.items ?? []) as Referral[];
    expect(restored.status).toBe('missed');
    expect(restored.missedReason).toBe('financial');
    expect(restored.contactAttemptCount).toBe(1);
    expect(restored.lastContactMethod).toBe('home_visit');
    expect(followupStateOf(restored, NOW)).toBe('missed');
  });

  test('the collection path keeps the new statuses for the referral in scope', () => {
    const write = (stored: unknown[], incoming: unknown[]) =>
      mergeAuthorizedWrite('referrals', stored, incoming, hospital, { actor }) as Referral[];

    const overdue = referral({ status: 'awaiting_confirmation', awaitingConfirmationAt: '2026-10-14T10:00:00.000Z' });
    expect(write([referral()], [overdue])[0].status).toBe('awaiting_confirmation');
    const missed = write([overdue], [referral({ status: 'missed', missedAt: '2026-10-14T11:00:00.000Z' })]);
    expect(missed[0].status).toBe('missed');
  });

  test('a missed referral cannot be closed without an outcome and a note', () => {
    const write = (stored: unknown[], incoming: unknown[]) =>
      mergeAuthorizedWrite('referrals', stored, incoming, hospital, { actor }) as Referral[];

    const missed = referral({ status: 'missed', missedAt: '2026-10-13T09:00:00.000Z' });
    const silent = write([missed], [referral({ status: 'closed', closedAt: '2026-10-14T09:00:00.000Z' })]);
    expect(silent[0].status).toBe('missed');

    const documented = write(
      [missed],
      [referral({
        status: 'closed',
        closedAt: '2026-10-14T09:00:00.000Z',
        closureOutcome: 'patient_unreachable',
        closureNotes: 'Three attempts, no response.',
      })],
    );
    expect(documented[0].status).toBe('closed');
    expect(documented[0].closureOutcome).toBe('patient_unreachable');
  });

  test('an invalid transition is still refused on the collection path', () => {
    const write = (stored: unknown[], incoming: unknown[]) =>
      mergeAuthorizedWrite('referrals', stored, incoming, hospital, { actor }) as Referral[];
    // awaiting_confirmation → contacted is not allowed: uncertainty is resolved
    // by confirming the missed visit first, so nothing skips the missed step.
    const skipped = write(
      [referral({ status: 'awaiting_confirmation' })],
      [referral({ status: 'contacted' })],
    );
    expect(skipped[0].status).toBe('awaiting_confirmation');
  });
});

describe('metrics come from the records, never from a constant', () => {
  test('an empty district reports no data instead of invented rates', () => {
    const metrics = missedReferralMetrics([], NOW);
    expect(metrics.totalReferrals).toBe(0);
    expect(metrics.completionRate).toBeNull();
    expect(metrics.missedReferralRate).toBeNull();
    expect(metrics.avgFollowUpCompletionHours).toBeNull();
    expect(metrics.reasons).toEqual([]);
  });

  test('every rate is derived from the counts the lists show', () => {
    const list = [
      referral({ id: 'a', status: 'closed', closureOutcome: 'treatment_completed', closedAt: '2026-10-14T10:00:00.000Z' }),
      referral({ id: 'b', status: 'missed', appointmentDate: '2026-10-12', missedAt: '2026-10-13T09:00:00.000Z', missedReason: 'forgot' }),
      referral({ id: 'c', status: 'awaiting_confirmation', appointmentDate: '2026-10-12' }),
      referral({ id: 'd', status: 'scheduled', appointmentDate: '2026-10-30' }),
    ];
    const metrics = missedReferralMetrics(list, NOW);
    expect(metrics.totalReferrals).toBe(4);
    expect(metrics.confirmedMissed).toBe(1);
    expect(metrics.awaitingConfirmation).toBe(1);
    expect(metrics.overdue).toBe(2);
    expect(metrics.unresolvedMissed).toBe(1);
    expect(metrics.completionRate).toBe(25);
    expect(metrics.missedReferralRate).toBe(25);
    expect(metrics.reasons).toEqual([{ reason: 'forgot', count: 1 }]);
  });
});
