// ============================================================================
// AarogyaLink — Patient register: lookup + demographpic edit rules
// ----------------------------------------------------------------------------
// ONE place decides what may be searched, what may be edited and what the audit
// trail records. The Convex mutation (src/convex/appPatient.ts) and the offline
// path in the app both call these pure functions, so a health worker editing a
// patient recorded by a colleague gets exactly the same validated result
// whether the save reaches the server immediately or is queued on the device.
//
// Three rules are deliberate:
//
//   • Patient ID and Health Card ID are IDENTITY. They are never part of a
//     patch, so no edit — crafted or otherwise — can change or reassign them.
//   • An edit only ever touches demographic/contact fields. Clinical data
//     (vitals, prescriptions, reports, referrals, appointments) lives in its own
//     collections and is not part of this record, so it cannot be overwritten
//     by a demographic correction.
//   • Every accepted edit appends an audit entry (who, when, which fields,
//     previous and new values, reason) and bumps `recordVersion`, which is what
//     makes a second, stale edit REFUSED instead of silently overwriting.
// ============================================================================

// Relative import on purpose: this module is bundled into the Convex functions
// (src/convex/appPatient.ts), which do not use the `@/` alias.
import type { Patient, PatientEditActor, PatientEditChange, PatientEditEntry } from '../types';

/** Demographic/contact fields an authorized health worker may correct. */
export const PATIENT_EDITABLE_FIELDS = [
  'name',
  'age',
  'gender',
  'phone',
  'address',
  'village',
  'district',
  'state',
  'bloodGroup',
  'aadhaarLast4',
  'emergencyContact',
  'allergies',
  'chronicConditions',
] as const;

export type PatientEditableField = (typeof PATIENT_EDITABLE_FIELDS)[number];

/**
 * Identity and provenance fields. They are rejected if they ever appear in a
 * patch, which is what keeps the Patient ID and the Health Card ID immutable and
 * keeps the ORIGINAL registering worker attached to the record for good.
 */
export const PATIENT_IMMUTABLE_FIELDS = [
  'id',
  'userId',
  'healthCardId',
  'registeredByEmail',
  'registeredAt',
  'createdAt',
  'registeredByFacilityId',
  'registeredByUserId',
  'registeredByName',
  'registeredByRole',
] as const;

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const PATIENT_GENDERS = ['male', 'female', 'other'] as const;

/** Audit entries kept on a patient record (newest last). */
export const MAX_PATIENT_EDIT_HISTORY = 50;

/** Values a caller may propose for the editable fields. */
export interface PatientDraft {
  name?: string;
  /** Age in years — the model stores an age, not a date of birth. */
  age?: number | string;
  gender?: string;
  phone?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  bloodGroup?: string;
  aadhaarLast4?: string;
  emergencyContact?: string;
  allergies?: string[];
  chronicConditions?: string[];
}

/** Why a proposed edit was refused. `code` is what the UI translates. */
export interface PatientFieldError {
  /**
   * The field the caller should look at. `form` and `version` are not fields:
   * they report a whole-record problem (nothing changed / somebody else's
   * newer edit).
   */
  field: PatientEditableField | 'form' | 'version' | 'immutable';
  code: PatientEditErrorCode;
  message: string;
}

export type PatientEditErrorCode =
  | 'required'
  | 'too_long'
  | 'invalid_age'
  | 'invalid_gender'
  | 'invalid_phone'
  | 'invalid_blood_group'
  | 'invalid_aadhaar'
  | 'invalid_item'
  | 'too_many_items'
  | 'not_editable'
  | 'no_changes'
  | 'stale'
  | 'invalid_code';

// ── Lookup ────────────────────────────────────────────────────────

/**
 * The typed reference, upper-cased and without spaces, so `p1`, `P1` and
 * ` P1 ` are the same lookup.
 */
export function normalizePatientCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/**
 * A syntactically usable Patient ID / Health Card ID. Real ids look like `P12`
 * and `HC-2026-0001`, so at least one digit and only id characters are expected.
 * This is a FORM check only — it says nothing about whether the patient exists
 * or whether the caller may see them (the backend decides that).
 */
