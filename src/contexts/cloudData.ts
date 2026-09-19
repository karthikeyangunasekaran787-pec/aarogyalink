// ============================================================================
// AarogyaLink - Cloud data helpers (cross-device sync via Convex)
// ============================================================================

// Shared-data version. Bump this to invalidate BOTH the localStorage cache and
// the cloud records on every device, forcing a reload of fresh mock data.
export const DATA_VERSION = 'v5-cloud-sync-2026-09';

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
