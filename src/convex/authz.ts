// ============================================================================
// Backend authorization policy for the shared data collections
// ----------------------------------------------------------------------------
// Every collection is stored as one JSON payload row, so authorization happens
// per RECORD inside the payload:
//
//   READ   — collections whose records carry a hospital/patient link are
//            filtered to the caller's scope before the payload is returned.
//   WRITE  — the incoming payload is merged with the stored payload so a caller
//            can only create/modify/delete records inside their own scope;
//            everything else is preserved exactly as stored.
//
// The scope is ALWAYS derived from the caller's stored session binding
// (see appSession.ts) — never from anything the client sends.
// ============================================================================

import {
  REFERRAL_STATUS,
  REFERRAL_TOTAL_STEPS,
  canTransition,
  referralStepOf,
} from './referralStatus';

export type SessionScope =
  /** Overall Administrator: the whole platform, every district. */
  | { kind: 'overall' }
  /** District Administrator: only their own district's facilities and records. */
  | { kind: 'district'; districtId: string; districtName: string; staffUserId?: string; staffName?: string }
  | { kind: 'hospital'; hospitalId: string; staffUserId?: string; staffName?: string; staffRole?: string }
  | { kind: 'patient'; patientId: string };

/**
 * The authenticated actor behind a write. Supplied by appData.ts from the
 * STORED binding so audit fields can be overwritten server-side instead of
 * trusting whatever the client put in the payload.
 */
export interface WriteActor {
  id?: string;
  name: string;
  role: string;
  hospitalId?: string;
}

/** Cloud collection key holding deletion tombstones. */
export const TOMBSTONES_KEY = 'tombstones';

/** Field carrying the owning hospital/facility id, per collection. */
const HOSPITAL_FIELDS: Record<string, string[]> = {
  hospitals: ['id'],
  staffUsers: ['facilityId'],
  doctors: ['facilityId'],
  healthWorkers: ['facilityId'],
  medicineStock: ['facilityId'],
  diagnostics: ['facilityId'],
  appointments: ['facilityId'],
  referrals: ['sourceFacilityId', 'destinationFacilityId'],
};

/** District-level analytics: only the Overall/District Administrator receives them. */
const DISTRICT_ONLY = new Set(['villageAccessScores', 'referralPredictions']);

/**
 * Credential fields a hospital record carries for ITS OWN administrator
 * account. A hospital is directory information — every role needs the list to
 * choose a referral destination or book an appointment, including hospitals in
 * another district — but another facility's administrator credentials are not
 * the caller's business, so they are stripped everywhere except the district
 * that manages the hospital.
 */
const HOSPITAL_ADMIN_FIELDS = [
  'adminName',
  'adminUsername',
  'adminEmail',
  'adminPhone',
  'adminTempPassword',
  'adminPassword',
];

/** A hospital as directory data: everything except its administrator's credentials. */
function hospitalDirectoryRecord(record: unknown): unknown {
  if (!isRecord(record)) return record;
  const out: Record<string, unknown> = { ...record };
  for (const field of HOSPITAL_ADMIN_FIELDS) delete out[field];
  return out;
}

/**
 * Administrator accounts. Only the Overall Administrator may create these — a
 * District Administrator may edit their own record but never mint one, and a
 * hospital user may not touch them at all.
 */
const DISTRICT_LEVEL_ROLES = new Set(['gov_admin', 'overall_admin']);

/**
 * Collections a patient may receive, keyed by how the owning patient id is
 * stored on each record. `patients` uses its own `id`; notifications are
 * addressed with the `u-<patientId>` user id.
 */
const PATIENT_LINKED = new Set([
  'patients',
  'vitals',
  'healthRecords',
  'consultations',
  'followups',
  'appointments',
  'referrals',
  'notifications',
]);

/**
 * Patient-linked collections that carry only a `patientId` (no hospital link),
 * so a hospital caller is scoped through the patients they may see. `patients`
 * itself is handled separately (it carries `registeredByFacilityId`).
 */
export const CLINICAL_COLLECTIONS = new Set([
  'vitals',
  'healthRecords',
  'consultations',
  'followups',
  'notifications',
]);

/**
 * Order matters: each collection is scoped using the already-filtered
 * collections it depends on — referrals/appointments decide which patients a
 * hospital may see, and the visible patients decide their clinical records.
 */
