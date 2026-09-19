/**
 * Unit tests for src/contexts/cloudData.ts — run with: bun test
 * (Files live under scripts/tests so Vite's tsconfig doesn't pick them up as app code.)
 */
import { describe, expect, test } from 'bun:test';
import {
  DATA_VERSION, wrapForCloud, unwrapFromCloud,
  mergeKeyOf, mergeCollections, safePayload, payloadSizeBytes, MAX_CLOUD_PAYLOAD_BYTES,
  tombstoneEntry, parseTombstoneEntry, tombstonesByCollection, filterTombstoned, maxIdNum, TOMBSTONES_KEY,
} from '../../src/contexts/cloudData';

describe('deletion tombstones', () => {
  test('tombstone entry round-trips through parse', () => {
    const entry = tombstoneEntry('staffUsers', 'id:ustaff-123');
    expect(entry).toBe('staffUsers:id:ustaff-123');
    const parsed = parseTombstoneEntry(entry);
    expect(parsed).toEqual({ collectionKey: 'staffUsers', mergeKey: 'id:ustaff-123' });
    expect(parseTombstoneEntry('no-colon-here')).toBeNull();
  });

  test('tombstonesByCollection groups by collection key', () => {
    const map = tombstonesByCollection([
      'staffUsers:id:a', 'staffUsers:id:b', 'doctors:id:d1', 'hospitals:id:h9',
    ]);
    expect(map.get('staffUsers')).toEqual(new Set(['id:a', 'id:b']));
    expect(map.get('doctors')).toEqual(new Set(['id:d1']));
    expect(map.get('hospitals')).toEqual(new Set(['id:h9']));
    expect(map.get('patients')).toBeUndefined();
  });

  test('filterTombstoned removes deleted records from both merge sides', () => {
    const cloud = [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }];
    const deleted = new Set(['id:h2']);
    expect(filterTombstoned(cloud, deleted)).toEqual([{ id: 'h1' }, { id: 'h3' }]);
    expect(filterTombstoned(cloud, undefined)).toEqual(cloud);
    expect(filterTombstoned(cloud, new Set())).toEqual(cloud);
  });

  test('delete-then-merge keeps the record deleted (no resurrection)', () => {
    // Device A deletes h2, device B still has a stale cloud payload with h2.
    const staleCloud = [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }];
    const localAfterDelete = [{ id: 'h1', name: 'A' }];
    const deleted = new Set([mergeKeyOf({ id: 'h2', name: 'B' })]);
    const merged = mergeCollections(
      filterTombstoned(staleCloud, deleted),
      filterTombstoned(localAfterDelete, deleted),
    );
    expect(merged.some(h => h.id === 'h2')).toBe(false);
    expect(merged.length).toBe(1);
  });

  test('mergeKeyOf is stable across JSON round-trips (tombstone key matches)', () => {
    const record = { id: 'ustaff-abc-123', name: 'X' };
    const throughCloud = unwrapFromCloud<typeof record>(wrapForCloud([record]))![0];
    expect(mergeKeyOf(record)).toBe(mergeKeyOf(throughCloud));
  });

  test('maxIdNum finds the highest numeric suffix for counter sync', () => {
    expect(maxIdNum([{ id: 'h1' }, { id: 'h7' }, { id: 'h12' }], /^h(\d+)$/)).toBe(12);
    expect(maxIdNum([{ id: 'x9' }], /^h(\d+)$/)).toBe(0);
    expect(maxIdNum([], /^h(\d+)$/)).toBe(0);
  });

  test('TOMBSTONES_KEY is distinct from all collection keys', () => {
    const collectionKeys = ['patients', 'doctors', 'healthWorkers', 'staffUsers', 'hospitals', 'referrals', 'appointments', 'followups', 'notifications', 'referralEvents', 'consultations', 'vitals', 'healthRecords', 'medicineStock', 'diagnostics', 'villageAccessScores', 'referralPredictions'];
    expect(collectionKeys).not.toContain(TOMBSTONES_KEY);
  });

  test('deleted doctor disappears from a stale device merge on reconnect', () => {
    // Full end-to-end tombstone flow:
    // 1. Device A and B both have doc d1; device A deletes it.
    const doc = { id: 'd1', userId: 'ustaff-doc1', name: 'Dr. Arun' };
    const deletedKeys = new Set([mergeKeyOf(doc)]);
    // 2. Device B adopts a stale cloud payload that still contains d1.
    const staleCloud = [doc, { id: 'd2', userId: 'ustaff-doc2', name: 'Dr. Priya' }];
    const localOnB = [{ id: 'd2', userId: 'ustaff-doc2', name: 'Dr. Priya' }];
    // 3. Merge with tombstone filtering — d1 must NOT reappear.
    const merged = mergeCollections(
      filterTombstoned(staleCloud, deletedKeys),
      filterTombstoned(localOnB, deletedKeys),
    );
    expect(merged.map(d => d.id)).toEqual(['d2']);
  });
});