export function isPlausiblePatientCode(input: string): boolean {
  const code = normalizePatientCode(input);
  if (code.length === 0 || code.length > 32) return false;
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return false;
  return /\d/.test(code);
}

/** Does this record answer to the given Patient ID or Health Card ID? */
export function patientMatchesCode(
  patient: Pick<Patient, 'id' | 'healthCardId'>,
  code: string,
): boolean {
  const wanted = normalizePatientCode(code);
  if (!wanted) return false;
  return (
    normalizePatientCode(patient.id) === wanted ||
    normalizePatientCode(patient.healthCardId ?? '') === wanted
  );
}

/** The single record a code refers to, or undefined (never creates anything). */
export function findPatientByCode<T extends Pick<Patient, 'id' | 'healthCardId'>>(
  patients: T[],
  code: string,
): T | undefined {
  return patients.find(patient => patientMatchesCode(patient, code));
}

// ── Version (optimistic concurrency) ──────────────────────────────

/** Edit counter of a record. Records created before versioning read as 0. */
export function patientEditVersionOf(patient: Pick<Patient, 'recordVersion'>): number {
  return typeof patient.recordVersion === 'number' && Number.isFinite(patient.recordVersion)
    ? patient.recordVersion
    : 0;
}

// ── Validation ────────────────────────────────────────────────────

const trim = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Digits in a phone number, ignoring formatting characters. */
function phoneDigits(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function normalizeStringList(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const cleaned = trim(item);
    if (!cleaned || cleaned.toLowerCase() === 'none') continue;
    if (!out.some(existing => existing.toLowerCase() === cleaned.toLowerCase())) out.push(cleaned);
  }
  return out;
}

/** Join a repeatable field for the audit trail. */
function listText(value: string[] | undefined): string {
  return (value ?? []).join(', ');
}

function hasDraftKey(draft: PatientDraft, key: keyof PatientDraft): boolean {
  return Object.prototype.hasOwnProperty.call(draft, key) && draft[key] !== undefined;
}

/**
 * The patch shape the backend mutation accepts: the same fields, with `age`
 * already narrowed to a number. Callers validate with `validatePatientDraft`
 * first, so an unparsable age is reported as a field error rather than dropped.
 */
export interface PatientServerDraft {
  name?: string;
  age?: number;
  gender?: string;
  phone?: string;
  address?: string;
  village?: string;
  district?: string;
  state?: string;
  bloodGroup?: string;
  aadhaarLast4?: string;
  emergencyContact?: string;
  allergies?: string[];
  chronicConditions?: string[];
}

export function serverDraftOf(draft: PatientDraft): PatientServerDraft {
  const out: PatientServerDraft = {};
  if (hasDraftKey(draft, 'name')) out.name = String(draft.name);
  if (hasDraftKey(draft, 'age')) {
    const age = typeof draft.age === 'number' ? draft.age : Number(String(draft.age).trim());
    if (Number.isFinite(age)) out.age = Math.trunc(age);
  }
  if (hasDraftKey(draft, 'gender')) out.gender = String(draft.gender);
  if (hasDraftKey(draft, 'phone')) out.phone = String(draft.phone);
  if (hasDraftKey(draft, 'address')) out.address = String(draft.address);
  if (hasDraftKey(draft, 'village')) out.village = String(draft.village);
  if (hasDraftKey(draft, 'district')) out.district = String(draft.district);
  if (hasDraftKey(draft, 'state')) out.state = String(draft.state);
  if (hasDraftKey(draft, 'bloodGroup')) out.bloodGroup = String(draft.bloodGroup);
  if (hasDraftKey(draft, 'aadhaarLast4')) out.aadhaarLast4 = String(draft.aadhaarLast4);
  if (hasDraftKey(draft, 'emergencyContact')) out.emergencyContact = String(draft.emergencyContact);
  if (hasDraftKey(draft, 'allergies')) out.allergies = (draft.allergies ?? []).map(String);
  if (hasDraftKey(draft, 'chronicConditions')) out.chronicConditions = (draft.chronicConditions ?? []).map(String);
  return out;
}

