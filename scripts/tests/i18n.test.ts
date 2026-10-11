/**
 * Multilingual support — run with: bun test
 *
 * The language selector was reported as "only some parts change". These tests
 * pin the parts that make the selector actually work:
 *
 *   - all three dictionaries carry every key (a missing key would surface as a
 *     raw key or English text in a translated page),
 *   - translation is a pure lookup with interpolation and an English fallback,
 *   - the preference round-trips through storage and defaults to English,
 *   - referral statuses have one translated label each,
 *   - the patient navigation is six keys, all translatable.
 */
import { describe, expect, test } from 'bun:test';

// The language preference is stored in localStorage. A tiny in-process stub is
// enough here (and avoids fighting the other test files over happy-dom's
// single global registration).
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const storage = new MemoryStorage();
if (!(globalThis as { localStorage?: Storage }).localStorage) {
  (globalThis as { localStorage?: Storage }).localStorage = storage;
}

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  isLanguage,
  languageName,
  t,
  translationKeys,
  translations,
  type Language,
} from '../../src/lib/i18n';
import {
  LANGUAGE_PREFERENCE_KEY,
  readStoredLanguage,
  writeStoredLanguage,
} from '../../src/lib/language-preference';
import { PATIENT_MORE_NAV, PATIENT_NAV } from '../../src/lib/patient-nav';
import {
  nextReferralStatus,
  referralStatusKey,
  referralStepNumber,
} from '../../src/lib/referral-labels';
import { REFERRAL_STEPS, REFERRAL_STATUS } from '../../src/convex/referralStatus';

const LANGUAGES_UNDER_TEST: Language[] = ['en', 'ta', 'hi'];

describe('translation dictionaries', () => {
  test('English, Tamil and Hindi are the supported languages', () => {
    expect(LANGUAGES.map(l => l.code)).toEqual(['en', 'ta', 'hi']);
    expect(DEFAULT_LANGUAGE).toBe('en');
    expect(languageName('ta')).toBe('தமிழ்');
    expect(languageName('hi')).toBe('हिन्दी');
  });

  test('every key exists in all three languages', () => {
    const english = Object.keys(translations.en).sort();
    for (const language of LANGUAGES_UNDER_TEST) {
      const keys = Object.keys(translations[language]).sort();
      expect(`${language}:${keys.length}`).toBe(`${language}:${english.length}`);
      expect(keys).toEqual(english);
    }
    expect(english.length).toBeGreaterThan(200);
  });

  test('no value is empty, and no value leaks a raw key', () => {
    for (const language of LANGUAGES_UNDER_TEST) {
      for (const key of translationKeys()) {
        const value = translations[language][key];
        expect(`${language}.${key}=${JSON.stringify(value)}`).not.toBe(`${language}.${key}=""`);
        // A value identical to its own key would render as "welcomeBackName".
        expect(value).not.toBe(key);
      }
    }
  });

  test('an unknown language falls back to English instead of a raw key', () => {
    for (const key of translationKeys()) {
      // A stale/unknown code (or a component with no language in scope) must
      // never print the key itself.
      expect(t(key, 'de' as Language)).toBe(translations.en[key]);
    }
  });

  test('interpolation fills placeholders in every language', () => {
    for (const language of LANGUAGES_UNDER_TEST) {
      const rendered = t('progressSteps', language, { completed: 2, total: 9 });
      expect(rendered).toContain('2');
      expect(rendered).toContain('9');
      expect(rendered).not.toContain('{');
      expect(rendered).not.toContain('}');
    }
    const greeting = t('welcomeBackName', 'ta', { name: 'Lakshmi' });
    expect(greeting).toContain('Lakshmi');
    expect(greeting).not.toContain('{name}');
  });

  test('a placeholder with no value is left visible rather than blanked', () => {
    expect(t('progressSteps', 'en')).toContain('{completed}');
  });

  test('Tamil and Hindi are real scripts, not transliterated English', () => {
    // A sample of patient-facing strings must be written in the target script.
    const tamilKeys = ['welcomeBackName', 'myReferrals', 'myHealthCard', 'noReferralsYet', 'logout'];
    const hindiKeys = ['welcomeBackName', 'myReferrals', 'myHealthCard', 'noReferralsYet', 'logout'];
    for (const key of tamilKeys) {
      expect(translations.ta[key]).toMatch(/[\u0B80-\u0BFF]/);
    }
    for (const key of hindiKeys) {
      expect(translations.hi[key]).toMatch(/[\u0900-\u097F]/);
    }
    // The brief's exact empty-state wording survives a future re-translation.
    expect(translations.en.noReferralsYet).toBe('No referrals yet.');
    expect(translations.ta.noReferralsYet).toBe('இதுவரை பரிந்துரைகள் எதுவும் இல்லை.');
    expect(translations.hi.noReferralsYet).toBe('अभी तक कोई रेफरल नहीं है।');
  });

  test('brand names and identifiers are never translated', () => {
    for (const language of LANGUAGES_UNDER_TEST) {
      expect(translations[language].appName).toBe('AarogyaLink');
      expect(translations[language].navHealthCard.length).toBeGreaterThan(0);
    }
  });
});

