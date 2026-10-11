/**
 * Content rules for the role-selection gateway (src/pages/RoleSelect.tsx).
 *
 * Renders the real component tree through react-dom/server, so anything `tsc`
 * cannot see — a bad hook call, a broken provider, a missing export — fails
 * here instead of showing a white screen in the browser.
 *
 * The expectations are derived from `@/lib/role-options` rather than retyped,
 * so the page cannot drift from the six roles or their names without this
 * test failing.
 *
 * The Three.js backdrop is mocked: WebGL cannot run in this environment and the
 * scene is lazy + decorative, so what matters here is the page itself.
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import { ROLE_OPTIONS } from '../../src/lib/role-options';

let currentRole: string | null = null;
const setCurrentRole = () => {};

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({ currentRole, setCurrentRole }),
}));

mock.module('../../src/components/three/HealthcareNetwork3D', () => ({
  default: () => null,
}));

const { default: RoleSelect } = await import('../../src/pages/RoleSelect');

const render = () =>
  renderToString(
    <MemoryRouter initialEntries={['/role-select']}>
      <RoleSelect />
    </MemoryRouter>,
  );

/** Text the visitor can actually read, with tags stripped. */
const visibleText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('Entry experience wiring', () => {
  // A page can be perfectly correct and still never be seen: `/` is what the
  // browser requests first, so these pin the two entry-level requirements —
  // the front door IS the gateway, and entering shows no loading state.
  test('entering `/` renders the gateway eagerly, with no loading screen', () => {
    const main = readFileSync(resolve(import.meta.dir, '../../src/main.tsx'), 'utf8');

    // The front door is the redesigned role-selection gateway...
    expect(main).toMatch(/<Route path="\/" element=\{<RoleSelect \/>\}/);

    // ...imported eagerly. A `lazy()` entry route would wait on a chunk fetch
    // and flash the RouteLoading spinner before anything painted.
    expect(main).not.toMatch(/RoleSelect = lazy\(/);

    // The frame covering module evaluation is static: no spinner, no progress
    // animation, no "loading" wording.
    const html = readFileSync(resolve(import.meta.dir, '../../index.html'), 'utf8');
    expect(html).not.toContain('boot-spinner');
    expect(html).not.toContain('@keyframes boot-fill');
    expect(html).not.toMatch(/>\s*Loading[^<]*<\//i);

    // The visitor must not be shown a logo (or any image) while the app loads:
    // the entry frame's markup is empty apart from its container.
    const body = html.slice(html.indexOf('<body>'));
    expect(body).not.toContain('<img');
    expect(body).not.toContain('aarogyalink-logo');
    expect(body).not.toContain('boot-name');
  });

  test('the branded entry frame keeps its failure message and retry', () => {
    // Removing the spinner must not remove the error path: if the bundle
    // never loads, the visitor still gets a readable message instead of a
    // silent frozen page.
    const html = readFileSync(resolve(import.meta.dir, '../../index.html'), 'utf8');
    expect(html).toContain('boot-error');
    expect(html).toContain('boot-retry');
    expect(html).toContain('unhandledrejection');
  });
});

describe('RoleSelect content', () => {
  test('shows only the brand, the heading, six roles and Continue', () => {
    currentRole = null;
    const html = render();
    const text = visibleText(html);

    // Brand block, kept compact. The official AarogyaLink lockup carries the
    // wordmark and tagline itself, so they are the image's accessible name
    // instead of being printed again underneath it.
    expect(html).toContain('AarogyaLink');
    expect(html).toContain('Closing the Rural Healthcare Loop');
    // Heading must be the spec wording.
    expect(text).toContain('Select your role');
    // The NEW brand lockup is used, and the retired circular-network logo files
    // are no longer referenced anywhere.
    expect(html).toContain('/assets/aarogyalink-logo-full.png');
    expect(html).not.toContain('aarogyalink-logo.jpeg');
    expect(text).toContain('Continue');

    // Every role, by name.
    for (const option of ROLE_OPTIONS) {
      expect(text).toContain(option.label);
    }
    expect(ROLE_OPTIONS.length).toBe(6);
  });

  test('a card carries the role name and no other copy', () => {
    currentRole = null;
    const text = visibleText(render());

    // Per-role explanations were removed by request.
    for (const phrase of [
      'Access your care',
      'Register & refer patients',
      'Consult & manage care',
      'Manage referrals & staff',
      'Monitor district healthcare',
      'Manage system & districts',
    ]) {
      expect(text).not.toContain(phrase);
    }

    // Strict version of the same rule: every word on the page must be one of
    // the heading, a role name or Continue — nothing else (the brand is the
    // lockup image, so it contributes no extra words).
    const allowed = new Set([
      'AarogyaLink',
      'Closing',
      'the',
      'Rural',
      'Healthcare',
      'Loop',
      'Select',
      'your',
      'role',
      'Continue',
      ...ROLE_OPTIONS.flatMap(option => option.label.split(' ')),
    ]);
    const unexpected = text
      .split(/\s+/)
      .map(word => word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
      .filter(Boolean)
      .filter(word => !allowed.has(word));

    expect(unexpected).toEqual([]);
  });

  test('carries none of the promotional, AI, demo or statistics copy', () => {
    currentRole = null;
    const html = render();
    const text = visibleText(html);

    for (const phrase of [
      'CareMatch',
      'AI Assistant',
      'AI-powered',
      'AI-assisted',
      'artificial intelligence',
      'XGBoost',
      'Random Forest',
      'predictive',
      'prediction',
      'statistics',
      'testimonial',
      'how it works',
      'One connected platform',
      'Secure Role-Based Access',
      'prototype',
      '%',
    ]) {
      expect(text.toLowerCase()).not.toContain(phrase.toLowerCase());
    }

    // Word-boundary checks: "demo"/"mock"/"sample"/"AI" must not appear as words.
    for (const word of ['demo', 'mock', 'sample', 'ai']) {
      expect(new RegExp(`\\b${word}\\b`, 'i').test(text)).toBe(false);
    }

    // No long paragraphs: the page is a gateway, not a project explanation.
    for (const match of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) {
      const words = visibleText(match[1]).trim().split(/\s+/).filter(Boolean);
      expect(words.length).toBeLessThanOrEqual(12);
    }
  });

  test('no directional arrow, chevron or CSS arrow remains inside a role card', () => {
    currentRole = null;
    const html = render();

    // Every role card is a <button aria-pressed=...>; none of them may carry a
    // right-arrow, chevron-right or similar directional icon.
    const cards = html.match(/<button[^>]*aria-pressed=[\s\S]*?<\/button>/g) ?? [];
    expect(cards.length).toBe(ROLE_OPTIONS.length);
    for (const card of cards) {
      expect(card).not.toMatch(/lucide-arrow/i);
      expect(card).not.toMatch(/lucide-chevron/i);
      expect(card).not.toContain('&#8594;');
      expect(card).not.toContain('→');
    }

    // Static guard for the SELECTED state too: SSR cannot click a card, so the
    // component itself must not import or render a directional icon at all.
    const source = readFileSync(
      resolve(import.meta.dir, '../../src/components/roleselect/RoleCard.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/\bArrow[A-Za-z]*\b/);
    expect(source).not.toMatch(/\bChevron[A-Za-z]*\b/);
  });

  test('starts with nothing selected and Continue disabled', () => {
    currentRole = null;
    const html = render();

    expect(html.match(/aria-pressed="false"/g)?.length).toBe(6);
    expect(html.match(/aria-pressed="true"/g)).toBeNull();
    // The disabled button renders with the attribute in SSR output.
    expect(html).toContain('disabled=""');
  });

  test('a restored session role does not pre-select a card or enable Continue', () => {
    // AppContext's `currentRole` defaults to 'patient' and is restored from a
    // saved session. Reading it for the card highlight would leave Continue
    // enabled before the visitor has chosen anything, so selection is local
    // state and a pre-existing role must not leak into it.
    currentRole = 'doctor';
    const html = render();

    expect(html.match(/aria-pressed="true"/g)).toBeNull();
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(6);
    expect(html).toContain('disabled=""');
  });
});

// Bun's module mocks are process-global: leaving this file's AppContext stub in
// place would break any later test file that drives the REAL provider.
afterAll(() => { mock.restore(); });