/**
 * Validate a proposed patch against the CURRENT record. Returns every problem
 * (not just the first) so the form can show them together.
 *
 * Only provided keys are validated: an omitted field is left untouched.
 */
export function validatePatientDraft(patient: Patient, draft: PatientDraft): PatientFieldError[] {
  const errors: PatientFieldError[] = [];

  // Immutability first: a patch may only carry editable fields.
  const editable = new Set<string>(PATIENT_EDITABLE_FIELDS);
  for (const key of Object.keys(draft)) {
    if (editable.has(key)) continue;
    errors.push({
      field: 'immutable',
      code: 'not_editable',
      message: `${key} cannot be changed here: a Patient ID, Health Card ID and the original registration details are permanent.`,
    });
  }

  const has = (key: keyof PatientDraft) => Object.prototype.hasOwnProperty.call(draft, key) && draft[key] !== undefined;

  if (has('name')) {
    const name = trim(String(draft.name ?? ''));
    if (!name) {
      errors.push({ field: 'name', code: 'required', message: 'A patient name is required.' });
    } else if (name.length > 80) {
      errors.push({ field: 'name', code: 'too_long', message: 'The patient name is too long.' });
    } else if (!/[\p{L}]/u.test(name)) {
      errors.push({ field: 'name', code: 'invalid_item', message: 'Enter the patient’s name.' });
    }
  }

  if (has('age')) {
    const age = typeof draft.age === 'number' ? draft.age : Number(String(draft.age ?? '').trim());
    if (!Number.isInteger(age) || age < 0 || age > 120) {
      errors.push({ field: 'age', code: 'invalid_age', message: 'Age must be a whole number between 0 and 120.' });
    }
  }

  if (has('gender')) {
    const gender = String(draft.gender ?? '').trim().toLowerCase();
    if (!(PATIENT_GENDERS as readonly string[]).includes(gender)) {
      errors.push({ field: 'gender', code: 'invalid_gender', message: 'Choose male, female or other.' });
    }
  }

  if (has('phone')) {
    const phone = String(draft.phone ?? '').trim();
    const digits = phoneDigits(phone);
    if (digits.length < 6 || digits.length > 15) {
      errors.push({ field: 'phone', code: 'invalid_phone', message: 'Enter a contactable phone number (6–15 digits).' });
    }
  }

  if (has('emergencyContact')) {
    const contact = String(draft.emergencyContact ?? '').trim();
    // An emergency contact may be cleared, but a recorded one must be usable.
    if (contact) {
      const digits = phoneDigits(contact);
      if (digits.length < 6 || digits.length > 15) {
        errors.push({
          field: 'emergencyContact',
          code: 'invalid_phone',
          message: 'Enter a contactable emergency number (6–15 digits), or leave it blank.',
        });
      }
    }
  }

  if (has('village') && !trim(String(draft.village ?? ''))) {
    errors.push({ field: 'village', code: 'required', message: 'A village is required.' });
  }
  if (has('district') && !trim(String(draft.district ?? ''))) {
    errors.push({ field: 'district', code: 'required', message: 'A district is required.' });
  }
  if (has('state') && !trim(String(draft.state ?? ''))) {
    errors.push({ field: 'state', code: 'required', message: 'A state is required.' });
  }
  if (has('address') && trim(String(draft.address ?? '')).length > 200) {
    errors.push({ field: 'address', code: 'too_long', message: 'The address is too long.' });
  }

  if (has('bloodGroup')) {
    const bloodGroup = String(draft.bloodGroup ?? '').trim().toUpperCase();
    if (bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(bloodGroup)) {
      errors.push({ field: 'bloodGroup', code: 'invalid_blood_group', message: 'Choose a valid blood group.' });
    }
  }

  if (has('aadhaarLast4')) {
    const last4 = String(draft.aadhaarLast4 ?? '').trim();
    if (last4 && !/^\d{4}$/.test(last4)) {
      errors.push({ field: 'aadhaarLast4', code: 'invalid_aadhaar', message: 'Enter the last 4 digits of Aadhaar.' });
    }
  }

  for (const field of ['allergies', 'chronicConditions'] as const) {
    if (!has(field)) continue;
    const items = normalizeStringList(draft[field]);
    if (items.length > 20) {
      errors.push({ field, code: 'too_many_items', message: 'Record at most 20 entries.' });
    }
    if (items.some(item => item.length > 60)) {
      errors.push({ field, code: 'invalid_item', message: 'Each entry must be 60 characters or fewer.' });
    }
  }

  // Nothing to save is a real answer: it stops an empty "edit" from creating a
  // version bump and an audit entry that says nothing changed.
  if (errors.length === 0 && Object.keys(draft).length > 0) {
    const normalized = normalizedPatientValues(patient, draft);
    if (changedPatientValues(patient, normalized).length === 0) {
      errors.push({ field: 'form', code: 'no_changes', message: 'No changes to save.' });
    }
  }

  return errors;
}

