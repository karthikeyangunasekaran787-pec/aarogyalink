// ============================================================================
// AarogyaLink — Referral Closure Engine (server-authoritative)
// ----------------------------------------------------------------------------
// Every referral transition goes through `transitionReferral` once the device
// has a backend session. The engine is the single writer of referral status and
// history, so the frontend can never fabricate a transition, an actor or a
// status:
//
//   • the actor (id / name / role / facility) comes from the STORED session
//     binding — nothing about the caller is taken from the request;
//   • the referral is loaded from the stored collection and the transition is
//     validated against the canonical model (convex/referralStatus.ts);
//   • the record and the event are written together, and the resulting record is
//     returned so the client adopts the server's version instead of its own.
//
// Repeating an action is idempotent: an action whose target status is already
// reached returns `duplicate` without writing a second event, and an optional
// idempotency key suppresses a replayed offline write.
// ============================================================================

import { mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { parseEnvelope, payloadFits, serializeEnvelope } from './authz';
import {
  REFERRAL_ACTIONS,
  REFERRAL_STATUS,
  actionFroms,
  canTransition,
  isTerminalStatus,
  referralStepOf,
  referralStatusLabel,
  REFERRAL_TOTAL_STEPS,
  type ReferralAction,
  type ReferralStatusValue,
} from './referralStatus';

type Ctx = MutationCtx;

interface Binding {
  role: string;
  districtId?: string;
  districtName?: string;
  hospitalId?: string;
  staffUserId?: string;
  patientId?: string;
  name?: string;
  username?: string;
}

type Record_ = Record<string, unknown>;

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function isRecord(value: unknown): value is Record_ {
  return typeof value === 'object' && value !== null;
}

/** Event id: unique, and stable when the caller supplies an idempotency key. */
function eventId(referralId: string, action: string, key: string | undefined): string {
  return key ? `re-${referralId}-${action}-${key}` : `re-${referralId}-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readItems(ctx: Ctx, key: string): Promise<unknown[]> {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  return parseEnvelope(row?.data)?.items ?? [];
}

async function writeItems(ctx: Ctx, key: string, items: unknown[]) {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  // The engine MUST keep the dataset version the app is using. appData.ts treats
  // a version change as "first write of a new dataset" and accepts the payload
  // unscoped, so stamping a different version here would make the next client
  // write bypass authorization entirely.
  const version = parseEnvelope(row?.data)?.v ?? '1';
  const data = serializeEnvelope(version, items);
  if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
  else await ctx.db.insert('collections', { key, data, updatedAt: Date.now() });
}

/** The caller's stored session binding (never anything from the request). */
async function requireBinding(ctx: Ctx): Promise<Binding> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error('Not authenticated: sign in to use the referral workflow.');
  }
  const binding = await ctx.db
    .query('authSessions')
    .withIndex('by_user', q => q.eq('convexUserId', userId))
    .first();
  if (!binding) {
    throw new Error('No session binding: sign in again to use the referral workflow.');
  }
  return binding as Binding;
}

interface Actor {
  id?: string;
  name: string;
  role: string;
  hospitalId?: string;
}

function actorOf(binding: Binding): Actor {
  return {
    id: binding.staffUserId,
    name: binding.name || binding.username || 'AarogyaLink user',
    role: binding.role,
    hospitalId: binding.hospitalId,
  };
}

/** Is this referral's destination (or source) one of the actor's facilities? */
function referralSides(referral: Record_) {
  return {
    source: str(referral.sourceFacilityId),
    destination: str(referral.destinationFacilityId),
  };
}

/**
 * May this actor perform this action on this referral, at this status?
 * Returns a reason string when refused (used verbatim in the UI message).
 */
function permissionError(action: ReferralAction, binding: Binding, referral: Record_): string | null {
  // Platform-wide and district administrators oversee the whole workflow.
  if (binding.role === 'overall_admin') return null;
  if (binding.role === 'gov_admin') {
    return binding.districtId ? null : 'Unauthorized: your district is not set for this session.';
  }
  if (binding.role === 'patient') {
    return 'Unauthorized: patients cannot change referral status.';
  }

  const { source, destination } = referralSides(referral);
  const hospitalId = binding.hospitalId;
  if (!hospitalId) {
    return 'Unauthorized: your account is not linked to a hospital.';
  }
  const spec = REFERRAL_ACTIONS[action];
  const isDestination = destination === hospitalId;
  const isSource = source === hospitalId;

  if (spec.permission === 'destination') {
    return isDestination
      ? null
      : 'Unauthorized: only the receiving hospital can perform this step.';
  }
  if (spec.permission === 'source_or_destination') {
    return isDestination || isSource
      ? null
      : 'Unauthorized: this referral does not belong to your hospital.';
  }

  // assigned_doctor: strictly the doctor the receiving hospital assigned.
  // The hospital's administration may still close a referral (an authorised
  // clinical decision), but it must not run the consultation itself.
  const assignedDoctorUserId = str(referral.assignedDoctorStaffUserId);
  const assignedDoctorRecordId = str(referral.assignedDoctorId);
  const isAssignedDoctor =
    !!binding.staffUserId &&
    (binding.staffUserId === assignedDoctorRecordId || binding.staffUserId === assignedDoctorUserId);
  if (isAssignedDoctor) return null;
  if (action === 'close' && isDestination && binding.role === 'hospital_admin') return null;
  if (!assignedDoctorRecordId) {
    return 'Unauthorized: no doctor is assigned to this referral yet.';
  }
  if (isSource || isDestination) {
    return 'Unauthorized: only the doctor assigned to this referral can perform this step.';
  }
  return 'Unauthorized: this referral does not belong to your hospital.';
}

export const transitionReferral = mutation({
  args: {
    referralId: v.string(),
    action: v.string(),
    /** Idempotency key for a replayed (offline) write. */
    idempotencyKey: v.optional(v.string()),
    doctorId: v.optional(v.string()),
    doctorName: v.optional(v.string()),
    doctorStaffUserId: v.optional(v.string()),
    department: v.optional(v.string()),
    date: v.optional(v.string()),
    time: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
    consultationId: v.optional(v.string()),
    notes: v.optional(v.string()),
    diagnosis: v.optional(v.string()),
    prescription: v.optional(v.array(v.string())),
    followUpDate: v.optional(v.string()),
    followUpType: v.optional(v.string()),
    instructions: v.optional(v.string()),
    clinicalNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    const actor = actorOf(binding);
    const action = args.action as ReferralAction;
    const spec = REFERRAL_ACTIONS[action];
    if (!spec) return { ok: false as const, reason: 'invalid_action' as const, message: 'Unknown referral action.' };

    // ── Load the stored referral ─────────────────────────────────────
    const referrals = await readItems(ctx, 'referrals');
    const referral = referrals.find(r => isRecord(r) && str(r.id) === args.referralId);
    if (!isRecord(referral)) {
      return { ok: false as const, reason: 'not_found' as const, message: 'Referral not found.' };
    }
    const status = str(referral.status) as ReferralStatusValue | undefined;

    // ── Authorization (stored binding vs stored referral) ────────────
    const denied = permissionError(action, binding, referral);
    if (denied) {
      return { ok: false as const, reason: 'forbidden' as const, message: denied };
    }

    // ── Idempotency: the target status is already reached ────────────
    const idempotent = spec.to === spec.from;
    if (!idempotent && status === spec.to) {
      return {
        ok: true as const,
        duplicate: true as const,
        status: spec.to,
        message: `${referralStatusLabel(spec.to)} was already recorded for this referral.`,
      };
    }
    if (isTerminalStatus(status) && !idempotent) {
      return {
        ok: false as const,
        reason: 'already_closed' as const,
        status,
        message: `This referral is already ${referralStatusLabel(status).toLowerCase()}.`,
      };
    }

    // ── Transition validation ───────────────────────────────────────
    if (!idempotent) {
      if (!status || !actionFroms(action).includes(status)) {
        return {
          ok: false as const,
          reason: 'invalid_transition' as const,
          status,
          message: `Cannot ${action.replace(/_/g, ' ')} while the referral is ${referralStatusLabel(status).toLowerCase()}.`,
        };
      }
      if (!canTransition(status, spec.to)) {
        return {
          ok: false as const,
          reason: 'invalid_transition' as const,
          status,
          message: `Invalid status transition: ${referralStatusLabel(status)} → ${referralStatusLabel(spec.to)}.`,
        };
      }
    } else if (status !== spec.to) {
      return {
        ok: false as const,
        reason: 'invalid_transition' as const,
        status,
        message: `The referral must be ${referralStatusLabel(spec.to).toLowerCase()} for this step.`,
      };
    }

    // ── Action-specific validation ──────────────────────────────────
    const now = new Date().toISOString();
    let doctorId = args.doctorId;
    let doctorName = args.doctorName;
    let doctorStaffUserId = args.doctorStaffUserId;

    if (action === 'assign_doctor') {
      // A doctor must exist, and must belong to the RECEIVING hospital.
      const destination = str(referral.destinationFacilityId);
      const doctors = await readItems(ctx, 'doctors');
      const doctor = doctors.find(d => isRecord(d) && str(d.id) === args.doctorId);
      if (!isRecord(doctor)) {
        return { ok: false as const, reason: 'doctor_not_found' as const, message: 'Doctor not found.' };
      }
      if (str(doctor.facilityId) !== destination) {
        return {
          ok: false as const,
          reason: 'doctor_not_available' as const,
          message: 'That doctor does not belong to the receiving hospital.',
        };
      }
      doctorId = str(doctor.id);
      doctorName = str(doctor.name);
      doctorStaffUserId = str(doctor.userId);
    }

    if (action === 'schedule') {
      if (!args.date || !args.time) {
        return { ok: false as const, reason: 'invalid_request' as const, message: 'An appointment date and time are required.' };
      }
    }

    if (action === 'schedule_followup' && !args.followUpDate) {
      return { ok: false as const, reason: 'invalid_request' as const, message: 'A follow-up date is required.' };
    }

    // ── Apply the transition to the stored record ───────────────────
    const updated: Record_ = {
      ...referral,
      status: spec.to,
      currentStep: referralStepOf(spec.to),
      totalSteps: REFERRAL_TOTAL_STEPS,
      updatedAt: now,
    };

    switch (action) {
      case 'accept':
        updated.acceptedByUserId = actor.id ?? actor.name;
        updated.acceptedByName = actor.name;
        updated.acceptedAt = now;
        updated.acceptedByHospitalId = actor.hospitalId;
        break;
      case 'assign_doctor':
        updated.doctorId = doctorId;
        updated.doctorName = doctorName;
        updated.assignedDoctorId = doctorId;
        updated.assignedDoctorName = doctorName;
        updated.assignedDoctorStaffUserId = doctorStaffUserId;
        updated.assignedByUserId = actor.id ?? actor.name;
        updated.assignedByName = actor.name;
        updated.assignedAt = now;
        if (args.department) updated.department = args.department;
        break;
      case 'schedule':
        updated.appointmentDate = args.date;
        updated.appointmentTime = args.time;
        updated.scheduledAt = now;
        updated.scheduledByUserId = actor.id ?? actor.name;
        if (args.appointmentId) updated.appointmentId = args.appointmentId;
        break;
      case 'verify_arrival':
        updated.arrivalVerifiedAt = now;
        updated.arrivalVerifiedBy = actor.name;
        updated.arrivalVerifiedByUserId = actor.id;
        updated.arrivalHospitalId = actor.hospitalId;
        break;
      case 'start_consultation':
        updated.consultationStartedAt = now;
        break;
      case 'complete_consultation':
        updated.consultationCompletedAt = now;
        updated.consultationId = args.consultationId ?? updated.consultationId;
        if (args.diagnosis) updated.diagnosis = args.diagnosis;
        if (args.notes) updated.consultationNotes = args.notes;
        if (args.prescription) updated.prescription = args.prescription;
        break;
      case 'record_treatment':
        if (args.notes) updated.treatmentNotes = args.notes;
        break;
      case 'schedule_followup':
        updated.followUpDate = args.followUpDate;
        updated.followUpType = args.followUpType;
        updated.followUpInstructions = args.instructions;
        break;
      case 'close':
        updated.closedAt = now;
        updated.closedByUserId = actor.id ?? actor.name;
        updated.closedByName = actor.name;
        updated.closureNotes = args.notes;
        break;
      case 'cancel':
      case 'reject':
        updated.cancelledAt = now;
        updated.cancelledByUserId = actor.id ?? actor.name;
        updated.cancelledByName = actor.name;
        updated.cancellationReason = args.notes;
        break;
      default:
        break;
    }

    // ── Event history (never overwritten, only appended) ────────────
    const events = await readItems(ctx, 'referralEvents');
    const existingIds = new Set(events.filter(isRecord).map(e => str(e.id)));
    const appended: unknown[] = [];
    for (const kind of spec.events) {
      const id = eventId(args.referralId, kind.type, args.idempotencyKey);
      if (existingIds.has(id)) continue; // replay of an already-applied write
      existingIds.add(id);
      appended.push({
        id,
        referralId: args.referralId,
        status: spec.to,
        eventType: kind.type,
        canonicalStatus: kind.canonical,
        previousStatus: status,
        newStatus: spec.to,
        description: args.notes ? `${kind.description} ${args.notes}` : kind.description,
        notes: args.notes,
        performedBy: actor.name,
        performedByUserId: actor.id,
        performedByRole: actor.role,
        performedByFacilityId: actor.hospitalId,
        actorId: actor.id,
        actorName: actor.name,
        actorRole: actor.role,
        hospitalId: actor.hospitalId,
        timestamp: now,
        metadata: action === 'assign_doctor' ? { doctorId, doctorName } : undefined,
      });
    }

    const nextReferrals = referrals.map(r => (isRecord(r) && str(r.id) === args.referralId ? updated : r));
    const nextEvents = [...events, ...appended];
    const version = '1'; // only used for the size estimate below

    // Size guard: never attempt a write Convex would reject.
    if (!payloadFits(version, nextReferrals) || !payloadFits(version, nextEvents)) {
      return {
        ok: false as const,
        reason: 'payload_too_large' as const,
        message: 'The referral store is too large to update — contact the platform administrator.',
      };
    }

    await writeItems(ctx, 'referrals', nextReferrals);
    if (appended.length > 0) await writeItems(ctx, 'referralEvents', nextEvents);

    return {
      ok: true as const,
      duplicate: false as const,
      status: spec.to,
      referral: updated,
      events: appended,
      message:
        action === 'cancel' || action === 'reject'
          ? `Referral ${referralStatusLabel(spec.to).toLowerCase()}.`
          : `Referral moved to ${referralStatusLabel(spec.to)}.`,
    };
  },
});

/**
 * QR arrival verification.
 *
 * Kept separate because it validates the SCAN itself (the scanned value may be a
 * referral id, a health card id or the raw internal id) and reports the specific
 * refusal the reception desk needs to see. Only the receiving hospital may
 * verify, and it happens exactly once.
 */
export const verifyArrival = mutation({
  args: { scanned: v.string(), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, { scanned }) => {
    const binding = await requireBinding(ctx);
    const actor = actorOf(binding);
    const needle = scanned.trim().toUpperCase();

    const referrals = await readItems(ctx, 'referrals');
    const match = referrals.find(r => {
      if (!isRecord(r)) return false;
      const candidates = [str(r.id), str(r.referralId), str(r.healthCardId)];
      return candidates.some(c => c && c.toUpperCase() === needle);
    });

    if (!isRecord(match)) {
      return { ok: false as const, reason: 'not_found' as const, message: 'No referral matches that QR code.' };
    }

    const status = str(match.status);
    const referralId = str(match.id) ?? '';
    const destination = str(match.destinationFacilityId);

    if (status === REFERRAL_STATUS.ARRIVAL_VERIFIED) {
      return {
        ok: false as const,
        reason: 'already_verified' as const,
        referralId,
        message: 'Arrival already verified for this referral.',
      };
    }
    if (isTerminalStatus(status)) {
      return {
        ok: false as const,
        reason: 'already_closed' as const,
        referralId,
        message: `This referral is already ${referralStatusLabel(status).toLowerCase()}.`,
      };
    }
    if (binding.role !== 'overall_admin' && binding.role !== 'gov_admin' && destination !== binding.hospitalId) {
      return {
        ok: false as const,
        reason: 'wrong_hospital' as const,
        referralId,
        message: 'This QR code belongs to a referral for another hospital.',
      };
    }
    if (status !== REFERRAL_STATUS.SCHEDULED) {
      return {
        ok: false as const,
        reason: 'invalid_transition' as const,
        referralId,
        status,
        message: `Arrival can only be verified once the referral is scheduled (currently ${referralStatusLabel(status).toLowerCase()}).`,
      };
    }

    const now = new Date().toISOString();
    const updated: Record_ = {
      ...match,
      status: REFERRAL_STATUS.ARRIVAL_VERIFIED,
      currentStep: referralStepOf(REFERRAL_STATUS.ARRIVAL_VERIFIED),
      totalSteps: REFERRAL_TOTAL_STEPS,
      arrivalVerifiedAt: now,
      arrivalVerifiedBy: actor.name,
      arrivalVerifiedByUserId: actor.id,
      arrivalHospitalId: actor.hospitalId,
      updatedAt: now,
    };
    const events = await readItems(ctx, 'referralEvents');
    const id = eventId(referralId, 'patient_arrived', undefined);
    const event = {
      id,
      referralId,
      status: REFERRAL_STATUS.ARRIVAL_VERIFIED,
      eventType: 'patient_arrived',
      canonicalStatus: 'ARRIVAL_VERIFIED',
      previousStatus: status,
      newStatus: REFERRAL_STATUS.ARRIVAL_VERIFIED,
      description: 'Patient arrival verified with the referral QR.',
      performedBy: actor.name,
      performedByUserId: actor.id,
      performedByRole: actor.role,
      performedByFacilityId: actor.hospitalId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      hospitalId: actor.hospitalId,
      timestamp: now,
    };

    const version = '1'; // only used for the size estimate below
    const nextReferrals = referrals.map(r => (isRecord(r) && str(r.id) === referralId ? updated : r));
    if (!payloadFits(version, nextReferrals) || !payloadFits(version, [...events, event])) {
      return { ok: false as const, reason: 'payload_too_large' as const, message: 'The referral store is too large to update.' };
    }
    await writeItems(ctx, 'referrals', nextReferrals);
    await writeItems(ctx, 'referralEvents', [...events, event]);

    return {
      ok: true as const,
      referralId,
      patientName: str(match.patientName),
      status: REFERRAL_STATUS.ARRIVAL_VERIFIED,
      referral: updated,
      event,
      message: `Arrival verified for ${str(match.patientName) ?? 'the patient'}.`,
    };
  },
});
