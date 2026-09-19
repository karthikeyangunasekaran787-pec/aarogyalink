// ============================================================================
// useSubmitGuard — blocks accidental duplicate submissions
// ----------------------------------------------------------------------------
// Save Patient / Save Vitals / Create Referral are synchronous handlers, so a
// fast double-click can dispatch the handler twice before React re-renders
// (which would create two records). This guard ignores any repeat call inside a
// short window, so the second click is dropped.
//
// The window is short enough that a deliberate second submission (e.g. taking a
// new vitals reading a few seconds later) is never blocked.
// ============================================================================

import { useCallback, useRef } from 'react';

/** Default guard window in milliseconds. */
export const SUBMIT_GUARD_MS = 700;

/** Pure predicate (exported for unit tests). */
export function isDuplicateSubmission(
  lastSubmittedAt: number,
  now: number,
  windowMs: number = SUBMIT_GUARD_MS,
): boolean {
  return now - lastSubmittedAt < windowMs;
}

/**
 * Returns a function that allows one call per window and ignores repeats.
 *
 *   const guardSubmit = useSubmitGuard();
 *   const handleSave = () => { if (!guardSubmit()) return; ...save... };
 */
export function useSubmitGuard(windowMs: number = SUBMIT_GUARD_MS): () => boolean {
  const lastRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (isDuplicateSubmission(lastRef.current, now, windowMs)) return false;
    lastRef.current = now;
    return true;
  }, [windowMs]);
}
