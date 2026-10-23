/**
 * Referral closure rules + open-referral tracker — run with: bun test
 *
 * Two things are pinned here, because both decide whether a referral can still
 * be acted on or is finished for good:
 *
 *   • the CLOSURE rules (src/lib/referral-closure.ts) — the outcome, the note,
 *     the follow-up gate — checked on both the engine's road (as the UI calls
 *     it) and the collection path (mergeAuthorizedWrite), which must agree;
 *   • the NEXT ACTION tracker (src/lib/referral-next-action.ts), so every open
 *     referral shows the step the engine would actually accept, and the closure
 *     metrics report the same outstanding work.
 */
import { describe, expect, test } from 'bun:test';

import {
  CARE_COMPLETION_OUTCOME,
  CLOSURE_OUTCOME_VALUES,
  closureOutcomeFor,
  isFollowUpResolved,
  validateReferralClosure,
} from '../../src/lib/referral-closure';
import {
  nextActionFor,
  openReferralSummary,
  openReferralTracker,
  hoursInStatus,
} from '../../src/lib/referral-next-action';
import { computeClosureStats } from '../../src/components/shared/ReferralClosureStats';
import { mergeAuthorizedWrite, type SessionScope } from '../../src/convex/authz';
import { REFERRAL_STATUS, actionFroms, canTransition } from '../../src/convex/referralStatus';
import type { Referral, ReferralEvent } from '../../src/types';

const NOW = new Date('2026-10-15T12:00:00.000Z');

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
  status: REFERRAL_STATUS.FOLLOW_UP,
  currentStep: 8,
  totalSteps: 9,
  createdAt: '2026-10-10T09:00:00.000Z',
  updatedAt: '2026-10-10T09:00:00.000Z',
  isOverdue: false,
  ...over,
});

const hospital: SessionScope = { kind: 'hospital', hospitalId: 'h2', staffUserId: 'ustaff-admin' };
const actor = { id: 'ustaff-admin', name: 'Rajesh Kumar', role: 'hospital_admin', hospitalId: 'h2' };

describe('closure outcome', () => {
  test('the care pathway derives its own outcome', () => {
    expect(closureOutcomeFor({}, REFERRAL_STATUS.FOLLOW_UP)).toBe(CARE_COMPLETION_OUTCOME);
    expect(closureOutcomeFor({}, REFERRAL_STATUS.TREATMENT_STARTED)).toBe(CARE_COMPLETION_OUTCOME);
  });

  test('the missed path has no outcome until a person provides one', () => {
    expect(closureOutcomeFor({}, REFERRAL_STATUS.MISSED)).toBeUndefined();
    expect(closureOutcomeFor({ outcome: 'patient_unreachable' }, REFERRAL_STATUS.MISSED)).toBe('patient_unreachable');
  });

  test('every recorded outcome is one of the canonical values', () => {
    expect(CLOSURE_OUTCOME_VALUES).toContain(CARE_COMPLETION_OUTCOME);
    expect(CLOSURE_OUTCOME_VALUES).toContain('attended_another_hospital');
    expect(CLOSURE_OUTCOME_VALUES).toContain('duplicate_referral');
  });
});

describe('closing a referral that was treated', () => {
  test('the treatment itself is the completion information', () => {
    const result = validateReferralClosure({ notes: 'Care completed.' }, { from: REFERRAL_STATUS.TREATMENT_STARTED, now: NOW });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outcome).toBe(CARE_COMPLETION_OUTCOME);
  });

  test('these rules judge the closure information — the workflow model judges reachability', () => {
    // A referral that was never treated cannot reach CLOSED at all; that is the
    // transition model's job, and it is checked before any closure rule runs.
    expect(canTransition(REFERRAL_STATUS.CREATED, REFERRAL_STATUS.CLOSED)).toBe(false);
    expect(actionFroms('close')).not.toContain(REFERRAL_STATUS.CREATED);
  });
});

