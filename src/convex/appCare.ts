// ============================================================================
// AarogyaLink — Health Card access & walk-in care (server-authoritative)
// ----------------------------------------------------------------------------
// A patient does not need an appointment for a doctor to open their record.
// There are two entry paths, and both end in the same longitudinal record:
//
//   APPOINTMENT : appointment → patient → consultation
//   HEALTH CARD : scanned Health Card → verified backend authorization →
//                 patient record → consultation
//
// The QR carries only the Health Card reference (see the client-side
// payload helper) — no diagnosis, prescription or vitals — and the backend:
//
//   • authenticates the caller and takes the doctor, role and hospital from the
//     STORED session binding;
//   • resolves the scanned reference against the STORED patient register;
//   • answers with the patient's record only when the caller is authorized;
//   • records the authorization it used. A patient arriving without any prior
//     link is a WALK-IN: a care-access grant is stored (so later file lookups
//     stay authorized) and the consultation is recorded as WALK_IN — no fake
//     appointment and no fake referral is ever created.
// ============================================================================

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { payloadFits } from './authz';
import { isTerminalStatus, referralStatusLabel, type ReferralStatusValue } from './referralStatus';
import {
  authorizedPatientsFor,
  encounterRecordFor,
  healthCardReferenceFromScan,
  isCareStaff,
  isRecord,
  readItems,
  requireBinding,
  str,
  writeItems,
  type CareBinding,
  type Ctx,
} from './careAuthz';

/** Which link already authorized this hospital for the patient, if any. */
async function authorizationSource(
  ctx: Ctx,
  binding: CareBinding,
  patientId: string,
  owner?: string,
  grantedPatientIds?: Set<string>,
): Promise<'registration' | 'referral' | 'appointment' | 'health_card' | null> {
  const hospitalId = binding.hospitalId ?? '';
  if (owner === hospitalId) return 'registration';
  // Unattributed (seeded/legacy) records are shared reference data in this
  // platform, exactly as the collection read scoping treats them.
  if (!owner) return 'registration';

  const [referrals, appointments] = await Promise.all([
    readItems(ctx, 'referrals'),
    readItems(ctx, 'appointments'),
  ]);
  const referred = referrals.some(
    r =>
      isRecord(r) &&
      str(r.patientId) === patientId &&
      (str(r.sourceFacilityId) === hospitalId || str(r.destinationFacilityId) === hospitalId),
  );
  if (referred) return 'referral';
  const booked = appointments.some(
    a => isRecord(a) && str(a.patientId) === patientId && str(a.facilityId) === hospitalId,
  );
  if (booked) return 'appointment';
  if (grantedPatientIds?.has(patientId)) return 'health_card';
  return null;
}

async function hospitalNameOf(ctx: Ctx, hospitalId?: string): Promise<string | undefined> {
  if (!hospitalId) return undefined;
  const hospitals = await readItems(ctx, 'hospitals');
  const match = hospitals.find(h => isRecord(h) && str(h.id) === hospitalId);
  return isRecord(match) ? str(match.name) : undefined;
}

/** Card fields the care team may see. Never the full stored patient document. */
function patientCard(patient: Record<string, unknown>) {
  return {
    id: str(patient.id),
    name: str(patient.name) ?? 'Patient',
    healthCardId: str(patient.healthCardId) ?? '',
    age: typeof patient.age === 'number' ? patient.age : undefined,
    gender: str(patient.gender),
    bloodGroup: str(patient.bloodGroup),
    phone: str(patient.phone),
    emergencyContact: str(patient.emergencyContact),
    village: str(patient.village),
    district: str(patient.district),
    allergies: patient.allergies,
    chronicConditions: patient.chronicConditions,
    registeredByFacilityId: str(patient.registeredByFacilityId),
  };
}

