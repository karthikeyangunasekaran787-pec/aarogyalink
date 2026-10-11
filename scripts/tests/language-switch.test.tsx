/**
 * Language switching, driven through the real language store — bun test
 *
 * The dictionaries can be perfectly translated and the selector can still be
 * broken, which is exactly what was reported: "the page stays in English, or
 * only some parts change". This test drives the ACTUAL store and hook that the
 * whole app reads from:
 *
 *   - selecting a language changes it immediately, in the same tick, with no
 *     reload and no re-navigation,
 *   - every component using the hook re-renders in the new language,
 *   - the choice is persisted and restored by a fresh "page load",
 *   - unrelated state changes never touch the language,
 *   - switching back to English works,
 *   - the preference is stored apart from the auth session,
 *   - <html lang> follows the selection (Tamil/Devanagari fonts + a11y).
 *
 * WHY NOT AppProvider: other test files register process-global
 * `mock.module('.../contexts/AppContext')` stubs for the role dashboards, and
 * Bun shares module mocks across files in one run. The language store is the
 * real single source of truth for the language and is never mocked, so this
 * test measures the app's real behaviour in a full-suite run as well as alone.
 * The provider's wiring to the store is asserted at the bottom.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (!(globalThis as { happyDOM?: unknown }).happyDOM) GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { Root } from 'react-dom/client';

const { act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useTranslation } = await import('../../src/hooks/use-translation');
const {
  applyLanguage,
  getLanguageSnapshot,
  resetLanguageStoreForTests,
} = await import('../../src/lib/language-store');
const { t } = await import('../../src/lib/i18n');
const { LANGUAGE_PREFERENCE_KEY } = await import('../../src/lib/language-preference');
const { AUTH_SESSION_KEY } = await import('../../src/lib/session');

let container: HTMLDivElement | undefined;
let root: Root | undefined;
/** Counts renders of the translated label, to prove a real re-render. */
let labelRenders = 0;

/**
 * What a page looks like: several translated strings plus one piece of
 * unrelated local state, so we can prove that opening/using other UI (a modal,
 * a tab, a form) never disturbs the language.
 */
function Probe() {
  const { t, language } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  labelRenders += 1;

  return (
    <div>
      <span data-testid="lang">{language}</span>
      <span data-testid="label">{t('myReferrals')}</span>
      <span data-testid="heading">{t('selectYourRole')}</span>
      <span data-testid="empty">{t('noReferralsYet')}</span>
      <span data-testid="sidebar">{sidebarOpen ? 'open' : 'closed'}</span>
      <button data-testid="ta" onClick={() => applyLanguage('ta')}>ta</button>
      <button data-testid="hi" onClick={() => applyLanguage('hi')}>hi</button>
      <button data-testid="en" onClick={() => applyLanguage('en')}>en</button>
      {/* An unrelated UI action: it must not disturb the language. */}
      <button data-testid="toggle-sidebar" onClick={() => setSidebarOpen(open => !open)}>sidebar</button>
    </div>
  );
}

async function mount() {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mountedRoot = createRoot(element);
  container = element;
  root = mountedRoot;
  await act(async () => {
    mountedRoot.render(<Probe />);
  });
}

async function unmount() {
  const currentRoot = root;
  const currentContainer = container;
  root = undefined;
  container = undefined;
  if (currentRoot) await act(async () => { currentRoot.unmount(); });
  currentContainer?.remove();
}

function text(testid: string): string {
  const found = document.querySelector(`[data-testid="${testid}"]`);
  if (!found) throw new Error(`no element for ${testid}`);
  return found.textContent ?? '';
}