describe('the follow-up gate', () => {
  const scheduledFollowUp = {
    from: REFERRAL_STATUS.FOLLOW_UP,
    now: NOW,
    followUpDate: '2026-10-20',
    followUpTime: '10:00',
  };

  test('a follow-up still in the future is not resolved', () => {
    expect(isFollowUpResolved({}, scheduledFollowUp)).toBe(false);
  });

  test('closing on an unrecorded follow-up is refused, with the reason', () => {
    const result = validateReferralClosure({}, scheduledFollowUp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('2026-10-20');
      expect(result.message).toContain('before closing the referral');
    }
  });

  test('the clinician confirming the follow-up releases the gate', () => {
    const result = validateReferralClosure({ followUpResolved: true }, scheduledFollowUp);
    expect(result.ok).toBe(true);
  });

  test('a follow-up whose date has passed is resolved', () => {
    const past = { ...scheduledFollowUp, followUpDate: '2026-10-12', followUpTime: '10:00' };
    expect(isFollowUpResolved({}, past)).toBe(true);
    expect(validateReferralClosure({}, past).ok).toBe(true);
  });

  test('a recorded follow-up (completed or missed) is resolved', () => {
    for (const status of ['completed', 'missed']) {
      expect(isFollowUpResolved({}, { ...scheduledFollowUp, followUpStatus: status })).toBe(true);
      expect(validateReferralClosure({}, { ...scheduledFollowUp, followUpStatus: status }).ok).toBe(true);
    }
    expect(isFollowUpResolved({}, { ...scheduledFollowUp, followUpStatus: 'scheduled' })).toBe(false);
  });

  test('a referral with no follow-up date is not closed on an assumption', () => {
    const result = validateReferralClosure({}, { from: REFERRAL_STATUS.FOLLOW_UP, now: NOW });
    expect(result.ok).toBe(false);
  });

  test('no follow-up was ever scheduled straight after treatment', () => {
    expect(validateReferralClosure({}, { from: REFERRAL_STATUS.TREATMENT_STARTED, now: NOW }).ok).toBe(true);
  });
});

describe('closing a missed referral', () => {
  test('an outcome and a note are both required', () => {
    const noOutcome = validateReferralClosure({ notes: 'Tried three times.' }, { from: REFERRAL_STATUS.MISSED, now: NOW });
    expect(noOutcome.ok).toBe(false);

    const noNote = validateReferralClosure({ outcome: 'patient_unreachable' }, { from: REFERRAL_STATUS.MISSED, now: NOW });
    expect(noNote.ok).toBe(false);

    const both = validateReferralClosure(
      { outcome: 'patient_unreachable', notes: 'Three attempts, no response.' },
      { from: REFERRAL_STATUS.MISSED, now: NOW },
    );
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.notes).toBe('Three attempts, no response.');
  });

  test('attendance elsewhere has to name the hospital', () => {
    const unnamed = validateReferralClosure(
      { outcome: 'attended_another_hospital', notes: 'Seen elsewhere.' },
      { from: REFERRAL_STATUS.MISSED, now: NOW },
    );
    expect(unnamed.ok).toBe(false);

    const named = validateReferralClosure(
      { outcome: 'attended_another_hospital', notes: 'Seen elsewhere.', otherHospitalName: 'District HQ Hospital' },
      { from: REFERRAL_STATUS.MISSED, now: NOW },
    );
    expect(named.ok).toBe(true);
  });

  test('a missed visit is never closed as "treatment completed"', () => {
    const result = validateReferralClosure(
      { outcome: CARE_COMPLETION_OUTCOME, notes: 'Closed.' },
      { from: REFERRAL_STATUS.MISSED, now: NOW },
    );
    expect(result.ok).toBe(false);
  });
});

describe('the collection path applies the same closure rules', () => {
  const write = (stored: unknown[], incoming: unknown[]) =>
    mergeAuthorizedWrite('referrals', stored, incoming, hospital, { actor }) as Referral[];

  test('a FOLLOW-UP referral is not closed while its follow-up is unrecorded', () => {
    // A follow-up that is still UPCOMING is unresolved by definition. The date
    // is computed instead of hardcoded: the collection path validates against
    // the real clock, so a fixed date turns this into a passing (or failing)
    // test depending on the day the suite runs.
    const upcomingFollowUp = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const stored = referral({ status: REFERRAL_STATUS.FOLLOW_UP, followUpDate: upcomingFollowUp });
    const merged = write([stored], [referral({ status: REFERRAL_STATUS.CLOSED, closedAt: '2026-10-15T12:00:00.000Z' })]);
    expect(merged[0].status).toBe(REFERRAL_STATUS.FOLLOW_UP);
  });

  test('the same closure is applied once the follow-up was confirmed done', () => {
    const stored = referral({ status: REFERRAL_STATUS.FOLLOW_UP, followUpDate: '2026-10-20' });
    const merged = write(
      [stored],
      [referral({
        status: REFERRAL_STATUS.CLOSED,
        closedAt: '2026-10-15T12:00:00.000Z',
        followUpResolvedAt: '2026-10-15T11:00:00.000Z',
        closureOutcome: CARE_COMPLETION_OUTCOME,
      })],
    );
    expect(merged[0].status).toBe('closed');
  });

  test('closing straight after treatment (no follow-up) still works offline', () => {
    const stored = referral({ status: REFERRAL_STATUS.TREATMENT_STARTED });
    const merged = write([stored], [referral({ status: REFERRAL_STATUS.CLOSED, closedAt: '2026-10-15T12:00:00.000Z' })]);
    expect(merged[0].status).toBe('closed');
  });
});