/** The referral a scanned patient is currently inside, if any. */
function activeReferralOf(referrals: unknown[]) {
  const active = referrals.filter(r => isRecord(r) && !isTerminalStatus(str(r.status)));
  const first = active[0];
  if (!isRecord(first)) return null;
  const status = str(first.status) as ReferralStatusValue | undefined;
  return {
    id: str(first.id),
    referralId: str(first.referralId),
    sourceFacilityName: str(first.sourceFacilityName),
    destinationFacilityName: str(first.destinationFacilityName),
    department: str(first.department),
    priority: str(first.priority),
    status: status ?? '',
    statusLabel: status ? referralStatusLabel(status) : '',
    currentStep: typeof first.currentStep === 'number' ? first.currentStep : undefined,
    totalSteps: typeof first.totalSteps === 'number' ? first.totalSteps : undefined,
    appointmentDate: str(first.appointmentDate),
    appointmentTime: str(first.appointmentTime),
  };
}

/** The record payload both the scan and the re-open path return. */
async function recordPayload(ctx: Ctx, patient: Record<string, unknown>, patientId: string) {
  const record = await encounterRecordFor(ctx, patientId);
  return {
    patient: patientCard(patient),
    ...record,
    activeReferral: activeReferralOf(record.referrals),
  };
}

/**
 * Resolve a scanned (or typed) Health Card reference.
 *
 * Only hospital care staff may scan, and the answer is scoped to that one
 * patient — there is no way to enumerate patients through this call.
 */
export const authorizeHealthCardScan = mutation({
  args: { scanned: v.string() },
  handler: async (ctx, { scanned }) => {
    const binding = await requireBinding(ctx);
    if (!isCareStaff(binding)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'Unauthorized: only doctors and hospital staff can scan a Health Card.',
      };
    }
    const hospitalId = binding.hospitalId;
    if (!hospitalId) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'Unauthorized: your account is not linked to a hospital.',
      };
    }

    const reference = healthCardReferenceFromScan(scanned);
    if (!reference) {
      return { ok: false as const, reason: 'invalid_qr' as const, message: 'Invalid AarogyaLink Health Card.' };
    }

    const patients = await readItems(ctx, 'patients');
    const needle = reference.toUpperCase();
    const patient = patients.find(p => isRecord(p) && (str(p.healthCardId) ?? '').toUpperCase() === needle);
    if (!isRecord(patient)) {
      return {
        ok: false as const,
        reason: 'not_found' as const,
        message: 'Health Card not found. Check the card number, or ask the health worker to register the patient.',
      };
    }

    const patientId = str(patient.id) ?? '';
    const owner = str(patient.registeredByFacilityId);
    const grantRows = await ctx.db
      .query('careAccessGrants')
      .withIndex('by_hospital', q => q.eq('hospitalId', hospitalId))
      .collect();
    const grantedPatientIds = new Set(grantRows.map(row => row.patientId));

    const existingGrant = grantRows.find(row => row.patientId === patientId);
    const source = await authorizationSource(ctx, binding, patientId, owner, grantedPatientIds);

    let authorizationSourceValue = source;
    if (!source) {
      // Walk-in: the card itself is the authorization. Record it (server-side,
      // from the stored binding) so the access is audited and so the report-file
      // lookup stays authorized later. No appointment and no referral is created.
      const now = Date.now();
      if (existingGrant) {
        await ctx.db.patch(existingGrant._id, {
          lastUsedAt: now,
          useCount: existingGrant.useCount + 1,
          doctorStaffUserId: binding.staffUserId,
          doctorName: binding.name ?? binding.username,
        });
      } else {
        await ctx.db.insert('careAccessGrants', {
          patientId,
          hospitalId,
          healthCardId: str(patient.healthCardId),
          source: 'health_card_scan',
          doctorStaffUserId: binding.staffUserId,
          doctorName: binding.name ?? binding.username,
          createdAt: now,
          lastUsedAt: now,
          useCount: 1,
        });
      }
      authorizationSourceValue = 'health_card';
    } else if (existingGrant) {
      await ctx.db.patch(existingGrant._id, {
        lastUsedAt: Date.now(),
        useCount: existingGrant.useCount + 1,
      });
    }

    const payload = await recordPayload(ctx, patient, patientId);
    return {
      ok: true as const,
      authorization: {
        source: authorizationSourceValue,
        walkIn: authorizationSourceValue === 'health_card',
        hospitalId,
        hospitalName: await hospitalNameOf(ctx, hospitalId),
        verifiedAt: new Date().toISOString(),
      },
      ...payload,
      message: authorizationSourceValue === 'health_card'
        ? 'Health Card verified. Walk-in patient — no appointment on record.'
        : 'Health Card verified. Patient record opened.',
    };
  },
});

