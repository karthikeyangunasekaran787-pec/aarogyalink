// ============================================================================
// AarogyaLink — automatic missed-referral detection (system sweep)
// ----------------------------------------------------------------------------
// The app already knows when attendance was expected: the referral carries the
// appointment date and time. This sweep is the only automatic part of the
// follow-up workflow, and it deliberately stops at "attendance is uncertain":
//
//   scheduled  →  awaiting_confirmation     (expected time passed, nothing recorded)
//
// It NEVER marks a referral MISSED. A missed appointment is a documented fact
// about a person, so it is only ever recorded by an authorized human action
// (confirm_missed in appReferral.ts) after somebody actually established that
// the patient did not attend. A hospital that failed to update its records
// therefore produces an uncertain referral for a person to check — not a
// "missed" one.
//
// Idempotent by construction: the audit id is derived from the referral and the
// appointment cycle it belongs to, so repeated runs (or several devices) can
// never create a second record, and a re-scheduled visit is its own cycle.
// ============================================================================

import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { parseEnvelope, payloadFits, serializeEnvelope } from './authz';
import { REFERRAL_STATUS, referralStepOf, REFERRAL_TOTAL_STEPS } from './referralStatus';
import { sweepDecision, type AppointmentLike } from '../lib/missed-referrals';
import type { ReferralStatus } from '../types';

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readItems(ctx: MutationCtx, key: string): Promise<unknown[]> {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  return parseEnvelope(row?.data)?.items ?? [];
}

async function writeItems(ctx: MutationCtx, key: string, items: unknown[]) {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  // Keep the dataset version the app is using: a different version would be
  // treated as a brand-new dataset by appData.ts and bypass its authorization.
  const version = parseEnvelope(row?.data)?.v ?? '1';
  const data = serializeEnvelope(version, items);
  if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
  else await ctx.db.insert('collections', { key, data, updatedAt: Date.now() });
}

/**
 * Flag every referral whose expected attendance has quietly passed.
 *
 * Runs on a schedule (see crons.ts) and is also safe to run by hand at any
 * time: a second run finds the records it already wrote and changes nothing.
 */
export const sweepOverdueReferrals = internalMutation({
  args: {},
  handler: async ctx => {
    const now = new Date();
    const nowIso = now.toISOString();

    const referrals = await readItems(ctx, 'referrals');
    const events = await readItems(ctx, 'referralEvents');
    const existingEventIds = new Set(events.filter(isRecord).map(e => str(e.id)).filter((id): id is string => !!id));

    const appendedEvents: unknown[] = [];
    const updatedById = new Map<string, Record<string, unknown>>();
    let scanned = 0;

    for (const referral of referrals) {
      if (!isRecord(referral)) continue;
      const id = str(referral.id);
      if (!id) continue;
      scanned += 1;

      const decision = sweepDecision(
        {
          id,
          status: str(referral.status) as ReferralStatus,
          appointmentDate: str(referral.appointmentDate),
          appointmentTime: str(referral.appointmentTime),
        } as AppointmentLike & { id: string; status: ReferralStatus },
        now,
        existingEventIds,
      );
      if (!decision) continue;

      existingEventIds.add(decision.eventId);
      updatedById.set(id, {
        ...referral,
        status: REFERRAL_STATUS.AWAITING_CONFIRMATION,
        currentStep: referralStepOf(REFERRAL_STATUS.AWAITING_CONFIRMATION),
        totalSteps: REFERRAL_TOTAL_STEPS,
        awaitingConfirmationAt: nowIso,
        awaitingConfirmationByName: 'AarogyaLink follow-up monitor',
        isOverdue: true,
        updatedAt: nowIso,
      });
      appendedEvents.push({
        id: decision.eventId,
        referralId: id,
        status: REFERRAL_STATUS.AWAITING_CONFIRMATION,
        eventType: 'awaiting_confirmation',
        canonicalStatus: 'AWAITING_CONFIRMATION',
        previousStatus: str(referral.status),
        newStatus: REFERRAL_STATUS.AWAITING_CONFIRMATION,
        description:
          'Expected appointment time passed with no arrival recorded — attendance awaiting confirmation by a person.',
        performedBy: 'AarogyaLink follow-up monitor',
        performedByRole: 'system',
        timestamp: nowIso,
        actorName: 'AarogyaLink follow-up monitor',
        actorRole: 'system',
      });
    }

    if (updatedById.size === 0) return { ok: true as const, scanned, flagged: 0 };

    const nextReferrals = referrals.map(r =>
      isRecord(r) && str(r.id) && updatedById.has(str(r.id) as string)
        ? (updatedById.get(str(r.id) as string) as unknown)
        : r,
    );
    const nextEvents = [...events, ...appendedEvents];

    // Never attempt a write Convex would reject; the next run picks it up.
    if (!payloadFits('1', nextReferrals) || !payloadFits('1', nextEvents)) {
      return { ok: false as const, scanned, flagged: 0, reason: 'payload_too_large' as const };
    }

    await writeItems(ctx, 'referrals', nextReferrals);
    await writeItems(ctx, 'referralEvents', nextEvents);
    return { ok: true as const, scanned, flagged: updatedById.size };
  },
});