describe('next action per status', () => {
  test('every open status maps to the step the engine would accept', () => {
    const expected: [Referral['status'], string][] = [
      ['created', 'accept'],
      ['accepted', 'assign_doctor'],
      ['doctor_assigned', 'schedule'],
      ['scheduled', 'verify_arrival'],
      ['awaiting_confirmation', 'confirm_missed'],
      ['missed', 'record_contact'],
      ['contacted', 'reschedule_referral'],
      ['rescheduled', 'verify_arrival'],
      ['patient_arrived', 'start_consultation'],
      ['consultation', 'complete_consultation'],
      ['treatment', 'close'],
      ['followup', 'close'],
    ];
    for (const [status, action] of expected) {
      const next = nextActionFor(referral({ status }), NOW);
      expect(`${status}:${next?.action}`).toBe(`${status}:${action}`);
      // The step must be one the engine accepts from that status.
      expect(actionFroms(next!.action)).toContain(status);
    }
  });

  test('finished referrals have no next step', () => {
    expect(nextActionFor(referral({ status: 'closed' }), NOW)).toBeNull();
    expect(nextActionFor(referral({ status: 'cancelled' }), NOW)).toBeNull();
  });

  test('the owner of each step is the side the engine authorises', () => {
    expect(nextActionFor(referral({ status: 'created' }), NOW)?.owner).toBe('destination');
    expect(nextActionFor(referral({ status: 'patient_arrived' }), NOW)?.owner).toBe('assigned_doctor');
    expect(nextActionFor(referral({ status: 'missed' }), NOW)?.owner).toBe('either');
  });

  test('the deadline comes from the stored record', () => {
    const waiting = referral({ status: 'scheduled', appointmentDate: '2026-10-15', appointmentTime: '08:00' });
    expect(nextActionFor(waiting, NOW)?.overdue).toBe(false); // within the grace window
    const longOverdue = referral({ status: 'scheduled', appointmentDate: '2026-10-10', appointmentTime: '08:00' });
    expect(nextActionFor(longOverdue, NOW)?.overdue).toBe(true);
  });

  test('a follow-up past its date is an overdue step', () => {
    const late = referral({ status: 'followup', followUpDate: '2026-10-12' });
    expect(nextActionFor(late, NOW)?.overdue).toBe(true);
  });
});

