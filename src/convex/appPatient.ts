// ============================================================================
// AarogyaLink — Patient register: authorized lookup + audited demographic edit
// ----------------------------------------------------------------------------
// A patient registered by Health Worker A must be findable by Health Worker B
// from their PATIENT ID, and B must be able to correct the demographic details —
// without creating a duplicate record and without gaining access to patients
// outside their own facility/district.
//
// Everything that decides access happens HERE, from STORED data only:
//
//   • the caller is authenticated and holds a session binding (careAuthz.ts);
//   • only hospital staff may look a patient up at all;
//   • the patient must be in the caller's authorized set — their own hospital's
//     register, a patient referred/booked into it, or a walk-in whose Health
//     Card was scanned there (careAuthz.authorizedPatientsFor) — so a Patient ID
//     is NOT a password and there is no unrestricted global search;
//   • an edit is validated field by field (src/lib/patient-record.ts), only ever
//     touches demographic/contact fields, carries the caller's STORED identity
//     into the audit trail, and is refused if the record moved on since it was
//     loaded (optimistic concurrency, enforced inside the mutation transaction).
// ============================================================================

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { payloadFits } from './authz';
import {
  authorizedPatientsFor,
  grantedPatientIds,
  isRecord,
  readItems,
  requireBinding,
  str,
  writeItems,
  type CareBinding,
  type Ctx,
} from './careAuthz';
import {
  findPatientByCode,
  isPlausiblePatientCode,
  normalizePatientCode,
  patientEditHistoryOf,
  planPatientEdit,
  registeredByLabel,
  type PatientDraft,
} from '../lib/patient-record';
import type { Patient } from '../types';

/** Staff who may look a patient record up by Patient ID. */
const LOOKUP_ROLES = new Set(['health_worker', 'doctor', 'hospital_admin', 'overall_admin']);

/**
 * Who may correct demographic details. Health workers maintain the village
 * register and the hospital administrator owns it; a doctor (and the platform
 * administrator) can look a record up but not rewrite it here — clinical
 * corrections follow their own authorized workflow.
 */
const EDIT_ROLES = new Set(['health_worker', 'hospital_admin']);

/** Why the caller is allowed to open this patient, for the UI to show. */
type AccessSource = 'facility_register' | 'referral' | 'appointment' | 'health_card' | 'platform';

const DRAFT_VALIDATOR = v.object({
  name: v.optional(v.string()),
  age: v.optional(v.number()),
  gender: v.optional(v.string()),
  phone: v.optional(v.string()),
  address: v.optional(v.string()),
  village: v.optional(v.string()),
  district: v.optional(v.string()),
  state: v.optional(v.string()),
  bloodGroup: v.optional(v.string()),
  aadhaarLast4: v.optional(v.string()),
  emergencyContact: v.optional(v.string()),
  allergies: v.optional(v.array(v.string())),
  chronicConditions: v.optional(v.array(v.string())),
});

function asPatient(record: unknown): Patient | null {
  return isRecord(record) && str(record.id) ? (record as unknown as Patient) : null;
}

/**
 * How this hospital is already linked to the patient. Mirrors the policy in
 * careAuthz.authorizedPatientsFor / authz.patientVisibleToHospital: the
 * hospital's own register, a referral into or out of it, an appointment booked
 * with it, or a Health Card scanned there (a walk-in).
 */
async function accessSourceFor(
  ctx: Ctx,
  binding: CareBinding,
  patient: Patient,
  authorized: Set<string>,
): Promise<AccessSource | null> {
  if (binding.role === 'overall_admin') return 'platform';
  const hospitalId = binding.hospitalId;
  if (!hospitalId || !authorized.has(patient.id)) return null;

  const owner = str(patient.registeredByFacilityId);
  if (!owner || owner === hospitalId) return 'facility_register';

  const [referrals, appointments, grants] = await Promise.all([
    readItems(ctx, 'referrals'),
    readItems(ctx, 'appointments'),
    grantedPatientIds(ctx, hospitalId),
  ]);
  const linked = (records: unknown[], field: 'referrals' | 'appointments') =>
    records.some(record => {
      if (!isRecord(record) || str(record.patientId) !== patient.id) return false;
      if (field === 'referrals') {
        return str(record.sourceFacilityId) === hospitalId || str(record.destinationFacilityId) === hospitalId;
      }
      return str(record.facilityId) === hospitalId;
    });

  if (linked(referrals, 'referrals')) return 'referral';
  if (linked(appointments, 'appointments')) return 'appointment';
  if (grants.has(patient.id)) return 'health_card';
  return null;
}

/**
 * Look up ONE patient by Patient ID or Health Card ID.
 *
 * Never creates a record, never searches beyond the caller's authorization, and
 * answers with the same message for "no such patient" and "not in your
 * authorized facility/district" so a Patient ID cannot be used to probe the
 * register from outside the caller's scope.
 */
