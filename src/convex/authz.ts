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

export type SessionScope =
  | { kind: 'district' }
  | { kind: 'hospital'; hospitalId: string; staffUserId?: string }
  | { kind: 'patient'; patientId: string };

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

/** District-level analytics: only the District Administrator receives them. */
const DISTRICT_ONLY = new Set(['villageAccessScores', 'referralPredictions']);

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
  'referrals',
  'appointments',
  'patients',
  'followups',
  'vitals',
  'healthRecords',
  'consultations',
  'notifications',
  'referralEvents',
];

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
 * Patient ids a hospital may read AND write clinical data for. Mirrors
 * `patientVisibleToHospital` at the collection level so a hospital's readable
 * scope and its writable scope cannot drift apart.
 */
export function writablePatientIdsForHospital(
  patients: unknown[],
  referrals: unknown[],
  appointments: unknown[],
  hospitalId: string,
): Set<string> {
  const out = new Set<string>();
  for (const patient of patients) {
    if (!isRecord(patient)) continue;
    const id = str(patient.id);
    if (!id) continue;
    const owner = str(patient.registeredByFacilityId);
    if (!owner || owner === hospitalId) out.add(id);
  }
  for (const referral of referrals) {
    if (!isRecord(referral)) continue;
    const ties = str(referral.sourceFacilityId) === hospitalId || str(referral.destinationFacilityId) === hospitalId;
    const id = str(referral.patientId);
    if (ties && id) out.add(id);
  }
  for (const appointment of appointments) {
    if (!isRecord(appointment)) continue;
    if (str(appointment.facilityId) !== hospitalId) continue;
    const id = str(appointment.patientId);
    if (id) out.add(id);
  }
  return out;
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
  if (scope.kind === 'district') return items;

  // Deletion tombstones must reach every device, otherwise deleted records
  // would be resurrected by the merge on other devices.
  if (key === TOMBSTONES_KEY) return items;

  if (scope.kind === 'hospital') {
    if (DISTRICT_ONLY.has(key)) return null;
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
  if (DISTRICT_ONLY.has(key)) return null;
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
  writablePatientIds?: Set<string>;
}

/** Preserve everything this hospital does not own; apply only its own patients. */
function mergePatientsForHospital(stored: unknown[], incoming: unknown[], hospitalId: string): unknown[] {
  const ownedByMe = (record: unknown) => str(isRecord(record) ? record.registeredByFacilityId : undefined) === hospitalId;
  const storedByKey = new Map<string, unknown>();
  for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

  const out: unknown[] = [];
  // Keep other hospitals' patients AND unattributed (seeded/legacy) records.
  for (const record of stored) if (!ownedByMe(record)) out.push(record);
  for (const record of incoming) {
    if (!isRecord(record)) continue;
    const storedRecord = storedByKey.get(mergeKeyOf(record));
    if (storedRecord) {
      // Existing records are judged by their STORED owner, so a crafted payload
      // cannot claim a patient that belongs to another hospital.
      if (ownedByMe(storedRecord)) out.push(record);
      continue;
    }
    const owner = str(record.registeredByFacilityId);
    // A new patient must belong to this hospital. An absent link is accepted so
    // older offline clients keep working (treated as shared, like the seeds).
    if (owner === hospitalId || owner === undefined) out.push(record);
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

  // The District Administrator owns district-wide data.
  if (scope.kind === 'district') return incoming;

  // Tombstones are additive — never let one device drop another's deletes.
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

  if (scope.kind === 'hospital') {
    // District-level analytics are read-only for hospital users.
    if (DISTRICT_ONLY.has(key)) return stored;

    // Patients are attributed to the registering hospital, so a hospital may
    // only create/update its own and can never touch another hospital's record.
    if (key === 'patients') {
      return mergePatientsForHospital(stored, incoming, scope.hospitalId);
    }
    // Clinical records are scoped through the patients the hospital may see.
    if (CLINICAL_COLLECTIONS.has(key) && write?.writablePatientIds) {
      return mergeClinicalForHospital(key, stored, incoming, write.writablePatientIds);
    }

    const fields = HOSPITAL_FIELDS[key];
    if (!fields) {
      // Any other patient-linked record we have no ownership information for
      // stays writable so registration and clinical capture keep working.
      return incoming;
    }

    const storedByKey = new Map<string, unknown>();
    for (const record of stored) storedByKey.set(mergeKeyOf(record), record);

    const belongs = (record: unknown) => recordHospitalIds(key, record).includes(scope.hospitalId);

    const out: unknown[] = [];
    // Keep every stored record the caller does not own.
    for (const record of stored) {
      if (!belongs(record)) out.push(record);
    }
    // Apply only the incoming records the caller is allowed to write.
    for (const record of incoming) {
      if (key === 'staffUsers' && isRecord(record) && record.role === 'gov_admin') {
        continue; // hospital users must never mint a District Administrator
      }
      const storedRecord = storedByKey.get(mergeKeyOf(record));
      // Existing records are judged by their STORED owner (so a crafted payload
      // cannot claim ownership); new records must declare this hospital.
      if (storedRecord ? belongs(storedRecord) : belongs(record)) out.push(record);
    }
    return out;
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
