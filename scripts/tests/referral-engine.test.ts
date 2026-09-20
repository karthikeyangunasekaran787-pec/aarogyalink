/**
 * Unit tests for the Referral Closure Engine's shared rules — run with: bun test
 * (Files live under scripts/tests so Vite's tsconfig doesn't pick them up.)
 *
 * Covers the two places the workflow is protected:
 *   • the canonical status model (transitions, steps)
 *   • the collection-path merge, so a client payload cannot jump, reverse or
 *     duplicate a referral, or attribute an action to somebody else
 *   • the closure metrics, which must never invent a number
 */
import { describe, expect, test } from 'bun:test';
import {
  REFERRAL_STATUS,
  canTransition,
  referralStepOf,
  isTerminalStatus,
  actionFroms,
} from '../../src/convex/referralStatus';
import { mergeAuthorizedWrite, type SessionScope, type WriteScope } from '../../src/convex/authz';
import { computeClosureStats } from '../../src/components/shared/ReferralClosureStats';
import type { Referral, ReferralEvent } from '../../src/types';

const referral = (over: Partial<Referral> = {}): Referral => ({
  id: 'r1',
  referralId: 'REF-PDK-0001',
  patientId: 'p1',
  patientName: 'Lakshmi Devi',
  sourceFacilityId: 'hA',
  sourceFacilityName: 'Sending Hospital',
  destinationFacilityId: 'hB',
  destinationFacilityName: 'Receiving Hospital',
  department: 'General Medicine',
  priority: 'urgent',
  reason: 'Specialist review',
  status: REFERRAL_STATUS.CREATED,
  currentStep: 1,
  totalSteps: 9,
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
  isOverdue: false,
  ...over,
});

const hospital: SessionScope = { kind: 'hospital', hospitalId: 'hB', staffUserId: 'ustaff-admin' };
const actor: WriteScope['actor'] = { id: 'ustaff-admin', name: 'Rajesh Kumar', role: 'hospital_admin', hospitalId: 'hB' };