const READ_ORDER = [
  // Facilities/districts first: district scoping derives its facility set here.
  'districts',
  'hospitals',
  // Referrals & appointments decide which patients a facility may see…
  'referrals',
  'appointments',
  'patients',
  // …and the visible patients decide their clinical records.
  'followups',
  'vitals',
  'healthRecords',
  'consultations',
  'notifications',
  'staffUsers',
  'doctors',
  'healthWorkers',
  'medicineStock',
  'diagnostics',
  'referralEvents',
  'referralPredictions',
  'villageAccessScores',
];

/**
 * Collections scoped to the facilities of one district. `hospitals` and
 * `districts` are handled separately (they define the scope itself), and
 * `referrals` uses its source/destination pair.
 */
const DISTRICT_FACILITY_COLLECTIONS = new Set([
  'staffUsers',
  'doctors',
  'healthWorkers',
  'medicineStock',
  'diagnostics',
  'appointments',
]);

/** Convex caps a document value at 1 MiB; stay under it with a safety margin. */
const MAX_PAYLOAD_BYTES = 950 * 1024;

// ── Payload (envelope) helpers ────────────────────────────────────

export interface Envelope {
  v: string;
  items: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Patient id a record belongs to, for the patient-linked collections. */
function patientIdOf(key: string, record: unknown): string | undefined {
  if (!isRecord(record)) return undefined;
  if (key === 'notifications') return recordPatientLink(key, record);
  return str(record.patientId);
}

export function parseEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown };
    if (parsed && typeof parsed.v === 'string' && Array.isArray(parsed.items)) {
      return { v: parsed.v, items: parsed.items };
    }
  } catch {
    /* malformed payload */
  }
  return null;
}

export function serializeEnvelope(version: string, items: unknown[]): string {
  return JSON.stringify({ v: version, items });
}

/** Approximate serialized size of an envelope, in bytes. */
export function envelopeSizeBytes(version: string, items: unknown[]): number {
  const json = serializeEnvelope(version, items);
  return new TextEncoder().encode(json).length;
}

// ── Record identity / linking ─────────────────────────────────────

export function mergeKeyOf(item: unknown): string {
  if (isRecord(item)) {
    if (typeof item.id === 'string') return `id:${item.id}`;
    if (typeof item.villageId === 'string') return `vid:${item.villageId}`;
    if (typeof item.referralId === 'string') return `rid:${item.referralId}`;
  }
  return `j:${JSON.stringify(item)}`;
}

function recordHospitalIds(key: string, record: unknown): string[] {
  const fields = HOSPITAL_FIELDS[key];
  if (!fields || !isRecord(record)) return [];
  const ids: string[] = [];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.length > 0) ids.push(value);
  }
  return ids;
}

function recordPatientLink(key: string, record: unknown): string | undefined {
  if (!isRecord(record)) return undefined;
  if (key === 'patients') return typeof record.id === 'string' ? record.id : undefined;
  if (key === 'notifications') {
    const userId = record.userId;
    if (typeof userId === 'string' && userId.startsWith('u-')) return userId.slice(2);
    return undefined;
  }
  return typeof record.patientId === 'string' ? record.patientId : undefined;
}

/**
 * May this hospital see the given patient? A patient is visible when it was
 * registered at that hospital, when it carries no facility link (seeded/legacy
 * demo data that is intentionally shared), or when a referral or appointment
 * ties it to the hospital (the explicit referral exception).
 */
function patientVisibleToHospital(
  patient: unknown,
  hospitalId: string,
  context: { referrals?: unknown[]; appointments?: unknown[] },
): boolean {
  if (!isRecord(patient)) return false;
  const owner = str(patient.registeredByFacilityId);
  if (!owner) return true;
  if (owner === hospitalId) return true;
  const id = str(patient.id);
  if (!id) return false;
  const linked = (list?: unknown[]) => (list ?? []).some(r => isRecord(r) && str(r.patientId) === id);
  return linked(context.referrals) || linked(context.appointments);
}

/**
 * Patient ids a caller may read AND write clinical data for, given an
 * ownership predicate over facilities. Mirrors `patientVisibleToHospital` at
 * the collection level so a caller's readable scope and writable scope cannot
 * drift apart.
 */