export const findPatientRecord = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const binding = await requireBinding(ctx);

    if (!isPlausiblePatientCode(code)) {
      return {
        ok: false as const,
        reason: 'invalid_code' as const,
        message: 'Enter a valid Patient ID (for example P1) or Health Card ID (HC-2026-0001).',
      };
    }
    if (!LOOKUP_ROLES.has(binding.role)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        message: 'Unauthorized: only hospital staff can look up patient records.',
      };
    }

    const normalized = normalizePatientCode(code);
    const patients = await readItems(ctx, 'patients');
    const match = findPatientByCode(
      patients.map(record => asPatient(record)).filter((p): p is Patient => p !== null),
      normalized,
    );

    if (!match) {
      return {
        ok: false as const,
        reason: 'not_found' as const,
        message: 'No patient with that ID is available in your authorized facility or district. Searching never registers a patient.',
      };
    }

    const authorized = await authorizedPatientsFor(ctx, binding);
    const source = await accessSourceFor(ctx, binding, match, authorized);
    if (!source) {
      return {
        ok: false as const,
        reason: 'not_found' as const,
        message: 'No patient with that ID is available in your authorized facility or district. Searching never registers a patient.',
      };
    }

    return {
      ok: true as const,
      patient: match,
      accessSource: source,
      canEdit: EDIT_ROLES.has(binding.role),
      registeredBy: registeredByLabel(match),
      editHistory: patientEditHistoryOf(match, 10),
      message: `Patient record verified against the ${source === 'platform' ? 'platform register' : 'authorized register'}.`,
    };
  },
});

/**
 * Save a demographic correction on an existing patient record.
 *
 * The record is UPDATED in place — the Patient ID, Health Card ID, registration
 * history and every clinical collection (vitals, reports, prescriptions,
 * referrals, appointments) are untouched. An audit entry with the caller's
 * STORED identity, the changed fields and their previous/new values is appended,
 * and `recordVersion` is bumped so a stale save is refused rather than silently
 * overwriting a colleague's newer information.
 */
export const updatePatientDemographics = mutation({
  args: {
    patientId: v.string(),
    draft: DRAFT_VALIDATOR,
    /** Version the editor loaded. A mismatch means somebody got there first. */
    expectedVersion: v.number(),
    reason: v.optional(v.string()),
    /** Idempotency key, so a retried save cannot record two audit entries. */
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const binding = await requireBinding(ctx);

    if (!EDIT_ROLES.has(binding.role)) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        errors: [],
        message: 'Unauthorized: your role cannot change patient registration details.',
      };
    }

    const patients = await readItems(ctx, 'patients');
    const stored = patients.find(record => asPatient(record)?.id === args.patientId);
    const patient = asPatient(stored);
    if (!patient) {
      return { ok: false as const, reason: 'not_found' as const, errors: [], message: 'Patient not found.' };
    }

    const authorized = await authorizedPatientsFor(ctx, binding);
    const source = await accessSourceFor(ctx, binding, patient, authorized);
    if (!source) {
      return {
        ok: false as const,
        reason: 'forbidden' as const,
        errors: [],
        message: 'Unauthorized: this patient is not in your facility’s care record.',
      };
    }

    const entryId = args.idempotencyKey ? `pe-${patient.id}-${args.idempotencyKey}` : `pe-${patient.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // A retried save returns the result of the edit it already recorded.
    const alreadyRecorded = (patient.editHistory ?? []).find(entry => entry.id === entryId);
    if (alreadyRecorded) {
      return {
        ok: true as const,
        duplicate: true as const,
        patient,
        entry: alreadyRecorded,
        canEdit: true,
        message: 'This edit was already saved.',
      };
    }

    const plan = planPatientEdit({
      patient,
      draft: args.draft as PatientDraft,
      actor: {
        userId: binding.staffUserId,
        name: binding.name || binding.username || 'AarogyaLink staff',
        role: binding.role,
        facilityId: binding.hospitalId,
      },
      expectedVersion: args.expectedVersion,
      reason: args.reason,
      now: new Date().toISOString(),
      entryId,
    });

    if (!plan.ok) {
      const stale = plan.errors.some(error => error.code === 'stale');
      return {
        ok: false as const,
        reason: stale ? ('stale' as const) : ('invalid_request' as const),
        errors: plan.errors,
        // The current stored record accompanies a stale refusal so the UI can
        // show what changed instead of leaving the user guessing.
        patient,
        message: stale
          ? 'This record was changed by somebody else. Reload it and apply your changes again.'
          : plan.errors[0]?.message ?? 'The changes could not be saved.',
      };
    }

    const next = patients.map(record => (asPatient(record)?.id === patient.id ? plan.patient : record));
    if (!payloadFits('1', next)) {
      return {
        ok: false as const,
        reason: 'payload_too_large' as const,
        errors: [],
        message: 'The patient register is too large to update — contact the platform administrator.',
      };
    }

    await writeItems(ctx, 'patients', next);
    return {
      ok: true as const,
      duplicate: false as const,
      patient: plan.patient,
      entry: plan.entry,
      changes: plan.changes,
      accessSource: source,
      canEdit: true,
      message: 'Patient details updated.',
    };
  },
});
