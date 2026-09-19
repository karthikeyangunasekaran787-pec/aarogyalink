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

/** Order matters: referralEvents are scoped through referrals. */
const READ_ORDER = [
  'referrals',
  'patients',
  'appointments',
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
    // No hospital link stored on these records (patients, vitals, health
    // records, consultations, follow-ups, notifications). They cannot be
    // filtered by hospital with the current schema — see the module note.
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

/** Merge one collection payload for a write from the given scope. */
export function mergeAuthorizedWrite(
  key: string,
  stored: unknown[],
  incoming: unknown[],
  scope: SessionScope | null,
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

    const fields = HOSPITAL_FIELDS[key];
    if (!fields) {
      // Records without a hospital link cannot be verified (patients, vitals,
      // health records, consultations, follow-ups, notifications). Writes stay
      // allowed so registration and clinical capture keep working.
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