export function writablePatientIdsForFacilities(
  patients: unknown[],
  referrals: unknown[],
  appointments: unknown[],
  ownsFacility: (facilityId: string) => boolean,
): Set<string> {
  const out = new Set<string>();
  for (const patient of patients) {
    if (!isRecord(patient)) continue;
    const id = str(patient.id);
    if (!id) continue;
    const owner = str(patient.registeredByFacilityId);
    if (!owner || ownsFacility(owner)) out.add(id);
  }
  for (const referral of referrals) {
    if (!isRecord(referral)) continue;
    const ties =
      ownsFacility(str(referral.sourceFacilityId) ?? '') ||
      ownsFacility(str(referral.destinationFacilityId) ?? '');
    const id = str(referral.patientId);
    if (ties && id) out.add(id);
  }
  for (const appointment of appointments) {
    if (!isRecord(appointment)) continue;
    if (!ownsFacility(str(appointment.facilityId) ?? '')) continue;
    const id = str(appointment.patientId);
    if (id) out.add(id);
  }
  return out;
}

/** Patient ids a hospital may read AND write clinical data for. */
export function writablePatientIdsForHospital(
  patients: unknown[],
  referrals: unknown[],
  appointments: unknown[],
  hospitalId: string,
): Set<string> {
  return writablePatientIdsForFacilities(patients, referrals, appointments, id => id === hospitalId);
}

/**
 * Is this referral tied to the caller's scope? District callers pass the set
 * of their district's facility ids.
 */
export function referralInScope(referral: unknown, scope: SessionScope, facilityIds?: Set<string>): boolean {
  if (!isRecord(referral)) return false;
  if (scope.kind === 'overall') return true;
  if (scope.kind === 'patient') return str(referral.patientId) === scope.patientId;
  const ids = [str(referral.sourceFacilityId), str(referral.destinationFacilityId)].filter(
    (id): id is string => id !== undefined,
  );
  if (scope.kind === 'hospital') return ids.includes(scope.hospitalId);
  return ids.some(id => facilityIds?.has(id) === true);
}

/**
 * Derive the authorization scope from a STORED session binding. The role,
 * district, hospital and patient always come from this row — never from the
 * request — so a client cannot claim authorization it was not granted.
 */
export interface BindingLike {
  role: string;
  districtId?: string;
  districtName?: string;
  hospitalId?: string;
  staffUserId?: string;
  patientId?: string;
  /** Display name / username, used for audit attribution on writes. */
  name?: string;
  username?: string;
}

export function scopeFromBinding(binding: BindingLike | null | undefined): SessionScope | null {
  if (!binding) return null;
  if (binding.role === 'overall_admin') return { kind: 'overall' };
  if (binding.role === 'gov_admin') {
    // A district binding without a district cannot be authorized.
    if (!binding.districtId) return null;
    return {
      kind: 'district',
      districtId: binding.districtId,
      districtName: binding.districtName ?? binding.districtId,
      staffUserId: binding.staffUserId,
      staffName: binding.name ?? binding.username,
    };
  }
  if (binding.role === 'patient' && binding.patientId) {
    return { kind: 'patient', patientId: binding.patientId };
  }
  if (binding.hospitalId) {
    return {
      kind: 'hospital',
      hospitalId: binding.hospitalId,
      staffUserId: binding.staffUserId,
      staffName: binding.name ?? binding.username,
      staffRole: binding.role,
    };
  }
  return null;
}

// ── District scoping ──────────────────────────────────────────────

/** Does this hospital record belong to the given district? */
export function hospitalInDistrict(record: unknown, districtId: string, districtName: string): boolean {
  if (!isRecord(record)) return false;
  const own = str(record.districtId);
  if (own) return own === districtId;
  // Seeded/legacy hospitals carry only the district NAME.
  return str(record.district) === districtName;
}

/** Facility (hospital) ids that belong to a district. */
export function districtFacilityIds(hospitals: unknown[], districtId: string, districtName: string): Set<string> {
  const ids = new Set<string>();
  for (const hospital of hospitals) {
    if (!isRecord(hospital)) continue;
    const id = str(hospital.id);
    if (id && hospitalInDistrict(hospital, districtId, districtName)) ids.add(id);
  }
  return ids;
}

