// ============================================================================
// Staff record resolution (pure helpers)
// ----------------------------------------------------------------------------
// A signed-in staff account must be matched to its Doctor / Health Worker
// record. Marking these as pure functions keeps the resolution logic testable
// and lets the dashboards resolve the record in a SHELL component, so their
// hook order stays stable while cloud data is still arriving.
// ============================================================================

export interface SessionIdentity {
  id?: string;
  name?: string;
}

export interface StaffLike {
  id?: string;
  userId?: string;
  name: string;
  facilityId?: string;
}

/** Health Worker: match by userId, then by name. */
export function resolveHealthWorker<T extends StaffLike>(
  records: T[],
  user: SessionIdentity | null | undefined,
): T | undefined {
  if (!user) return undefined;
  const byUserId = records.find(r => r.userId === user.id);
  if (byUserId) return byUserId;
  if (!user.name) return undefined;
  const target = user.name.toLowerCase();
  return records.find(r => r.name.toLowerCase() === target);
}

/**
 * Doctor: match by userId; otherwise fall back to the staff account (userId, or
 * name + facility) so a newly created doctor still resolves on any device.
 */
export function resolveDoctor<T extends StaffLike>(
  records: T[],
  user: SessionIdentity | null | undefined,
  staff: StaffLike[] = [],
): T | undefined {
  if (!user) return undefined;
  const byUserId = records.find(r => r.userId === user.id);
  if (byUserId) return byUserId;

  const staffRecord = staff.find(s => s.id === user.id);
  if (staffRecord) {
    const byStaffId = records.find(r => r.userId === staffRecord.id);
    if (byStaffId) return byStaffId;
    const staffName = staffRecord.name.toLowerCase();
    return records.find(
      r => r.name.toLowerCase() === staffName && r.facilityId === staffRecord.facilityId,
    );
  }

  if (!user.name) return undefined;
  const target = user.name.toLowerCase();
  return records.find(r => r.name.toLowerCase() === target);
}

/** Local cache fallback: records stored by a previous session on this device. */
export function readCachedRecords<T>(storageKey: string): T[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Context records, falling back to this device's cache when empty. */
export function recordsOrCache<T>(records: T[], storageKey: string): T[] {
  return records.length > 0 ? records : readCachedRecords<T>(storageKey);
}