/**
 * Re-open a patient record the caller is already authorized for (e.g. after a
 * walk-in consultation was recorded, or on a page reload after a scan).
 */
export const getCarePatientRecord = query({
  args: { patientId: v.string() },
  handler: async (ctx, { patientId }) => {
    const binding = await requireBinding(ctx);
    if (!isCareStaff(binding)) {
      return { ok: false as const, reason: 'forbidden' as const, message: 'Unauthorized: only hospital staff can open a patient record.' };
    }
    const authorized = await authorizedPatientsFor(ctx, binding);
    if (!authorized.has(patientId)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'You are not authorized to access this patient record.',
      };
    }
    const patients = await readItems(ctx, 'patients');
    const patient = patients.find(p => isRecord(p) && str(p.id) === patientId);
    if (!isRecord(patient)) {
      return { ok: false as const, reason: 'not_found' as const, message: 'Health Card not found.' };
    }
    const payload = await recordPayload(ctx, patient, patientId);
    return { ok: true as const, authorization: { source: 'existing', walkIn: false, hospitalId: binding.hospitalId ?? '', hospitalName: await hospitalNameOf(ctx, binding.hospitalId) }, ...payload };
  },
});

/**
 * Record a WALK_IN consultation.
 *
 * `consultationType: 'WALK_IN'` and the missing `appointmentId` are the whole
 * point: the visit is part of the patient's care history without inventing an
 * appointment the patient never had. Doctor, hospital and time come from the
 * stored binding/clock, not the request.
 */
export const startWalkInConsultation = mutation({
  args: {
    patientId: v.string(),
    symptoms: v.optional(v.array(v.string())),
    diagnosis: v.string(),
    prescription: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    followupRequired: v.optional(v.boolean()),
    followupDate: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);
    if (binding.role !== 'doctor') {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'Unauthorized: a consultation is started by the doctor who conducted it.',
      };
    }
    if (!binding.hospitalId) {
      return { ok: false as const, reason: 'forbidden' as const, message: 'Unauthorized: your account is not linked to a hospital.' };
    }
    const diagnosis = args.diagnosis.trim();
    if (!diagnosis) {
      return { ok: false as const, reason: 'invalid_request' as const, message: 'Enter the diagnosis or consultation summary.' };
    }

    const authorized = await authorizedPatientsFor(ctx, binding);
    if (!authorized.has(args.patientId)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'You are not authorized to access this patient record.',
      };
    }

    const consultations = await readItems(ctx, 'consultations');
    const id = args.idempotencyKey
      ? `cons-${args.patientId}-${args.idempotencyKey}`
      : `cons-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const existing = consultations.find(c => isRecord(c) && str(c.id) === id);
    if (isRecord(existing)) {
      return { ok: true as const, duplicate: true as const, consultation: existing, message: 'This consultation was already recorded.' };
    }

    const now = new Date();
    const record = {
      id,
      appointmentId: '', // a walk-in has no appointment — never fabricate one
      consultationType: 'WALK_IN',
      patientId: args.patientId,
      doctorId: binding.staffUserId ?? '',
      doctorName: binding.name || binding.username || 'Doctor',
      facilityId: binding.hospitalId,
      facilityName: await hospitalNameOf(ctx, binding.hospitalId),
      symptoms: args.symptoms ?? [],
      diagnosis,
      prescription: args.prescription ?? [],
      notes: args.notes?.trim() || 'Walk-in consultation (Health Card verified at the hospital).',
      followupRequired: args.followupRequired ?? false,
      followupDate: args.followupDate,
      consultationDate: now.toISOString().split('T')[0],
      consultationTime: now.toTimeString().slice(0, 5),
      createdAt: now.toISOString(),
    };

    const next = [...consultations, record];
    if (!payloadFits('1', next)) {
      return {
        ok: false as const,
        reason: 'payload_too_large' as const,
        message: 'The consultation store is too large to update — contact the platform administrator.',
      };
    }
    await writeItems(ctx, 'consultations', next);

    return {
      ok: true as const,
      duplicate: false as const,
      consultation: record,
      message: `Walk-in consultation recorded for the patient.`,
    };
  },
});