/**
 * Read one collection for a District Administrator. Everything tied to a
 * facility is filtered to the district's hospitals. Unattributed legacy demo
 * records (the seeded patients/facilities with no facility link) stay shared so
 * the original Pudukkottai demo keeps working — see the note in appData.ts.
 */
function scopeDistrictRead(
  key: string,
  items: unknown[],
  scope: { districtId: string; districtName: string },
  context: Record<string, unknown[]>,
): unknown[] | null {
  const facilityIds = districtFacilityIds(context.hospitals ?? [], scope.districtId, scope.districtName);
  const linkedToDistrict = (record: unknown) => recordHospitalIds(key, record).some(id => facilityIds.has(id));

  if (key === 'districts') {
    return items.filter(r => isRecord(r) && str(r.districtId) === scope.districtId);
  }
  if (key === 'hospitals') {
    return items.filter(r => hospitalInDistrict(r, scope.districtId, scope.districtName));
  }
  if (key === 'referrals') return items.filter(linkedToDistrict);
  if (DISTRICT_FACILITY_COLLECTIONS.has(key)) {
    return items.filter(r => {
      const facility = recordHospitalIds(key, r)[0];
      if (facility) return facilityIds.has(facility);
      // A District Administrator's own staff record carries no facility link.
      return isRecord(r) && str(r.districtId) === scope.districtId;
    });
  }
  if (key === 'patients') {
    return items.filter(r => {
      const owner = isRecord(r) ? str(r.registeredByFacilityId) : undefined;
      return !owner || facilityIds.has(owner);
    });
  }
  if (CLINICAL_COLLECTIONS.has(key)) {
    const visiblePatients = new Set(
      (context.patients ?? []).map(p => (isRecord(p) && typeof p.id === 'string' ? p.id : '')),
    );
    return items.filter(r => {
      const patientId = patientIdOf(key, r);
      return patientId === undefined || visiblePatients.has(patientId);
    });
  }
  if (key === 'referralEvents' || key === 'referralPredictions') {
    const visible = new Set(
      (context.referrals ?? []).map(r => (isRecord(r) && typeof r.id === 'string' ? r.id : '')),
    );
    return items.filter(r => isRecord(r) && typeof r.referralId === 'string' && visible.has(r.referralId));
  }
  // Village access scores are per-district statistics: a District
  // Administrator sees only their OWN district's rows. Rows carry the district
  // NAME — the same value the session binding is issued with — so a district
  // can never mix another district's villages into its analytics.
  if (key === 'villageAccessScores') {
    return items.filter(r => isRecord(r) && str(r.district) === scope.districtName);
  }
  return items;
}

// ── READ scoping ──────────────────────────────────────────────────

/**
 * Filter one collection payload for the caller's scope.
 * Returns `null` when the caller must not receive the collection at all.
 * `context` holds already-filtered collections, so referral events can be
 * scoped through the referrals the caller is allowed to see.
 */
