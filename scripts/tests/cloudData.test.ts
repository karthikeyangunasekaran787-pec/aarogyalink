/**
 * Unit tests for src/contexts/cloudData.ts — run with: bun test
 * (Files live under scripts/tests so Vite's tsconfig doesn't pick them up as app code.)
 */
import { describe, expect, test } from 'bun:test';
import {
  DATA_VERSION, wrapForCloud, unwrapFromCloud,
  mergeKeyOf, mergeCollections, safePayload, payloadSizeBytes, MAX_CLOUD_PAYLOAD_BYTES,
} from '../../src/contexts/cloudData';

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
