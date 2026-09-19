// ============================================================================
// AarogyaLink - Cloud data helpers (cross-device sync via Convex)
// ============================================================================

// Shared-data version. Bump this to invalidate BOTH the localStorage cache and
// the cloud records on every device, forcing a reload of fresh mock data.
// v6: fixes unbounded growth from id-less collections (referralPredictions).
export const DATA_VERSION = 'v6-size-fix-2026-09';

interface CloudEnvelope<T = unknown> {
  v: string;
  items: T[];
}

/** Serialize a collection for storage in the Convex `collections` table. */
export function wrapForCloud<T>(items: T[]): string {
  return JSON.stringify({ v: DATA_VERSION, items } satisfies CloudEnvelope<T>);
}

/**
 * Deserialize a cloud record. Returns the items only when the record exists
 * and was written with the current DATA_VERSION; otherwise null so the caller
 * can fall back to local/mock data.
 */
export function unwrapFromCloud<T>(raw: unknown): T[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as CloudEnvelope<T>;
    if (parsed && parsed.v === DATA_VERSION && Array.isArray(parsed.items)) {
      return parsed.items;
    }
  } catch {
    /* malformed payload — ignore */
  }
  return null;
}

/**
 * Stable identity key for a record, used by mergeCollections.
 * Collections use different id fields: most have `id`, village scores use
 * `villageId`, and referral predictions are keyed by `referralId`.
 * Falls back to JSON identity for anything else.
 */
export function mergeKeyOf(item: unknown): string {
  if (typeof item === 'object' && item !== null) {
    const rec = item as Record<string, unknown>;
    if (typeof rec.id === 'string') return `id:${rec.id}`;
    if (typeof rec.villageId === 'string') return `vid:${rec.villageId}`;
    if (typeof rec.referralId === 'string') return `rid:${rec.referralId}`;
  }
  return `j:${JSON.stringify(item)}`;
}

/**
 * Union-merge cloud and local record lists. Cloud wins for shared keys
 * (it is the source of truth); local-only records are preserved so work
 * done offline survives and gets pushed up by the sync layer.
 * Duplicates already present in the input lists are deduplicated,
 * which keeps collections from growing unboundedly.
 */
export function mergeCollections<T>(cloudItems: T[], localItems: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...cloudItems, ...localItems]) {
    const key = mergeKeyOf(item);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** Approximate serialized size of a payload in bytes. */
export function payloadSizeBytes(items: unknown[]): number {
  return new TextEncoder().encode(JSON.stringify({ v: DATA_VERSION, items })).length;
}

/**
 * Convex enforces a 1 MiB limit per document value. We stay well under it.
 * Returns the payload when it fits, or null when it must not be pushed.
 */
export const MAX_CLOUD_PAYLOAD_BYTES = 900 * 1024; // 900 KiB safety margin

export function safePayload<T>(items: T[]): string | null {
  const payload = wrapForCloud(items);
  return new TextEncoder().encode(payload).length <= MAX_CLOUD_PAYLOAD_BYTES ? payload : null;
}