export function scopeItemsForRead(
  key: string,
  items: unknown[],
  scope: SessionScope | null,
  context: Record<string, unknown[]> = {},
): unknown[] | null {
  // Authenticated but no session binding yet: nothing is shared.
  if (!scope) return null;
  // The Overall Administrator sees everything, in every district.
  if (scope.kind === 'overall') return items;

  // Deletion tombstones must reach every device, otherwise deleted records
  // would be resurrected by the merge on other devices.
  if (key === TOMBSTONES_KEY) return items;

  if (scope.kind === 'district') return scopeDistrictRead(key, items, scope, context);

  if (scope.kind === 'hospital') {
    if (DISTRICT_ONLY.has(key)) return null;
    // The hospital directory is shared reference data: a doctor or health
    // worker must be able to refer a patient to ANY hospital, including one in
    // another district. Only the administrator credentials of OTHER hospitals
    // are withheld — the caller's own hospital record is unchanged.
    if (key === 'hospitals') {
      return items.map(record =>
        isRecord(record) && str(record.id) === scope.hospitalId ? record : hospitalDirectoryRecord(record),
      );
    }
    if (key === 'referralEvents') {
      const visible = new Set(
        (context.referrals ?? []).map(r => (isRecord(r) && typeof r.id === 'string' ? r.id : '')),
      );
      return items.filter(r => isRecord(r) && typeof r.referralId === 'string' && visible.has(r.referralId));
    }
    if (HOSPITAL_FIELDS[key]) {
      return items.filter(r => recordHospitalIds(key, r).includes(scope.hospitalId));
    }
    if (key === 'patients') {
      return items.filter(r => patientVisibleToHospital(r, scope.hospitalId, context));
    }
    // Clinical records carry only a patientId, so they follow the patients the
    // hospital is allowed to see (owned + shared + referred/booked in).
    if (CLINICAL_COLLECTIONS.has(key)) {
      const visiblePatients = new Set(
        (context.patients ?? []).map(p => (isRecord(p) && typeof p.id === 'string' ? p.id : '')),
      );
      return items.filter(r => {
        const patientId = patientIdOf(key, r);
        // Staff notifications carry no patient link; keep them for the staff UI.
        return patientId === undefined || visiblePatients.has(patientId);
      });
    }
    return items;
  }

  // Patient scope: only their own health information plus the reference data
  // the patient app needs (facilities, medicines, diagnostics, doctors).
  if (key === 'staffUsers') return null; // contains staff credentials
  // A patient never needs the health-worker roster (names, phones, work areas).
  if (key === 'healthWorkers') return null;
  if (DISTRICT_ONLY.has(key)) return null;
  // Every hospital is bookable, whatever district it sits in.
  if (key === 'hospitals') return items.map(hospitalDirectoryRecord);
  if (key === 'referralEvents') {
    const visible = new Set(
      (context.referrals ?? []).map(r => (isRecord(r) && typeof r.id === 'string' ? r.id : '')),
    );
    return items.filter(r => isRecord(r) && typeof r.referralId === 'string' && visible.has(r.referralId));
  }
  if (PATIENT_LINKED.has(key)) {
    return items.filter(r => recordPatientLink(key, r) === scope.patientId);
  }
  return items;
}

/** Apply read scoping to a whole set of collection payloads. */
export function scopeCollectionsForRead(
  raw: Record<string, string>,
  scope: SessionScope | null,
): Record<string, string> {
  const parsed: Record<string, Envelope> = {};
  for (const [key, data] of Object.entries(raw)) {
    const env = parseEnvelope(data);
    if (env) parsed[key] = env;
  }

  const keys = Object.keys(parsed).sort((a, b) => {
    const ai = READ_ORDER.indexOf(a);
    const bi = READ_ORDER.indexOf(b);
    return (ai === -1 ? READ_ORDER.length : ai) - (bi === -1 ? READ_ORDER.length : bi);
  });

  const out: Record<string, string> = {};
  const visible: Record<string, unknown[]> = {};
  for (const key of keys) {
    const items = scopeItemsForRead(key, parsed[key].items, scope, visible);
    if (items === null) continue;
    visible[key] = items;
    out[key] = serializeEnvelope(parsed[key].v, items);
  }
  return out;
}

// ── WRITE scoping ─────────────────────────────────────────────────

/**
 * Extra context a write needs. `writablePatientIds` is computed by the caller
 * (appData.ts) from the STORED patients/referrals/appointments, so a hospital
 * can only record clinical data for patients inside its scope. When absent the
 * previous (permissive) behaviour is kept, so unit callers and older deploys
 * are unaffected.
 */
export interface WriteScope {
  /** Patients the caller may record clinical data for. */
  writablePatientIds?: Set<string>;
  /** Facilities (hospitals) the caller may write records for — district scope. */
  facilityIds?: Set<string>;
  /**
   * Referral ids that belong to ANOTHER scope. Referral events for these are
   * never written, so one district/hospital cannot rewrite another's audit
   * trail. Absent means "not enforced" (older deploys, unit callers).
   */
  foreignReferralIds?: Set<string>;
  /** Authenticated actor, used to overwrite audit fields on referral events. */
  actor?: WriteActor;
}

/**
 * Merge a collection so only records inside the caller's scope are applied:
 * stored records the caller does not own are preserved exactly, existing
 * incoming records are judged by their STORED ownership (a crafted payload
 * cannot claim a record it does not own), and new records must declare an
 * in-scope owner.
 */
