/**
 * Unit tests for src/contexts/cloudData.ts — run with: bun test
 * (Files live under scripts/tests so Vite's tsconfig doesn't pick them up as app code.)
 */
import { describe, expect, test } from 'bun:test';
import { DATA_VERSION, wrapForCloud, unwrapFromCloud } from '../../src/contexts/cloudData';

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
