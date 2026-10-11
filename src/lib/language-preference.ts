// ============================================================================
// AarogyaLink - Persisted language preference
// ----------------------------------------------------------------------------
// The selected language belongs to the person using the device, not to their
// account or their clinical record, so it is stored on its own in localStorage
// under a key that has nothing to do with the auth session or the shared
// cloud collections. That keeps it working when signed out, and keeps it out
// of the offline-first sync (a language change on one phone must never rewrite
// another device's records).
//
// Kept dependency-light so it can be unit tested without a DOM.
// ============================================================================

import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/lib/i18n';

export const LANGUAGE_PREFERENCE_KEY = 'aal_language';

/** The saved language, or English when nothing valid is stored. */
export function readStoredLanguage(): Language {
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (isLanguage(raw)) return raw;
  } catch {
    /* storage unavailable (private mode, SSR) — fall back to the default */
  }
  return DEFAULT_LANGUAGE;
}

/** Persist the selected language. */
export function writeStoredLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, language);
  } catch {
    /* quota exceeded / private mode — the app still uses it for this session */
  }
}
