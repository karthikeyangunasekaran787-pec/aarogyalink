// ============================================================================
// AarogyaLink — translation hook
// ----------------------------------------------------------------------------
// One reason the language selector appeared "broken": every surface had to
// remember to pass the current language into `t(key, language)`, and almost
// none of them did, so the UI stayed English. This hook reads the language from
// the app-wide language store instead, which means:
//
//   - a language change re-renders every consumer in the same tick (the store
//     notifies React through useSyncExternalStore — no refresh, no reload),
//   - components never hold their own copy of the language, so opening a modal,
//     switching a tab or submitting a form cannot reset it,
//   - nested routes and shared components all read the same value, whether or
//     not they happen to sit under a particular provider.
// ============================================================================

import { useCallback, useSyncExternalStore } from 'react';

import {
  t as translate,
  type Language,
  type TranslationKey,
  type TranslationVars,
} from '@/lib/i18n';
import {
  getLanguageSnapshot,
  getServerLanguageSnapshot,
  subscribeToLanguage,
} from '@/lib/language-store';

export interface Translation {
  /** Translate a key into the currently selected language. */
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  /** The language in effect, for `lang` attributes and locale formatting. */
  language: Language;
}

/** The language currently selected, re-rendering the caller when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeToLanguage, getLanguageSnapshot, getServerLanguageSnapshot);
}

export function useTranslation(): Translation {
  const language = useLanguage();

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => translate(key, language, vars),
    [language],
  );

  return { t, language };
}