async function click(testid: string) {
  const found = document.querySelector<HTMLButtonElement>(`[data-testid="${testid}"]`);
  if (!found) throw new Error(`no button for ${testid}`);
  await act(async () => {
    found.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
  // A fresh module-level store is exactly what loading the page in a new tab
  // does; the persisted preference is left untouched on purpose.
  resetLanguageStoreForTests();
  labelRenders = 0;
});

afterEach(async () => {
  await unmount();
  localStorage.removeItem(LANGUAGE_PREFERENCE_KEY);
  resetLanguageStoreForTests();
});

describe('the language selector changes the app immediately', () => {
  test('English is the default when nothing has been chosen', async () => {
    await mount();
    expect(text('lang')).toBe('en');
    expect(text('label')).toBe('My Referrals');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBeNull();
  });

  test('selecting Tamil re-renders the page in Tamil, with no reload', async () => {
    await mount();
    const before = labelRenders;

    await click('ta');

    expect(text('lang')).toBe('ta');
    expect(text('label')).toBe('என் பரிந்துரைகள்');
    expect(text('heading')).toBe('உங்கள் பங்கைத் தேர்ந்தெடுக்கவும்');
    // A real re-render happened rather than a stale tree being re-read.
    expect(labelRenders).toBeGreaterThan(before);
    // Every consumer of the hook followed, not just one label.
    expect(text('empty')).toBe(t('noReferralsYet', 'ta'));
    expect(text('empty')).not.toBe('No referrals yet');
  });

  test('every translated string on the page changes, not only the selector', async () => {
    await mount();
    const englishBefore = {
      label: text('label'),
      heading: text('heading'),
      empty: text('empty'),
    };

    await click('ta');
    expect(text('label')).not.toBe(englishBefore.label);
    expect(text('heading')).not.toBe(englishBefore.heading);
    expect(text('empty')).not.toBe(englishBefore.empty);
  });

  test('English → Tamil → Hindi → English all work', async () => {
    await mount();

    await click('ta');
    expect(text('label')).toBe('என் பரிந்துரைகள்');

    await click('hi');
    expect(text('lang')).toBe('hi');
    expect(text('label')).toBe('मेरे रेफरल');

    await click('en');
    expect(text('lang')).toBe('en');
    expect(text('label')).toBe('My Referrals');
  });

  test('the document language follows the selection', async () => {
    await mount();
    expect(document.documentElement.lang).toBe('en');
    await click('hi');
    expect(document.documentElement.lang).toBe('hi');
    await click('en');
    expect(document.documentElement.lang).toBe('en');
  });

  test('an unrelated UI action does not change the language', async () => {
    await mount();
    await click('ta');
    expect(text('lang')).toBe('ta');

    await click('toggle-sidebar');

    expect(text('sidebar')).toBe('closed');
    expect(text('lang')).toBe('ta');
    expect(text('label')).toBe('என் பரிந்துரைகள்');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe('ta');
  });
});

describe('the preference survives a reload', () => {
  test('a fresh store restores the saved language without a flash of English', async () => {
    await mount();
    await click('hi');
    await unmount();

    // Reloading the page throws the in-memory store away and re-reads storage.
    resetLanguageStoreForTests();
    expect(getLanguageSnapshot()).toBe('hi');

    await mount();
    expect(text('lang')).toBe('hi');
    expect(text('label')).toBe('मेरे रेफरल');
  });

  test('the preference is written on change and is not part of the auth session', async () => {
    await mount();
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBeNull();

    await click('ta');
    expect(localStorage.getItem(LANGUAGE_PREFERENCE_KEY)).toBe('ta');
    // Signing out must never take the language with it, and signing in must
    // never overwrite it: the two are stored under different keys.
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(readFileSync(resolve('src/lib/language-preference.ts'), 'utf8'))
      .toContain("LANGUAGE_PREFERENCE_KEY = 'aal_language'");
  });

  test('an unsupported stored value falls back to English', async () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, 'fr');
    resetLanguageStoreForTests();
    await mount();
    expect(text('lang')).toBe('en');
  });
});

describe('the app is wired to the language store', () => {
  const appContext = readFileSync(resolve('src/contexts/AppContext.tsx'), 'utf8');
  const hook = readFileSync(resolve('src/hooks/use-translation.ts'), 'utf8');

  test('the provider publishes the store language, and setLanguage is its only writer', () => {
    expect(appContext).toContain('useLanguage()');
    expect(appContext).toContain('applyLanguage(lang)');
    // The old bug: a hardcoded/independent language state inside the provider.
    expect(appContext).not.toContain("useState<Language>");
  });

  test('the translation hook reads the store, so no provider can be out of step', () => {
    expect(hook).toContain('useSyncExternalStore');
    expect(hook).toContain('subscribeToLanguage');
    expect(hook).toContain('getLanguageSnapshot');
  });

  test('no page passes a hardcoded language into the translation function', () => {
    const pages = [
      'src/components/layout/AppLayout.tsx',
      'src/pages/patient/Home.tsx',
      'src/pages/patient/Referrals.tsx',
      'src/pages/patient/HealthCard.tsx',
      'src/pages/patient/Reports.tsx',
      'src/pages/patient/Appointments.tsx',
      'src/pages/RoleSelect.tsx',
      'src/pages/Auth.tsx',
    ];
    for (const page of pages) {
      const source = readFileSync(resolve(page), 'utf8');
      expect(source).not.toMatch(/t\([^)]*,\s*'(en|ta|hi)'\s*\)/);
    }
  });
});

afterAll(() => {
  resetLanguageStoreForTests();
});