function mergeScoped(
  stored: unknown[],
  incoming: unknown[],
  belongs: (record: unknown) => boolean,
  /** Gate for records that do not exist yet (defaults to `belongs`). */
  canCreate: (record: unknown) => boolean = belongs,
): unknown[] {
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  for (const record of stored) if (!belongs(record)) out.push(record);
  for (const record of incoming) {
    const storedRecord = storedByKey.get(mergeKeyOf(record));
    if (storedRecord ? belongs(storedRecord) : canCreate(record)) out.push(record);
  }
  return out;
}

/** Preserve everything the caller does not own; apply only its own patients. */
function mergePatientsInScope(
  stored: unknown[],
  incoming: unknown[],
  ownsFacility: (facilityId: string) => boolean,
): unknown[] {
  const ownedByMe = (record: unknown) => {
    const owner = str(isRecord(record) ? record.registeredByFacilityId : undefined);
    return owner !== undefined && ownsFacility(owner);
  };
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  // Keep other facilities' patients AND unattributed (seeded/legacy) records.
  for (const record of stored) if (!ownedByMe(record)) out.push(record);
  for (const record of incoming) {
    if (!isRecord(record)) continue;
    const storedRecord = storedByKey.get(mergeKeyOf(record));
    if (storedRecord) {
      // Existing records are judged by their STORED owner, so a crafted payload
      // cannot claim a patient that belongs to another facility.
      if (ownedByMe(storedRecord)) out.push(record);
      continue;
    }
    const owner = str(record.registeredByFacilityId);
    // A new patient must belong to this facility. An absent link is accepted so
    // older offline clients keep working (treated as shared, like the seeds).
    if (owner === undefined || ownsFacility(owner)) out.push(record);
  }
  return out;
}

/**
 * Referral events are APPEND-ONLY. Stored history is never modified or removed
 * (only events for referrals outside the caller's scope are withheld), and an
 * appended event has its identity fields overwritten with the server-verified
 * actor so a client cannot attribute an action to someone else.
 */
export function mergeReferralEvents(
  stored: unknown[],
  incoming: unknown[],
  foreignReferralIds: Set<string>,
  actor?: WriteActor,
): unknown[] {
  const foreign = (record: unknown) =>
    isRecord(record) && typeof record.referralId === 'string' && foreignReferralIds.has(record.referralId);
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const record of stored) {
    if (foreign(record)) continue;
    out.push(record);
    if (isRecord(record) && typeof record.id === 'string') seen.add(record.id);
  }
  for (const record of incoming) {
    if (!isRecord(record) || foreign(record)) continue;
    const id = typeof record.id === 'string' ? record.id : undefined;
    if (id) {
      if (seen.has(id)) continue; // already stored — history is immutable
      seen.add(id);
    }
    out.push(actor ? { ...record, ...serverActorFields(actor) } : record);
  }
  return out;
}

/** Server-derived audit fields (a client's own values are discarded). */
function serverActorFields(actor: WriteActor): Record<string, unknown> {
  return {
    performedBy: actor.name,
    performedByUserId: actor.id,
    performedByRole: actor.role,
    performedByFacilityId: actor.hospitalId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    hospitalId: actor.hospitalId,
  };
}

/**
 * Referral writes keep the working fields editable but never let a caller jump
 * the workflow: a status change that the canonical model does not allow is
 * dropped (the stored record wins), so the collection path cannot be used to
 * bypass the Referral Closure Engine.
 */
