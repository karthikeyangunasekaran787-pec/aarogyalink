/**
 * Content rules for the role-selection gateway (src/pages/RoleSelect.tsx).
 *
 * Renders the real component tree through react-dom/server, so anything `tsc`
 * cannot see — a bad hook call, a broken provider, a missing export — fails
 * here instead of showing a white screen in the browser.
 *
 * The expectations are derived from `@/lib/role-options` rather than retyped,
 * so the page cannot drift from the six roles, their labels or their one-line
 * descriptions without this test failing.
 *
 * The Three.js backdrop is mocked: WebGL cannot run in this environment and the
 * scene is lazy + decorative, so what matters here is the page itself.
 */
import { describe, expect, mock, test } from 'bun:test';
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

describe('RoleSelect content', () => {
  test('shows only the brand, the heading, six roles and Continue', () => {
    currentRole = null;
    const html = render();
    const text = visibleText(html);

    // Brand block, kept compact.
    expect(text).toContain('AarogyaLink');
    expect(text).toContain('Closing the Rural Healthcare Loop');
    // Heading must be the spec wording.
    expect(text).toContain('Select your role');
    // The existing logo asset, with fallbacks, is used (no new branding).
    expect(html).toContain('/aarogyalink-logo.jpeg');
    expect(text).toContain('Continue');

    // Every role, with its exact label and short description.
    for (const option of ROLE_OPTIONS) {
      expect(text).toContain(option.label);
      expect(text).toContain(option.description);
    }
    expect(ROLE_OPTIONS.length).toBe(6);
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