describe('cloudData helpers', () => {
  test('wrap/unwrap round-trips an array', () => {
    const items = [
      { id: 'h1', name: 'Pudukkottai Government Hospital', status: 'active' },
      { id: 'h2', name: 'Alangudi Primary Health Centre', status: 'active' },
    ];
    const wrapped = wrapForCloud(items);
    const unwrapped = unwrapFromCloud<typeof items[0]>(wrapped);
    expect(unwrapped).not.toBeNull();
    expect(unwrapped).toEqual(items);
  });

  test('payload from device A is readable on device B (same JSON round-trip)', () => {
    const created = { id: 'h6', hospitalId: 'HOS-PDK-006', adminUsername: 'hosadmin.pdk006' };
    // Simulate: serialize on device A, transmit, deserialize on device B
    const wire = JSON.parse(wrapForCloud([created]));
    const onDeviceB = unwrapFromCloud(JSON.stringify(wire));
    expect(onDeviceB).toEqual([created]);
  });

  test('unwrap rejects records written by a different version', () => {
    const stale = JSON.stringify({ v: 'v4-old-version', items: [{ id: 'h1' }] });
    expect(unwrapFromCloud(stale)).toBeNull();
  });

  test('unwrap rejects malformed / non-string input', () => {
    expect(unwrapFromCloud(null)).toBeNull();
    expect(unwrapFromCloud(undefined)).toBeNull();
    expect(unwrapFromCloud(42)).toBeNull();
    expect(unwrapFromCloud({ v: DATA_VERSION, items: [] })).toBeNull(); // object, not string
    expect(unwrapFromCloud('not json{')).toBeNull();
  });

  test('unwrap rejects wrong envelope shape', () => {
    expect(unwrapFromCloud(JSON.stringify({ v: DATA_VERSION }))).toBeNull(); // missing items
    expect(unwrapFromCloud(JSON.stringify({ v: DATA_VERSION, items: 'nope' }))).toBeNull();
  });

  test('empty array round-trips (valid seed state)', () => {
    expect(unwrapFromCloud(wrapForCloud([]))).toEqual([]);
  });
});

describe('mergeKeyOf', () => {
  test('prefers id', () => {
    expect(mergeKeyOf({ id: 'h1', name: 'x' })).toBe('id:h1');
  });
  test('falls back to villageId for village access scores', () => {
    expect(mergeKeyOf({ villageId: 'v1', overallScore: 50 })).toBe('vid:v1');
  });
  test('falls back to referralId for referral predictions (no id field)', () => {
    expect(mergeKeyOf({ referralId: 'r1', completionProbability: 80 })).toBe('rid:r1');
  });
  test('uses JSON identity for records with no key fields', () => {
    const item = { foo: 'bar' };
    expect(mergeKeyOf(item)).toBe(`j:${JSON.stringify(item)}`);
  });
});

describe('mergeCollections (regression: unbounded growth)', () => {
  test('cloud wins for shared keys', () => {
    const cloud = [{ id: 'h1', name: 'From Cloud' }];
    const local = [{ id: 'h1', name: 'Stale Local' }];
    expect(mergeCollections(cloud, local)).toEqual(cloud);
  });
  test('local-only records survive (offline work is not wiped)', () => {
    const cloud = [{ id: 'h1', name: 'Cloud' }];
    const local = [{ id: 'h2', name: 'Made Offline' }];
    expect(mergeCollections(cloud, local)).toEqual([...cloud, ...local]);
  });
  test('id-less collections (referralPredictions) dedupe by referralId instead of duplicating', () => {
    const cloud = [{ referralId: 'r1', completionProbability: 80 }, { referralId: 'r2', completionProbability: 60 }];
    // Repeated adopts with the same local list must stay at 2 records, not grow.
    let result = cloud;
    for (let i = 0; i < 5; i++) {
      result = mergeCollections(result, cloud);
    }
    expect(result).toEqual(cloud);
    expect(result.length).toBe(2);
  });
  test('village scores dedupe by villageId', () => {
    const cloud = [{ villageId: 'v1', overallScore: 55 }];
    const local = [{ villageId: 'v1', overallScore: 50 }, { villageId: 'v2', overallScore: 70 }];
    const merged = mergeCollections(cloud, local);
    expect(merged.length).toBe(2);
    expect(merged[0].overallScore).toBe(55); // cloud wins
  });
  test('repeated merge of a full hospital collection stays bounded', () => {
    const hospitals = Array.from({ length: 50 }, (_, i) => ({ id: `h${i + 1}`, name: `Hospital ${i + 1}` }));
    let result = hospitals;
    for (let i = 0; i < 10; i++) result = mergeCollections(result, hospitals);
    expect(result.length).toBe(50);
  });
});

describe('payload size guard', () => {
  test('normal-size payload passes', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, data: 'x'.repeat(100) }));
    expect(safePayload(items)).not.toBeNull();
  });
  test('oversized payload is rejected (would exceed Convex 1 MiB doc limit)', () => {
    const items = [{ id: 'big', blob: 'x'.repeat(MAX_CLOUD_PAYLOAD_BYTES + 1024) }];
    expect(safePayload(items)).toBeNull();
  });
  test('payloadSizeBytes matches wrapForCloud encoding', () => {
    const items = [{ id: 'a' }];
    expect(payloadSizeBytes(items)).toBe(new TextEncoder().encode(wrapForCloud(items)).length);
  });
  test('limit leaves safety margin under Convex 1 MiB', () => {
    expect(MAX_CLOUD_PAYLOAD_BYTES).toBeLessThan(1024 * 1024);
  });
});