function mergeReferralsScoped(
  stored: unknown[],
  incoming: unknown[],
  belongs: (record: unknown) => boolean,
  canCreate: (record: unknown) => boolean,
  actor?: WriteActor,
): unknown[] {
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  // A referral exists exactly once: emitting the same record twice (e.g. a
  // payload that both updates and re-appends it) would create two copies of one
  // referral, which every role would then see twice.
  const emitted = new Set<string>();
  for (const record of stored) {
    if (!belongs(record)) {
      out.push(record);
      emitted.add(mergeKeyOf(record));
    }
  }
  for (const record of incoming) {
    const key = mergeKeyOf(record);
    if (emitted.has(key)) continue;
    const storedRecord = storedByKey.get(key);
    if (!storedRecord) {
      // A referral always STARTS at CREATED: a client cannot insert one that is
      // already in flight or closed, and the creator is the server-side actor.
      if (canCreate(record) && isRecord(record)) {
        emitted.add(key);
        out.push({
          ...record,
          status: REFERRAL_STATUS.CREATED,
          currentStep: referralStepOf(REFERRAL_STATUS.CREATED),
          totalSteps: REFERRAL_TOTAL_STEPS,
          createdByUserId: actor?.id ?? (record.createdByUserId as string | undefined),
          createdByName: actor?.name ?? (record.createdByName as string | undefined),
          createdByRole: actor?.role ?? (record.createdByRole as string | undefined),
        });
      }
      continue;
    }
    if (!belongs(storedRecord)) continue; // another scope's referral
    emitted.add(key);
    if (!isRecord(record) || !isRecord(storedRecord)) {
      out.push(record);
      continue;
    }
    const previous = str(storedRecord.status);
    const next = str(record.status);
    const statusChange = previous !== next;
    if (statusChange && !canTransition(previous, next ?? '')) {
      // Invalid transition — keep the stored status but let the caller's other
      // field edits through (notes, appointment details, …).
      out.push({ ...record, status: storedRecord.status });
      continue;
    }
    out.push(record);
  }
  return out;
}

/** Preserve clinical records for patients outside the hospital's scope. */
function mergeClinicalForHospital(
  key: string,
  stored: unknown[],
  incoming: unknown[],
  writablePatientIds: Set<string>,
): unknown[] {
  const belongs = (record: unknown) => {
    const patientId = patientIdOf(key, record);
    return patientId === undefined || writablePatientIds.has(patientId);
  };
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  for (const record of stored) if (!belongs(record)) out.push(record);
  for (const record of incoming) {
    const storedRecord = storedByKey.get(mergeKeyOf(record));
    if (storedRecord ? belongs(storedRecord) : belongs(record)) out.push(record);
  }
  return out;
}

/**
 * Write merge for a District Administrator.
 *
 * Only facilities/records inside the district are applied. Ownership is judged
 * from the STORED hospitals (supplied by appData.ts as `write.facilityIds`) so a
 * crafted payload cannot widen its own district. Districts themselves, and the
 * District Administrator accounts, are created by the Overall Administrator
 * only — a district admin can edit their own record but never mint one.
 */
function mergeDistrictWrite(
  key: string,
  stored: unknown[],
  incoming: unknown[],
  scope: { districtId: string; districtName: string },
  write?: WriteScope,
): unknown[] {
  // Districts and district-level analytics are read-only for a district admin.
  if (key === 'districts' || DISTRICT_ONLY.has(key)) return stored;

  const facilityIds = write?.facilityIds;
  const ownsFacility = (facilityId: string) => !!facilityIds && facilityIds.has(facilityId);
  const inMyDistrict = (record: unknown) => isRecord(record) && str(record.districtId) === scope.districtId;
  const isAdminRole = (record: unknown) =>
    isRecord(record) && DISTRICT_LEVEL_ROLES.has(String(record.role));

  if (key === 'hospitals') {
    return mergeScoped(
      stored,
      incoming,
      record => hospitalInDistrict(record, scope.districtId, scope.districtName),
      // A NEW hospital must declare this district; the id is irrelevant (it is new).
      record => isRecord(record) && hospitalInDistrict(record, scope.districtId, scope.districtName),
    );
  }
  if (key === 'patients') return mergePatientsInScope(stored, incoming, ownsFacility);
  if (CLINICAL_COLLECTIONS.has(key) && write?.writablePatientIds) {
    return mergeClinicalForHospital(key, stored, incoming, write.writablePatientIds);
  }
  if (key === 'referralEvents') {
    return write?.foreignReferralIds
      ? mergeReferralEvents(stored, incoming, write.foreignReferralIds, write.actor)
      : stored;
  }
  // Unknown collections default to DENY.
  if (!HOSPITAL_FIELDS[key]) return stored;

  const ownsStored = (record: unknown) =>
    (key === 'staffUsers' && isAdminRole(record) ? inMyDistrict(record) : recordHospitalIds(key, record).some(ownsFacility) || inMyDistrict(record));
  const canCreate = (record: unknown) =>
    key === 'staffUsers' && isAdminRole(record)
      ? false
      : recordHospitalIds(key, record).some(ownsFacility) || inMyDistrict(record);

  // Referrals additionally enforce the canonical workflow (the collection path
  // must not be usable to skip the Referral Closure Engine).
  if (key === 'referrals') {
    return mergeReferralsScoped(stored, incoming, ownsStored, canCreate, write?.actor);
  }

  return mergeScoped(stored, incoming, ownsStored, canCreate);
}