/** The stored value of an editable field, as text (for diffs and audit). */
function storedText(patient: Patient, field: PatientEditableField): string {
  const value = patient[field];
  if (Array.isArray(value)) return listText(value);
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value : '';
}

/** Normalize the provided patch values, keeping only the fields present. */
function normalizedPatientValues(
  patient: Patient,
  draft: PatientDraft,
): Partial<Record<PatientEditableField, string | number | string[] | undefined>> {
  const out: Partial<Record<PatientEditableField, string | number | string[] | undefined>> = {};
  const has = (key: keyof PatientDraft) => Object.prototype.hasOwnProperty.call(draft, key) && draft[key] !== undefined;

  if (has('name')) out.name = trim(String(draft.name));
  if (has('age')) out.age = typeof draft.age === 'number' ? draft.age : Number(String(draft.age).trim());
  if (has('gender')) out.gender = String(draft.gender).trim().toLowerCase();
  if (has('phone')) out.phone = String(draft.phone).trim();
  if (has('address')) out.address = trim(String(draft.address));
  if (has('village')) out.village = trim(String(draft.village));
  if (has('district')) out.district = trim(String(draft.district));
  if (has('state')) out.state = trim(String(draft.state));
  if (has('bloodGroup')) {
    const bloodGroup = String(draft.bloodGroup).trim().toUpperCase();
    out.bloodGroup = bloodGroup || undefined;
  }
  if (has('aadhaarLast4')) {
    const last4 = String(draft.aadhaarLast4).trim();
    out.aadhaarLast4 = last4 || undefined;
  }
  if (has('emergencyContact')) {
    const contact = String(draft.emergencyContact).trim();
    out.emergencyContact = contact || undefined;
  }
  if (has('allergies')) out.allergies = normalizeStringList(draft.allergies);
  if (has('chronicConditions')) out.chronicConditions = normalizeStringList(draft.chronicConditions);

  void patient;
  return out;
}

/** The fields whose value actually differs, with before/after as text. */
export function changedPatientValues(
  patient: Patient,
  values: Partial<Record<PatientEditableField, unknown>>,
): PatientEditChange[] {
  const changes: PatientEditChange[] = [];
  for (const field of PATIENT_EDITABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) continue;
    const next = values[field];
    const before = storedText(patient, field);
    const after = Array.isArray(next) ? listText(next) : next === undefined || next === null ? '' : String(next);
    if (before !== after) changes.push({ field, from: before, to: after });
  }
  return changes;
}

/** Changes between the current record and a patch, without applying it. */
export function diffPatientDraft(patient: Patient, draft: PatientDraft): PatientEditChange[] {
  return changedPatientValues(patient, normalizedPatientValues(patient, draft));
}

// ── Applying an edit ──────────────────────────────────────────────

