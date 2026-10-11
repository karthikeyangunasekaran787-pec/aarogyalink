// ============================================================================
// AarogyaLink — the selected language, as one app-wide store
// ----------------------------------------------------------------------------
// WHY THIS EXISTS
//
// The reported bug was "the language selector changes its label but the page
// stays English". Two implementation shapes cause that:
//
//   1. the language lives in one provider's private state, so a component that
//      does not sit under that provider (or holds a stale copy) never changes;
//   2. each screen has to remember to pass the language into `t(key, language)`,
//      and most of them forget.
//
// The chosen language is a property of the DEVICE and the PERSON using it, not
// of a screen, a route or an account. So it lives here, in a single module-level
// store that:
//
//   - any component can subscribe to (React reads it with
//     `useSyncExternalStore`, so a change re-renders every consumer at once),
//   - survives navigation, modals, tab switches and form submissions because
//     nothing else can write to it,
//   - is restored from storage before the first paint,
//   - keeps `<html lang>` in step, which is what gives Tamil and Devanagari the
//     right font, line breaking and screen-reader pronunciation,
//   - is deliberately separate from the auth session and the offline-first
//     cloud collections: signing out, syncing or opening a record can never
//     change it.
//
// Only the language selector calls `applyLanguage`. Nothing in the app infers a
// language from navigation, authentication state, or content.
// ============================================================================

import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/lib/i18n';
import { readStoredLanguage, writeStoredLanguage } from '@/lib/language-preference';

type Listener = () => void;

/** The language, or null before the stored preference has been read. */
let current: Language | null = null;

const listeners = new Set<Listener>();

/** Reflect the language on <html> for fonts, line breaking and a11y. */
function applyDocumentLanguage(language: Language): void {
  try {
    document.documentElement.lang = language;
  } catch {
    /* no document (SSR, unit tests without a DOM) — nothing to update */
  }
}

/** Read the stored preference once, so the very first paint is already right. */
function initialise(): Language {
  if (current === null) {
    current = readStoredLanguage();
    applyDocumentLanguage(current);
  }
  return current;
}

/**
 * The language in effect. Suitable as `useSyncExternalStore`'s
 * `getSnapshot`/`getServerSnapshot`.
 */
export function getLanguageSnapshot(): Language {
  return initialise();
}

/** Before hydration the store cannot read storage, so English is assumed. */
export function getServerLanguageSnapshot(): Language {
  return DEFAULT_LANGUAGE;
}

/** Subscribe to language changes. Returns the unsubscribe function. */
export function subscribeToLanguage(listener: Listener): () => void {
  initialise();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Change the language. The ONLY writer: called from the language selector.
 *
 * Returns the language now in effect, which is useful in tests and when the
 * caller passes something invalid.
 */
export function applyLanguage(language: Language, options?: { persist?: boolean }): Language {
  const previous = initialise();
  if (!isLanguage(language) || language === previous) return previous;
  current = language;
  if (options?.persist !== false) writeStoredLanguage(language);
  applyDocumentLanguage(language);
  // Copy first: a listener may unsubscribe while we are notifying.
  for (const listener of [...listeners]) listener();
  return language;
}

/**
 * Drop the in-memory language so the next read comes from storage again.
 * Used by tests that need a fresh "page load"; the persisted preference is
 * untouched, which is the whole point of a reload test.
 */
export function resetLanguageStoreForTests(): void {
  current = null;
  listeners.clear();
}