/** Merge one collection payload for a write from the given scope. */
export function mergeAuthorizedWrite(
  key: string,
  stored: unknown[],
  incoming: unknown[],
  scope: SessionScope | null,
  write?: WriteScope,
): unknown[] {
  // No binding → no writes at all; whatever is stored stays untouched.
  if (!scope) return stored;

  // The Overall Administrator owns the whole platform.
  if (scope.kind === 'overall') return incoming;

  // Deletion tombstones are scope-independent and additive — every role must be
  // able to publish its own deletes, and no device may drop another's. (This is
  // checked BEFORE the district branch, which would otherwise treat tombstones
  // as an unknown collection and silently discard a district admin's deletes.)
  if (key === TOMBSTONES_KEY) {
    const seen = new Set<string>();
    const merged: unknown[] = [];
    for (const item of [...stored, ...incoming]) {
      const marker = JSON.stringify(item);
      if (!seen.has(marker)) {
        seen.add(marker);
        merged.push(item);
      }
    }
    return merged;
  }

  // The District Administrator owns their district's data (and only that).
  if (scope.kind === 'district') return mergeDistrictWrite(key, stored, incoming, scope, write);

  if (scope.kind === 'hospital') {
    // District-level analytics are read-only for hospital users.
    if (DISTRICT_ONLY.has(key)) return stored;

    // The hospital directory is READ-ONLY for hospital users: they may read
    // every hospital to pick a referral destination, but only the District
    // Administrator registers or edits hospitals. Leaving this writable would
    // also let a redacted payload overwrite the stored record's credentials.
    if (key === 'hospitals') return stored;

    // Patients are attributed to the registering hospital, so a hospital may
    // only create/update its own and can never touch another hospital's record.
    if (key === 'patients') {
      return mergePatientsInScope(stored, incoming, facilityId => facilityId === scope.hospitalId);
    }
    // Clinical records are scoped through the patients the hospital may see.
    if (CLINICAL_COLLECTIONS.has(key) && write?.writablePatientIds) {
      return mergeClinicalForHospital(key, stored, incoming, write.writablePatientIds);
    }
    // Referral audit trail: never rewrite another scope's referral events.
    if (key === 'referralEvents') {
      return write?.foreignReferralIds
        ? mergeReferralEvents(stored, incoming, write.foreignReferralIds, write.actor)
        : incoming;
    }
    // Anything we have no ownership information for defaults to DENY.
    if (!HOSPITAL_FIELDS[key]) return stored;

    // Existing records are judged by their STORED owner (so a crafted payload
    // cannot claim ownership); new records must declare this hospital.
    const belongs = (record: unknown) => {
      // Hospital users must never create or alter an administrator account.
      if (key === 'staffUsers' && isRecord(record) && DISTRICT_LEVEL_ROLES.has(String(record.role))) {
        return false;
      }
      return recordHospitalIds(key, record).includes(scope.hospitalId);
    };

    // Referrals additionally enforce the canonical workflow.
    if (key === 'referrals') return mergeReferralsScoped(stored, incoming, belongs, belongs, write?.actor);

    return mergeScoped(stored, incoming, belongs);
  }

  // Patient scope: only their own records.
  if (!PATIENT_LINKED.has(key)) return stored;
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  for (const record of stored) {
    if (recordPatientLink(key, record) !== scope.patientId) out.push(record);
  }
  for (const record of incoming) {
    const storedRecord = storedByKey.get(mergeKeyOf(record));
    const owner = storedRecord
      ? recordPatientLink(key, storedRecord)
      : recordPatientLink(key, record);
    if (owner === scope.patientId) out.push(record);
  }
  return out;
}

/** Guard against the Convex 1 MiB document limit before writing a row. */
export function payloadFits(version: string, items: unknown[]): boolean {
  return envelopeSizeBytes(version, items) <= MAX_PAYLOAD_BYTES;
}