describe('language preference persistence', () => {
  test('nothing stored means English', () => {
    localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
    expect(readStoredLanguage()).toBe('en');
  });

  test('a selected language is stored and restored', () => {
    for (const language of LANGUAGES_UNDER_TEST) {
      writeStoredLanguage(language);
      expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe(language);
      expect(readStoredLanguage()).toBe(language);
    }
  });

  test('a corrupted or unsupported value falls back to English', () => {
    for (const junk of ['de', 'EN', '', '{"lang":"ta"}', 'tamil']) {
      localStorage.setItem(LANGUAGE_PREFERENCE_KEY, junk);
      expect(readStoredLanguage()).toBe('en');
    }
    expect(isLanguage('ta')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  });

  test('the preference key is separate from the auth session', () => {
    expect(LANGUAGE_PREFERENCE_KEY).not.toContain('auth');
    expect(LANGUAGE_PREFERENCE_KEY).toBe('aal_language');
  });
});

describe('referral status labels', () => {
  test('every canonical status has one translation key', () => {
    for (const status of Object.values(REFERRAL_STATUS)) {
      const key = referralStatusKey(status);
      expect(key).not.toBe('currentStatus');
      // The label resolves in every language and is never the raw status value.
      for (const language of LANGUAGES_UNDER_TEST) {
        expect(t(key, language)).not.toBe(status);
      }
    }
  });

  test('the labels are the workflow wording the brief asks for', () => {
    expect(t(referralStatusKey(REFERRAL_STATUS.CREATED), 'en')).toBe('Created');
    expect(t(referralStatusKey(REFERRAL_STATUS.DOCTOR_ASSIGNED), 'en')).toBe('Doctor Assigned');
    expect(t(referralStatusKey(REFERRAL_STATUS.ARRIVAL_VERIFIED), 'en')).toBe('Arrival Verified');
    expect(t(referralStatusKey(REFERRAL_STATUS.CLOSED), 'en')).toBe('Referral Closed');
  });

  test('the next step is the successor in the real chain, and null at the end', () => {
    expect(referralStepNumber(REFERRAL_STATUS.CREATED)).toBe(1);
    expect(nextReferralStatus(REFERRAL_STATUS.CREATED)).toBe(REFERRAL_STATUS.ACCEPTED);
    expect(nextReferralStatus(REFERRAL_STATUS.FOLLOW_UP)).toBe(REFERRAL_STATUS.CLOSED);
    expect(nextReferralStatus(REFERRAL_STATUS.CLOSED)).toBeNull();
    expect(nextReferralStatus('not_a_status')).toBeNull();
    // Every non-terminal step must resolve to a real successor.
    for (const step of REFERRAL_STEPS.slice(0, -1)) {
      expect(nextReferralStatus(step.status)).toBe(
        REFERRAL_STEPS[REFERRAL_STEPS.findIndex(s => s.status === step.status) + 1].status,
      );
    }
  });

  test('an unknown status falls back to a generic label, never a raw key', () => {
    expect(t(referralStatusKey('something_else'), 'ta')).not.toBe('currentStatus');
  });
});

describe('patient navigation', () => {
  test('exactly the six requested destinations, in order', () => {
    expect(PATIENT_NAV.map(item => item.path)).toEqual([
      '/patient/dashboard',
      '/patient/health-card',
      '/patient/referrals',
      '/patient/reports',
      '/patient/appointments',
      '/patient/profile',
    ]);
  });

  test('every navigation label translates in all three languages', () => {
    for (const item of [...PATIENT_NAV, ...PATIENT_MORE_NAV]) {
      for (const language of LANGUAGES_UNDER_TEST) {
        const label = t(item.label, language);
        expect(label).not.toBe(item.label);
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  test('no destination appears twice', () => {
    const paths = [...PATIENT_NAV, ...PATIENT_MORE_NAV].map(item => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test('secondary pages stay reachable under "More"', () => {
    const more = PATIENT_MORE_NAV.map(item => item.path);
    expect(more).toContain('/patient/facilities');
    expect(more).toContain('/patient/privacy');
  });
});
