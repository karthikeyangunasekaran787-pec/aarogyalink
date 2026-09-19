/**
 * Targeted unit tests for the stability round — run with: bun test
 *
 * Covers:
 *   PHASE 24 — duplicate prevention: a repeated submit inside the guard window
 *              is dropped, a later deliberate submit is allowed
 *   PHASE 11 — append-only vitals/records get collision-proof ids, so two
 *              readings saved in the SAME millisecond both survive the
 *              cross-device merge (duplicate ids would be silently dropped)
 */
import { describe, expect, test } from 'bun:test';
import { SUBMIT_GUARD_MS, isDuplicateSubmission } from '../../src/hooks/use-submit-guard';
import { uniqueRecordId } from '../../src/contexts/DataContext';
import { mergeKeyOf } from '../../src/contexts/cloudData';

describe('PHASE 24 — duplicate submit guard', () => {
  test('a double-click inside the window is blocked', () => {
    const firstClick = 1_000_000;
    // Second click 40ms later — same button press, must be ignored.
    expect(isDuplicateSubmission(firstClick, firstClick + 40)).toBe(true);
  });

  test('a deliberate second submission after the window is allowed', () => {
    const firstSubmit = 1_000_000;
    expect(isDuplicateSubmission(firstSubmit, firstSubmit + SUBMIT_GUARD_MS + 1)).toBe(false);
  });

  test('the very first call is never treated as a duplicate', () => {
    // lastSubmittedAt starts at 0 → now - 0 is far outside the window.
    expect(isDuplicateSubmission(0, Date.now())).toBe(false);
  });

  test('the guard window is short enough not to block real re-use', () => {
    expect(SUBMIT_GUARD_MS).toBeLessThanOrEqual(1000);
  });
});

describe('PHASE 11 — unique ids for append-only records', () => {
  test('two records created in the same millisecond get different ids', () => {
    const now = 1_700_000_000_000;
    const a = uniqueRecordId('v', now, 0.123456);
    const b = uniqueRecordId('v', now, 0.876543);
    expect(a).not.toBe(b);
  });

  test('id keeps its prefix and stays time-ordered by construction', () => {
    const a = uniqueRecordId('v', 1_000, 0.5);
    const b = uniqueRecordId('v', 2_000, 0.5);
    expect(a.startsWith('v')).toBe(true);
    expect(a < b).toBe(true);
  });

  test('historically distinct ids survive the merge as separate records', () => {
    const now = 1_700_000_000_000;
    // 10:00 and 12:00 readings, each with its own id → both must remain.
    const morning = { id: uniqueRecordId('v', now, 0.1), patientId: 'p1', bloodPressureSystolic: 120 };
    const noon = { id: uniqueRecordId('v', now + 7_200_000, 0.2), patientId: 'p1', bloodPressureSystolic: 130 };
    expect(mergeKeyOf(morning)).not.toBe(mergeKeyOf(noon));

    // Regression: the old `v${Date.now()}` ids collided in the same millisecond
    // and the merge would collapse them into one record.
    const oldA = { id: `v${now}`, patientId: 'p1' };
    const oldB = { id: `v${now}`, patientId: 'p1' };
    expect(mergeKeyOf(oldA)).toBe(mergeKeyOf(oldB));
  });

  test('a bulk of same-millisecond saves produces unique ids', () => {
    const now = 1_700_000_000_000;
    const randoms = [0.11, 0.42, 0.73, 0.19, 0.58, 0.91, 0.27, 0.64];
    const ids = new Set(randoms.map(r => uniqueRecordId('c', now, r)));
    expect(ids.size).toBe(randoms.length);
  });
});