export interface PlanPatientEditInput {
  patient: Patient;
  draft: PatientDraft;
  actor: PatientEditActor;
  /** When given, the record's version MUST match or the edit is refused. */
  expectedVersion?: number;
  reason?: string;
  /** ISO timestamp of the edit. */
  now: string;
  /** Stable id for the audit entry (so a retry cannot record it twice). */
  entryId: string;
}

export type PatientEditPlan =
  | { ok: true; patient: Patient; entry: PatientEditEntry; changes: PatientEditChange[] }
  | { ok: false; errors: PatientFieldError[] };

/**
 * Validate and apply a demographic edit to a patient record.
 *
 * Returns the updated record (with the audit entry appended and the version
 * bumped) or the list of reasons it was refused. The ORIGINAL registration
 * attribution (`registeredBy*`) is copied through untouched: the editing health
 * worker does not become the owner of the record.
 */
export function planPatientEdit(input: PlanPatientEditInput): PatientEditPlan {
  const { patient, draft, actor, expectedVersion, now, entryId } = input;
  const errors = validatePatientDraft(patient, draft);
  if (errors.length > 0) return { ok: false, errors };

  const version = patientEditVersionOf(patient);
  if (typeof expectedVersion === 'number' && expectedVersion !== version) {
    return {
      ok: false,
      errors: [
        {
          field: 'version',
          code: 'stale',
          message: 'This record was changed by somebody else. Reload it and apply your changes again.',
        },
      ],
    };
  }

  const values = normalizedPatientValues(patient, draft);
  const changes = changedPatientValues(patient, values);
  if (changes.length === 0) {
    return {
      ok: false,
      errors: [{ field: 'form', code: 'no_changes', message: 'No changes to save.' }],
    };
  }

  const nextVersion = version + 1;
  const entry: PatientEditEntry = {
    id: entryId,
    patientId: patient.id,
    healthCardId: patient.healthCardId,
    editedAt: now,
    editedByUserId: actor.userId,
    editedByName: actor.name,
    editedByRole: actor.role,
    editedByFacilityId: actor.facilityId,
    reason: input.reason?.trim() || undefined,
    previousVersion: version,
    newVersion: nextVersion,
    changes,
  };

  const history = [...(patient.editHistory ?? []), entry].slice(-MAX_PATIENT_EDIT_HISTORY);

  const updated: Patient = {
    ...patient,
    ...(values as Partial<Patient>),
    // Identity and provenance are re-asserted from the STORED record, so even a
    // patch that somehow carried them could not rewrite history.
    id: patient.id,
    userId: patient.userId,
    healthCardId: patient.healthCardId,
    registeredByEmail: patient.registeredByEmail,
    registeredAt: patient.registeredAt,
    createdAt: patient.createdAt,
    registeredByFacilityId: patient.registeredByFacilityId,
    registeredByUserId: patient.registeredByUserId,
    registeredByName: patient.registeredByName,
    registeredByRole: patient.registeredByRole,
    recordVersion: nextVersion,
    lastEditedAt: now,
    lastEditedByUserId: actor.userId,
    lastEditedByName: actor.name,
    lastEditedByFacilityId: actor.facilityId,
    editHistory: history,
  };

  return { ok: true, patient: updated, entry, changes };
}

/** The record's audit trail, newest first. */
export function patientEditHistoryOf(patient: Patient, limit = 10): PatientEditEntry[] {
  return [...(patient.editHistory ?? [])].slice(-limit).reverse();
}

/**
 * Who registered the patient, in display form. Falls back to the registration
 * email for records created before the registering worker was captured, so the
 * original registration is still attributed to somebody.
 */
export function registeredByLabel(patient: Patient): string {
  return patient.registeredByName || patient.registeredByRole || patient.registeredByEmail || 'Unknown';
}

/** One audit line: `Name (health_worker) · 2026-10-15 09:20` style parts. */
export function patientEditActorLabel(entry: PatientEditEntry): string {
  return entry.editedByName || entry.editedByUserId || 'Unknown';
}