describe('canonical status model', () => {
  test('the chain is the single ordered workflow', () => {
    expect(referralStepOf(REFERRAL_STATUS.CREATED)).toBe(1);
    expect(referralStepOf(REFERRAL_STATUS.ACCEPTED)).toBe(2);
    expect(referralStepOf(REFERRAL_STATUS.DOCTOR_ASSIGNED)).toBe(3);
    expect(referralStepOf(REFERRAL_STATUS.SCHEDULED)).toBe(4);
    expect(referralStepOf(REFERRAL_STATUS.ARRIVAL_VERIFIED)).toBe(5);
    expect(referralStepOf(REFERRAL_STATUS.CONSULTATION_COMPLETED)).toBe(6);
    expect(referralStepOf(REFERRAL_STATUS.TREATMENT_STARTED)).toBe(7);
    expect(referralStepOf(REFERRAL_STATUS.FOLLOW_UP)).toBe(8);
    expect(referralStepOf(REFERRAL_STATUS.CLOSED)).toBe(9);
  });

  test('forward steps are allowed and nothing may reverse', () => {
    expect(canTransition('created', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'doctor_assigned')).toBe(true);
    expect(canTransition('treatment', 'followup')).toBe(true);
    expect(canTransition('treatment', 'closed')).toBe(true); // no follow-up needed
    expect(canTransition('followup', 'closed')).toBe(true);
    expect(canTransition('accepted', 'created')).toBe(false);
    expect(canTransition('treatment', 'accepted')).toBe(false);
  });

  test('the workflow cannot be short-circuited', () => {
    expect(canTransition('created', 'closed')).toBe(false);
    expect(canTransition('created', 'patient_arrived')).toBe(false);
    expect(canTransition('scheduled', 'closed')).toBe(false);
    expect(canTransition('patient_arrived', 'closed')).toBe(false);
  });

  test('closure is permanent', () => {
    expect(isTerminalStatus('closed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('followup')).toBe(false);
    expect(canTransition('closed', 'closed')).toBe(false);
  });

  test('each action is only valid from the status the engine expects', () => {
    expect(actionFroms('accept')).toEqual(['created']);
    expect(actionFroms('verify_arrival')).toEqual(['scheduled']);
    expect(actionFroms('schedule_followup')).toEqual(['treatment']);
    expect(actionFroms('close')).toEqual(['treatment', 'followup']);
  });
});

describe('collection-path referral writes', () => {
  const write = (stored: unknown[], incoming: unknown[], actorOverride = actor) =>
    mergeAuthorizedWrite('referrals', stored, incoming, hospital, { actor: actorOverride });

  test('a valid forward transition through the payload is applied', () => {
    const merged = write([referral()], [referral({ status: REFERRAL_STATUS.ACCEPTED })]) as Referral[];
    expect(merged[0].status).toBe('accepted');
  });

  test('a jumped status (CREATED → CLOSED) is refused', () => {
    const merged = write([referral()], [referral({ status: REFERRAL_STATUS.CLOSED })]) as Referral[];
    expect(merged[0].status).toBe('created');
  });

  test('a backwards status change is refused', () => {
    const stored = [referral({ status: REFERRAL_STATUS.TREATMENT_STARTED })];
    const merged = write(stored, [referral({ status: REFERRAL_STATUS.ACCEPTED })]) as Referral[];
    expect(merged[0].status).toBe('treatment');
  });

  test('a new referral is always stored as CREATED with the server-side creator', () => {
    const incoming = [referral({
      id: 'r9',
      status: REFERRAL_STATUS.CLOSED,
      createdByUserId: 'FORGED',
      createdByName: 'Forged Actor',
      createdByRole: 'overall_admin',
    })];
    const merged = write([], incoming) as Referral[];
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('created');
    expect(merged[0].createdByName).toBe(actor?.name);
    expect(merged[0].createdByRole).toBe('hospital_admin');
  });

  test('another hospital\'s referral is untouched and cannot be claimed', () => {
    const foreign = referral({ id: 'r7', sourceFacilityId: 'hX', destinationFacilityId: 'hX' });
    const merged = write([foreign], [{ ...foreign, status: REFERRAL_STATUS.CLOSED, patientName: 'HIJACKED' }]) as Referral[];
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('created');
    expect(merged[0].patientName).toBe('Lakshmi Devi');
  });

  test('a payload cannot duplicate one referral into two records', () => {
    const merged = write([referral()], [referral(), referral()]) as Referral[];
    expect(merged).toHaveLength(1);
  });

  test('without a session binding nothing is written', () => {
    const merged = mergeAuthorizedWrite('referrals', [referral()], [], null, { actor });
    expect(merged).toHaveLength(1);
  });
});

describe('referral audit trail', () => {
  test('events are append-only and attributed to the stored actor', () => {
    const storedEvent = {
      id: 're-created',
      referralId: 'r1',
      newStatus: 'created',
      actorName: 'Forged Actor',
      actorRole: 'overall_admin',
      timestamp: '2026-09-19T10:00:00.000Z',
    };
    const incomingEvent = {
      id: 're-accepted',
      referralId: 'r1',
      newStatus: 'accepted',
      actorName: 'Forged Actor',
      actorRole: 'overall_admin',
      timestamp: '2026-09-19T11:00:00.000Z',
    };
    // Two referrals stored (r1 in scope, r2 elsewhere) so the foreign filter is
    // exercised too.
    const merged = mergeAuthorizedWrite(
      'referralEvents',
      [storedEvent, { id: 're-other', referralId: 'r2', newStatus: 'created' }],
      [incomingEvent, { id: 're-other-2', referralId: 'r2', newStatus: 'accepted' }],
      hospital,
      { actor, foreignReferralIds: new Set(['r2']) },
    ) as Record<string, unknown>[];

    const ids = merged.map(e => e.id);
    expect(ids).toContain('re-created');
    expect(ids).toContain('re-accepted');
    // The event for another hospital's referral is never written.
    expect(ids).not.toContain('re-other-2');
    expect(ids).not.toContain('re-other');
    // A stored event is never modified…
    expect(merged.find(e => e.id === 're-created')?.actorName).toBe('Forged Actor');
    // …and a new event carries the server-verified actor identity.
    expect(merged.find(e => e.id === 're-accepted')?.actorName).toBe('Rajesh Kumar');
    expect(merged.find(e => e.id === 're-accepted')?.actorRole).toBe('hospital_admin');
    expect(merged.find(e => e.id === 're-accepted')?.performedByFacilityId).toBe('hB');
  });

  test('a replayed event id is not appended twice', () => {
    const event = { id: 're-accepted', referralId: 'r1', newStatus: 'accepted' };
    const merged = mergeAuthorizedWrite('referralEvents', [event], [event], hospital, { actor }) as unknown[];
    expect(merged).toHaveLength(1);
  });
});

describe('closure metrics', () => {
  const events = (referralId: string): ReferralEvent[] => [
    { id: 'e1', referralId, status: 'created', newStatus: 'created', timestamp: '2026-09-01T00:00:00.000Z', description: '', performedBy: 'HW' },
    { id: 'e2', referralId, status: 'accepted', newStatus: 'accepted', timestamp: '2026-09-01T02:00:00.000Z', description: '', performedBy: 'Admin' },
    { id: 'e3', referralId, status: 'consultation', newStatus: 'consultation', timestamp: '2026-09-01T08:00:00.000Z', description: '', performedBy: 'Doctor' },
    { id: 'e4', referralId, status: 'closed', newStatus: 'closed', timestamp: '2026-09-02T00:00:00.000Z', description: '', performedBy: 'Doctor' },
  ];

  test('counts, closure rate and timings come from the events', () => {
    const referrals = [
      referral({ id: 'r1', status: 'closed', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' }),
      referral({ id: 'r2', status: 'scheduled', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T02:00:00.000Z' }),
    ];
    const allEvents = [...events('r1'), ...events('r2').slice(0, 2)];
    const stats = computeClosureStats(referrals, allEvents);

    expect(stats.total).toBe(2);
    expect(stats.byStatus.closed).toBe(1);
    expect(stats.byStatus.scheduled).toBe(1);
    expect(stats.closed).toBe(1);
    expect(stats.closureRate).toBe(50);
    expect(stats.avgAcceptHours).toBe(2);
    expect(stats.avgConsultHours).toBe(8);
    expect(stats.avgClosureHours).toBe(24);
  });

  test('reports "no data" instead of inventing numbers', () => {
    const stats = computeClosureStats([], []);
    expect(stats.total).toBe(0);
    expect(stats.closureRate).toBeNull();
    expect(stats.avgAcceptHours).toBeNull();
    expect(stats.avgConsultHours).toBeNull();
    expect(stats.avgClosureHours).toBeNull();
  });

  test('a stage that was never reached reports no timing data', () => {
    const stats = computeClosureStats([referral()], []);
    expect(stats.avgAcceptHours).toBeNull();
    expect(stats.avgConsultHours).toBeNull();
  });

  test('the funnel counts every referral that ever reached a stage', () => {
    const referrals = [referral({ id: 'r1', status: 'followup' }), referral({ id: 'r2', status: 'closed' })];
    const stats = computeClosureStats(referrals, []);
    const accepted = stats.reached.find(s => s.status === 'accepted');
    const closed = stats.reached.find(s => s.status === 'closed');
    expect(accepted?.count).toBe(2);
    expect(accepted?.percentage).toBe(100);
    expect(closed?.count).toBe(1);
    expect(closed?.percentage).toBe(50);
  });
});
