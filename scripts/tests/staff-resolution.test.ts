/**
 * Unit tests for src/lib/resolve-staff.ts — run with: bun test
 *
 * These helpers back the Health Worker / Doctor dashboard SHELLS. The shell
 * shape matters: the record can arrive after the first render (cloud sync on a
 * device that has never seen it), and the previous inline resolution returned
 * early from the same component that owns all the state hooks — changing the
 * hook order and crashing the page. Resolution is therefore pure and testable.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  recordsOrCache,
  resolveDoctor,
  resolveHealthWorker,
  type StaffLike,
} from '../../src/lib/resolve-staff';

const USER = { id: 'ustaff-hw1', name: 'Priya' };

describe('resolveHealthWorker', () => {
  test('matches the health worker record by userId', () => {
    const records = [
      { id: 'hw1', userId: 'ustaff-hw1', name: 'Priya', facilityId: 'h1' },
      { id: 'hw2', userId: 'ustaff-hw2', name: 'Anitha', facilityId: 'h3' },
    ];
    expect(resolveHealthWorker(records, USER)?.id).toBe('hw1');
  });

  test('falls back to a name match (case-insensitive)', () => {
    const records = [{ id: 'hw9', name: 'priya', facilityId: 'h1' }];
    expect(resolveHealthWorker(records, USER)?.id).toBe('hw9');
  });

  test('returns undefined when the record has not arrived yet (shell shows the notice, no crash)', () => {
    // This is the state right after a cloud deploy on a fresh device: the
    // seeded list does not contain a NEWLY created health worker.
    expect(resolveHealthWorker([], USER)).toBeUndefined();
    expect(resolveHealthWorker([{ id: 'hw1', name: 'Someone Else', facilityId: 'h1' }], USER)).toBeUndefined();
  });

  test('a record that arrives later is resolved on the next attempt', () => {
    const newlyCreated = { id: 'hw7', userId: 'ustaff-hw1', name: 'Priya', facilityId: 'h4' };
    expect(resolveHealthWorker([], USER)).toBeUndefined();
    expect(resolveHealthWorker([newlyCreated], USER)?.id).toBe('hw7');
  });

  test('no signed-in user → no record', () => {
    expect(resolveHealthWorker([{ id: 'hw1', name: 'Priya' }], null)).toBeUndefined();
    expect(resolveHealthWorker([{ id: 'hw1', name: 'Priya' }], undefined)).toBeUndefined();
  });
});

describe('resolveDoctor', () => {
  const staff: StaffLike[] = [{ id: 'ustaff-doc1', name: 'Arun Kumar', facilityId: 'h1' }];
  const user = { id: 'ustaff-doc1', name: 'Arun Kumar' };

  test('matches by userId first', () => {
    const records = [{ id: 'd1', userId: 'ustaff-doc1', name: 'Arun Kumar', facilityId: 'h1' }];
    expect(resolveDoctor(records, user, staff)?.id).toBe('d1');
  });

  test('matches the staff account when the doctor record carries no userId', () => {
    const records = [{ id: 'd5', name: 'Arun Kumar', facilityId: 'h1' }];
    expect(resolveDoctor(records, user, staff)?.id).toBe('d5');
  });

  test('hospital isolation: a same-named doctor at another facility is NOT adopted', () => {
    const records = [{ id: 'dOther', name: 'Arun Kumar', facilityId: 'h9' }];
    expect(resolveDoctor(records, user, staff)).toBeUndefined();
  });

  test('matches by name + facility when ids differ', () => {
    const records = [
      { id: 'dOther', name: 'Arun Kumar', facilityId: 'h2' },
      { id: 'dMine', name: 'arun kumar', facilityId: 'h1' },
    ];
    expect(resolveDoctor(records, user, staff)?.id).toBe('dMine');
  });

  test('never matches a doctor from another hospital by name alone', () => {
    const records = [{ id: 'dOther', name: 'Arun Kumar', facilityId: 'h2' }];
    expect(resolveDoctor(records, user, staff)).toBeUndefined();
  });

  test('returns undefined when no doctor profile exists yet', () => {
    expect(resolveDoctor([], user, staff)).toBeUndefined();
    expect(resolveDoctor([], null, staff)).toBeUndefined();
  });
});

describe('recordsOrCache (device cache fallback)', () => {
  const KEY = 'aal_doctors';
  const original = globalThis.localStorage;

  beforeEach(() => {
    const store = new Map<string, string>([
      [KEY, JSON.stringify([{ id: 'dCached', userId: 'ustaff-doc1', name: 'Arun Kumar', facilityId: 'h1' }])],
    ]);
    (globalThis as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: store.size,
    };
  });

  afterEach(() => {
    (globalThis as { localStorage: unknown }).localStorage = original;
  });

  test('uses context records when present', () => {
    const live = [{ id: 'dLive', name: 'Arun Kumar', facilityId: 'h1' }];
    expect(recordsOrCache(live, KEY)[0].id).toBe('dLive');
  });

  test('falls back to this device cache while cloud data is still loading', () => {
    expect(recordsOrCache([], KEY)[0].id).toBe('dCached');
    expect(resolveDoctor(recordsOrCache([], KEY), { id: 'ustaff-doc1', name: 'Arun Kumar' }, [])?.id).toBe('dCached');
  });

  test('survives corrupted cache and missing storage without throwing', () => {
    globalThis.localStorage.setItem(KEY, '{not json');
    expect(recordsOrCache([], KEY)).toEqual([]);
    (globalThis as { localStorage: unknown }).localStorage = undefined;
    expect(recordsOrCache([], KEY)).toEqual([]);
  });
});