describe('the open referral tracker', () => {
  const events = (referralId: string, status: string, timestamp: string): ReferralEvent[] => [
    { id: `e-${referralId}-${status}`, referralId, status: status as Referral['status'], newStatus: status, timestamp, description: '', performedBy: 'Admin' },
  ];

  test('finished referrals never appear', () => {
    const rows = openReferralTracker(
      [referral({ id: 'a', status: 'closed' }), referral({ id: 'b', status: 'cancelled' }), referral({ id: 'c', status: 'scheduled' })],
      [],
      NOW,
    );
    expect(rows.map(row => row.referral.id)).toEqual(['c']);
  });

  test('overdue steps come first, then the missed-visit cycle', () => {
    const rows = openReferralTracker(
      [
        referral({ id: 'on-track', status: 'accepted' }),
        referral({ id: 'overdue', status: 'scheduled', appointmentDate: '2026-10-01', appointmentTime: '09:00' }),
        referral({ id: 'missed', status: 'missed', missedAt: '2026-10-14T09:00:00.000Z', appointmentDate: '2026-10-13' }),
      ],
      [],
      NOW,
    );
    expect(rows.map(row => row.referral.id)).toEqual(['overdue', 'missed', 'on-track']);
  });

  test('a more urgent priority wins between two referrals that are equally late', () => {
    const rows = openReferralTracker(
      [
        referral({ id: 'routine', status: 'accepted', priority: 'routine' }),
        referral({ id: 'emergency', status: 'accepted', priority: 'emergency' }),
      ],
      [],
      NOW,
    );
    expect(rows[0].referral.id).toBe('emergency');
  });

  test('the limit keeps the most urgent rows only', () => {
    const rows = openReferralTracker(
      [
        referral({ id: 'late', status: 'scheduled', appointmentDate: '2026-10-01', appointmentTime: '09:00' }),
        referral({ id: 'new', status: 'created' }),
      ],
      [],
      NOW,
      1,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].referral.id).toBe('late');
  });

  test('hours in the current status come from the audit trail', () => {
    const r = referral({ id: 'r9', status: 'accepted', updatedAt: '2026-10-10T12:00:00.000Z' });
    expect(hoursInStatus(r, events('r9', 'accepted', '2026-10-14T12:00:00.000Z'), NOW)).toBe(24);
    // No event for the current status → the record's own update time is used.
    expect(hoursInStatus(r, [], NOW)).toBe(120);
  });

  test('the summary counts what the list shows', () => {
    const rows = openReferralTracker(
      [
        referral({ id: 'late', status: 'scheduled', appointmentDate: '2026-10-01', appointmentTime: '09:00' }),
        referral({ id: 'missed', status: 'missed', missedAt: '2026-10-14T09:00:00.000Z', appointmentDate: '2026-10-13' }),
        referral({ id: 'fresh', status: 'created' }),
      ],
      [],
      NOW,
    );
    const summary = openReferralSummary(rows, NOW);
    expect(summary.open).toBe(3);
    expect(summary.overdue).toBe(1);
    // The overdue scheduled appointment AND the confirmed missed visit both need
    // a person in the follow-up queue; the brand-new referral does not.
    expect(summary.followupQueue).toBe(2);
    expect(summary.worstOverdueHours).not.toBeNull();
  });
});

describe('closure metrics include the outstanding work', () => {
  test('open, overdue and the next-step breakdown come from the records', () => {
    const stats = computeClosureStats(
      [
        referral({ id: 'late', status: 'scheduled', appointmentDate: '2026-10-01', appointmentTime: '09:00' }),
        referral({ id: 'missed', status: 'missed', missedAt: '2026-10-14T09:00:00.000Z', appointmentDate: '2026-10-13' }),
        referral({ id: 'done', status: 'closed', createdAt: '2026-10-01T09:00:00.000Z', closedAt: '2026-10-02T09:00:00.000Z' }),
      ],
      [{ id: 'e1', referralId: 'done', status: 'closed', newStatus: 'closed', timestamp: '2026-10-02T09:00:00.000Z', description: '', performedBy: 'Doctor' }],
      NOW,
    );

    expect(stats.total).toBe(3);
    expect(stats.open).toBe(2);
    expect(stats.overdue).toBe(1);
    // The past appointment is uncertain (a person must confirm it) and the
    // missed visit is documented — both are in the follow-up queue.
    expect(stats.awaitingFollowup).toBe(2);
    expect(stats.missed).toBe(1);
    // One referral waits on an arrival check, the other on contacting the patient.
    expect(stats.nextActions.map(entry => entry.count)).toEqual([1, 1]);
    expect(stats.nextActions.map(entry => entry.action).sort()).toEqual(['record_contact', 'verify_arrival']);
    expect(stats.avgTimeInStatusHours).not.toBeNull();
  });

  test('an empty console reports no data instead of made-up numbers', () => {
    const stats = computeClosureStats([], [], NOW);
    expect(stats.total).toBe(0);
    expect(stats.open).toBe(0);
    expect(stats.nextActions).toEqual([]);
    expect(stats.avgTimeInStatusHours).toBeNull();
    expect(stats.closureRate).toBeNull();
  });

  test('the same records give the same figures on every dashboard', () => {
    const list = [
      referral({ id: 'a', status: 'followup', followUpDate: '2026-10-12' }),
      referral({ id: 'b', status: 'accepted' }),
    ];
    const hospitalView = computeClosureStats(list, [], NOW);
    const districtView = computeClosureStats(list, [], NOW);
    expect(hospitalView).toEqual(districtView);
  });
});
