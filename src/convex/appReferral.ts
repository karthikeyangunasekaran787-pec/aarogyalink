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
import { districtFacilityIds, parseEnvelope, payloadFits, serializeEnvelope } from './authz';
import {
  ATTENDANCE_GRACE_HOURS,
  CONTACT_METHOD_VALUES,
  ESCALATION_RULES,
  MISSED_REASON_VALUES,
  appointmentCycleKey,
  hoursOverdue,
  notificationEventId,
  referralTouchesFacilities,
} from '../lib/missed-referrals';
import { validateReferralClosure } from '../lib/referral-closure';
import type { ContactMethod, MissedReason, Referral } from '../types';
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

/**
 * Actions that record an in-app follow-up notice in the audit trail. The set is
 * explicit so a notice can never be recorded for an unrelated transition, and
 * every id is derived from the referral + appointment cycle (never from the
 * current time), which is what prevents duplicate notifications.
 */
const NOTIFYING_ACTIONS = new Set<ReferralAction>([
  'confirm_missed',
  'record_contact',
  'reschedule_referral',
  'close_missed',
  'record_attendance_elsewhere',
]);

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
async function permissionError(
  ctx: Ctx,
  action: ReferralAction,
  binding: Binding,
  referral: Record_,
): Promise<string | null> {
  // Platform-wide administrators oversee the whole workflow.
  if (binding.role === 'overall_admin') return null;
  if (binding.role === 'gov_admin') {
    if (!binding.districtId) return 'Unauthorized: your district is not set for this session.';
    // A District Administrator acts only on referrals that touch one of THEIR
    // district's facilities. The facility ids come from the STORED hospital
    // records, so a crafted referral cannot pull the admin into another
    // district, and this holds for backend actions exactly as it does for reads.
    const hospitals = await readItems(ctx, 'hospitals');
    const facilityIds = districtFacilityIds(
      hospitals,
      binding.districtId,
      binding.districtName ?? binding.districtId,
    );
    const sides = referralSides(referral);
    const touches = referralTouchesFacilities(
      {
        sourceFacilityId: sides.source ?? '',
        destinationFacilityId: sides.destination ?? '',
      },
      facilityIds,
    );
    return touches ? null : 'Unauthorized: this referral belongs to another district.';
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
    // ── Missed-referral follow-up ──────────────────────────────────────
    /** Why the patient missed the appointment (a person chose this). */
    reason: v.optional(v.string()),
    /** How the follow-up contact was made (by the staff member, not the app). */
    method: v.optional(v.string()),
    /** Did the contact actually reach the patient? Never assumed. */
    reached: v.optional(v.boolean()),
    /** What the staff member did about it. */
    actionTaken: v.optional(v.string()),
    /** When the contact actually happened (the audit time stays server-set). */
    contactAt: v.optional(v.string()),
    /** When the patient should be contacted again (YYYY-MM-DD). */
    nextFollowUpDate: v.optional(v.string()),
    /** Documented outcome when closing a missed referral. */
    outcome: v.optional(v.string()),
    /** Hospital the patient actually attended (attendance elsewhere). */
    otherHospitalName: v.optional(v.string()),
    /** Date the patient attended that hospital (YYYY-MM-DD). */
    attendedDate: v.optional(v.string()),
    /**
     * The clinician closing a referral at FOLLOW-UP confirms the follow-up was
     * actually completed. Only a person ever sets this (see referral-closure.ts).
     */
    followUpResolved: v.optional(v.boolean()),
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
    const denied = await permissionError(ctx, action, binding, referral);
    if (denied) {
      return { ok: false as const, reason: 'forbidden' as const, message: denied };
    }

    // ── Idempotency: the target status is already reached ────────────
    // An EVENT-ONLY action (a contact attempt) documents something without
    // moving the referral, so it keeps the stored status and is validated
    // against the statuses it may be recorded from instead of a target status.
    const eventOnly = spec.to === spec.from;
    const targetStatus = eventOnly ? status : spec.to;
    const idempotent = eventOnly;
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
    } else if (!status || !actionFroms(action).includes(status)) {
      return {
        ok: false as const,
        reason: 'invalid_transition' as const,
        status,
        message: `The referral must be ${referralStatusLabel(spec.to).toLowerCase()} for this step.`,
      };
    }

    // ── Action-specific validation ──────────────────────────────────
    const now = new Date().toISOString();
    const nowDate = new Date(now);
    /** Set when an action above validated a closure (see referral-closure.ts). */
    let validatedClosure: { ok: true; outcome: string; notes?: string } | null = null;
    // When the contact actually happened, as stated by the person who made it.
    // A future or unparseable value is ignored: the record can never be dated
    // ahead of the system clock, and the event's own timestamp is always the
    // server's audit time.
    const requestedContactAt = args.contactAt ? new Date(args.contactAt) : null;
    const contactAt =
      requestedContactAt && !Number.isNaN(requestedContactAt.getTime()) && requestedContactAt.getTime() <= nowDate.getTime()
        ? requestedContactAt.toISOString()
        : now;
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

    // ── Missed-referral follow-up validation ────────────────────────
    // Nothing here guesses: a referral is only treated as missed/uncertain once
    // the expected time has genuinely passed, and the reason, contact details
    // and closure outcome all have to be supplied by a person.
    if (action === 'mark_unconfirmed' || action === 'confirm_missed') {
      const hours = hoursOverdue(
        {
          appointmentDate: str(referral.appointmentDate),
          appointmentTime: str(referral.appointmentTime),
        },
        nowDate,
      );
      if (hours === null) {
        return {
          ok: false as const,
          reason: 'invalid_request' as const,
          message: 'This referral has no scheduled appointment to compare against.',
        };
      }
      if (hours <= ATTENDANCE_GRACE_HOURS) {
        return {
          ok: false as const,
          reason: 'not_due' as const,
          message: 'The appointment time has not passed yet, so attendance cannot be missed.',
        };
      }
    }

    if (action === 'confirm_missed') {
      if (!args.reason || !MISSED_REASON_VALUES.includes(args.reason as MissedReason)) {
        return {
          ok: false as const,
          reason: 'invalid_request' as const,
          message: 'Choose the reason the patient missed the appointment.',
        };
      }
    }

    if (action === 'log_contact_attempt') {
      if (!args.method || !CONTACT_METHOD_VALUES.includes(args.method as ContactMethod)) {
        return { ok: false as const, reason: 'invalid_request' as const, message: 'Choose how the contact was made.' };
      }
      if (args.reached === true) {
        return {
          ok: false as const,
          reason: 'invalid_request' as const,
          message: 'Record a successful contact as a contact, not as an attempt.',
        };
      }
    }

    if (action === 'record_contact') {
      if (args.reached !== true) {
        return {
          ok: false as const,
          reason: 'invalid_request' as const,
          message: 'The patient can only be marked as contacted if they were actually reached.',
        };
      }
      if (!args.method || !CONTACT_METHOD_VALUES.includes(args.method as ContactMethod)) {
        return { ok: false as const, reason: 'invalid_request' as const, message: 'Choose how the patient was contacted.' };
      }
    }

    if (action === 'reschedule_referral' && (!args.date || !args.time)) {
      return {
        ok: false as const,
        reason: 'invalid_request' as const,
        message: 'A new appointment date and time are required to reschedule.',
      };
    }

    if (action === 'close' || action === 'close_missed') {
      // ONE closure rule for both paths, shared with the collection-path merge
      // (convex/authz.ts) and with the UI: the outcome, the note and the
      // follow-up gate are validated in src/lib/referral-closure.ts.
      const followUps =
        action === 'close' ? await readItems(ctx, 'followups') : [];
      const storedFollowUp = followUps.find(
        f => isRecord(f) && str(f.referralId) === args.referralId,
      );
      const closure = validateReferralClosure(
        {
          outcome: args.outcome,
          notes: args.notes,
          otherHospitalName: args.otherHospitalName,
          followUpResolved: args.followUpResolved,
        },
        {
          from: status,
          now: nowDate,
          followUpDate: str(referral.followUpDate),
          followUpTime: str(referral.followUpTime),
          followUpStatus: isRecord(storedFollowUp) ? str(storedFollowUp.status) : undefined,
          attendedElsewhereHospital: str(referral.attendedElsewhereHospital),
        },
      );
      if (!closure.ok) {
        return { ok: false as const, reason: 'invalid_request' as const, message: closure.message };
      }
      validatedClosure = closure;
    }

    if (action === 'record_attendance_elsewhere') {
      if (!args.otherHospitalName?.trim()) {
        return { ok: false as const, reason: 'invalid_request' as const, message: 'Name the hospital the patient attended.' };
      }
      if (!args.attendedDate?.trim()) {
        return { ok: false as const, reason: 'invalid_request' as const, message: 'The date the patient attended is required.' };
      }
      // Same closure rule as the other paths: the outcome is fixed (the patient
      // attended elsewhere, so the visit was not missed) and the note is the
      // documented attendance. Validated rather than assumed.
      const closure = validateReferralClosure(
        {
          outcome: 'attended_another_hospital',
          notes: args.notes ?? `Attendance verified at ${args.otherHospitalName.trim()} on ${args.attendedDate.trim()}.`,
          otherHospitalName: args.otherHospitalName,
        },
        { from: status, now: nowDate, attendedElsewhereHospital: str(referral.attendedElsewhereHospital) },
      );
      if (!closure.ok) {
        return { ok: false as const, reason: 'invalid_request' as const, message: closure.message };
      }
      validatedClosure = closure;
    }

    // ── Apply the transition to the stored record ───────────────────
    const updated: Record_ = {
      ...referral,
      status: targetStatus,
      currentStep: referralStepOf(targetStatus),
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
        updated.closureNotes = validatedClosure?.notes ?? args.notes;
        // Every closure carries a documented outcome. Reaching this point means
        // the referral was treated AND its follow-up (when there was one) is
        // resolved, so the care itself is the completion information.
        updated.closureOutcome = validatedClosure?.outcome ?? 'treatment_completed';
        // The clinician's confirmation that the follow-up was done is itself
        // part of the record, so the offline collection path can honour the
        // same gate instead of closing on a scheduled-but-unseen follow-up.
        if (args.followUpResolved === true) {
          updated.followUpResolvedAt = now;
          updated.followUpResolvedByName = actor.name;
        }
        break;
      // ── Missed-referral follow-up ──────────────────────────────────
      case 'mark_unconfirmed':
        // Uncertain attendance, NOT a missed appointment: the expected time has
        // passed and nobody has recorded anything either way.
        updated.awaitingConfirmationAt = now;
        updated.awaitingConfirmationByName = actor.name;
        updated.awaitingConfirmationByUserId = actor.id;
        updated.isOverdue = true;
        break;
      case 'confirm_missed': {
        // Non-attendance documented by a person: the referral enters the
        // follow-up queue with the administrative escalation its clinical
        // priority already implies (the priority itself is never changed here).
        const priority = str(referral.priority) as keyof typeof ESCALATION_RULES | undefined;
        const rule = ESCALATION_RULES[priority ?? 'routine'] ?? ESCALATION_RULES.routine;
        updated.missedAt = now;
        updated.missedReason = args.reason;
        updated.missedNotes = args.notes;
        updated.missedByName = actor.name;
        updated.missedByUserId = actor.id;
        updated.missedByRole = actor.role;
        updated.escalationLevel = rule.level;
        updated.followupDueAt = new Date(nowDate.getTime() + rule.contactWithinHours * 36e5).toISOString();
        updated.isOverdue = true;
        break;
      }
      case 'log_contact_attempt':
        // An attempt that did not reach the patient. It is recorded for the
        // follow-up audit trail and does NOT mark the patient as contacted.
        updated.lastContactAt = contactAt;
        updated.lastContactMethod = args.method;
        updated.lastContactReached = false;
        updated.lastContactByName = actor.name;
        updated.contactAttemptCount = (Number(referral.contactAttemptCount) || 0) + 1;
        if (args.actionTaken) updated.actionTaken = args.actionTaken;
        if (args.nextFollowUpDate) updated.nextFollowUpDate = args.nextFollowUpDate;
        if (args.reason) updated.missedReason = args.reason;
        if (args.notes) updated.missedNotes = args.notes;
        break;
      case 'record_contact':
        updated.lastContactAt = contactAt;
        updated.lastContactMethod = args.method;
        updated.lastContactReached = true;
        updated.lastContactByName = actor.name;
        updated.contactedAt = contactAt;
        updated.contactedByName = actor.name;
        updated.contactedByUserId = actor.id;
        updated.contactAttemptCount = (Number(referral.contactAttemptCount) || 0) + 1;
        if (args.actionTaken) updated.actionTaken = args.actionTaken;
        if (args.nextFollowUpDate) updated.nextFollowUpDate = args.nextFollowUpDate;
        break;
      case 'reschedule_referral':
        updated.appointmentDate = args.date;
        updated.appointmentTime = args.time;
        updated.rescheduledAt = now;
        updated.rescheduledByName = actor.name;
        updated.rescheduledByUserId = actor.id;
        updated.rescheduleCount = (Number(referral.rescheduleCount) || 0) + 1;
        updated.isOverdue = false;
        if (args.nextFollowUpDate) updated.nextFollowUpDate = args.nextFollowUpDate;
        if (args.notes) updated.rescheduleNotes = args.notes;
        break;
      case 'close_missed':
        updated.closedAt = now;
        updated.closedByUserId = actor.id ?? actor.name;
        updated.closedByName = actor.name;
        updated.closureOutcome = validatedClosure?.outcome ?? args.outcome;
        updated.closureNotes = validatedClosure?.notes ?? args.notes;
        updated.isOverdue = false;
        if (updated.closureOutcome === 'attended_another_hospital') {
          updated.attendedElsewhereHospital = args.otherHospitalName;
        }
        break;
      case 'record_attendance_elsewhere':
        // Verified attendance at another hospital: the visit was not missed, so
        // the referral is closed with that outcome rather than left unresolved.
        updated.closedAt = now;
        updated.closedByUserId = actor.id ?? actor.name;
        updated.closedByName = actor.name;
        updated.closureOutcome = validatedClosure?.outcome ?? 'attended_another_hospital';
        updated.closureNotes = validatedClosure?.notes
          ?? `Attendance verified at ${args.otherHospitalName} on ${args.attendedDate}.`;
        updated.attendedElsewhereHospital = args.otherHospitalName;
        updated.attendedElsewhereDate = args.attendedDate;
        updated.isOverdue = false;
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

    /** Structured detail the follow-up screens read back from the audit trail. */
    const metadata =
      action === 'assign_doctor'
        ? { doctorId, doctorName }
        : action === 'confirm_missed'
          ? { reason: args.reason, escalationLevel: updated.escalationLevel as string | undefined }
          : action === 'record_contact' || action === 'log_contact_attempt'
            ? {
                method: args.method,
                reached: args.reached === true,
                actionTaken: args.actionTaken,
                nextFollowUpDate: args.nextFollowUpDate,
                reason: args.reason,
                contactAt,
              }
            : action === 'reschedule_referral'
              ? { date: args.date, time: args.time }
              : action === 'close_missed'
                ? { outcome: args.outcome }
                : action === 'record_attendance_elsewhere'
                  ? { outcome: 'attended_another_hospital' as const }
                  : undefined;

    for (const kind of spec.events) {
      const id = eventId(args.referralId, kind.type, args.idempotencyKey);
      if (existingIds.has(id)) continue; // replay of an already-applied write
      existingIds.add(id);
      appended.push({
        id,
        referralId: args.referralId,
        status: targetStatus,
        eventType: kind.type,
        canonicalStatus: kind.canonical,
        previousStatus: status,
        newStatus: targetStatus,
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
        metadata,
      });
    }

    // ── Notification attempt (in-app record only) ────────────────────
    // Recorded in the same append-only audit trail, with a DETERMINISTIC id per
    // referral + appointment cycle, so a repeated write (or a second device)
    // can never produce a second notice for the same missed visit. The only
    // channel that exists here is this in-app record: AarogyaLink does not send
    // SMS, WhatsApp or push messages.
    if (NOTIFYING_ACTIONS.has(action)) {
      const cycle = appointmentCycleKey({
        appointmentDate: str(referral.appointmentDate),
        appointmentTime: str(referral.appointmentTime),
      });
      const dedupeKey = `${cycle}:${action}`;
      const id = notificationEventId(args.referralId, cycle, action);
      if (!existingIds.has(id)) {
        existingIds.add(id);
        appended.push({
          id,
          referralId: args.referralId,
          status: targetStatus,
          eventType: 'notification_attempt',
          canonicalStatus: 'NOTIFICATION',
          previousStatus: status,
          newStatus: targetStatus,
          description: 'Follow-up notice recorded for the health team (in-app record).',
          performedBy: actor.name,
          performedByUserId: actor.id,
          performedByRole: actor.role,
          performedByFacilityId: actor.hospitalId,
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          hospitalId: actor.hospitalId,
          timestamp: now,
          metadata: { channel: 'in_app', deliveryStatus: 'recorded', dedupeKey },
        });
      }
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
      message: eventOnly
        ? `Contact attempt recorded — the referral stays ${referralStatusLabel(targetStatus).toLowerCase()}.`
        : action === 'cancel' || action === 'reject'
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
    // A late arrival is still an arrival: a referral that was flagged as
    // uncertain (or re-scheduled) can be verified by the receiving hospital just
    // like a scheduled one.
    if (!actionFroms('verify_arrival').includes(status as ReferralStatusValue)) {
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
