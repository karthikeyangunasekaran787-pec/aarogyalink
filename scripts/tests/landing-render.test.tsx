/**
 * Render smoke test for the public landing page (src/pages/Landing.tsx).
 *
 * Executes the real component tree via react-dom/server so that runtime
 * errors `tsc` cannot catch (bad hook usage, broken context, a bad import)
 * fail here instead of producing a white screen in the browser.
 *
 * It also pins the content rules the product page must keep: the hero copy,
 * all nine Referral Closure Engine stages, a route into role selection, and
 * the absence of AI / prediction / demo wording.
 *
 * The Three.js scene is mocked: WebGL cannot run in this environment, and the
 * scene is lazy + decorative, so the page's own correctness is what matters here.
 */
import { describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({ language: 'en' as const, setLanguage: () => {} }),
}));

mock.module('../../src/components/three/CareNetworkScene', () => ({
  default: () => null,
}));

const { default: Landing } = await import('../../src/pages/Landing');

const render = () =>
  renderToString(
    <MemoryRouter initialEntries={['/']}>
      <Landing />
    </MemoryRouter>,
  );

describe('Landing page', () => {
  test('renders the hero, both calls to action and the role-selection link', () => {
    const html = render();

    for (const s of [
      'AarogyaLink',
      'Closing the Rural Healthcare Loop',
      'Connecting patients, health workers, hospitals and doctors until care is completed.',
      // Primary and secondary actions from the brief.
      'Enter AarogyaLink',
      'Explore the Care Journey',
      // Where the primary action leads.
      '/role-select',
      // The core message.
      'We don&#x27;t just create a referral. We close the care loop.',
    ]) {
      expect(html).toContain(s);
    }
  });

  test('shows the nine-stage referral loop', () => {
    const html = render();

    for (const stage of [
      'Created',
      'Hospital Accepted',
      'Doctor Assigned',
      'Appointment Scheduled',
      'Arrival Verified',
      'Consultation',
      'Treatment',
      'Follow-up',
      'Referral Closed',
    ]) {
      expect(html).toContain(stage);
    }

    // The engine's canonical names are surfaced, so the UI cannot drift from it.
    for (const canonical of [
      'CREATED',
      'ACCEPTED',
      'DOCTOR_ASSIGNED',
      'SCHEDULED',
      'ARRIVAL_VERIFIED',
      'CONSULTATION_COMPLETED',
      'TREATMENT_STARTED',
      'FOLLOW_UP',
      'CLOSED',
    ]) {
      expect(html).toContain(canonical);
    }
  });

  test('lists all six role scopes', () => {
    const html = render();

    for (const role of [
      'Patient',
      'Health Worker',
      'Doctor',
      'Hospital Administrator',
      'District Administrator',
      'Overall Administrator',
    ]) {
      expect(html).toContain(role);
    }
  });

  test('carries no AI, prediction or prototype wording', () => {
    const html = render();

    for (const banned of [
      'CareMatch',
      'AI-assisted',
      'AI-powered',
      'AI Assistant',
      'AarogyaLink AI',
      'XGBoost',
      'Random Forest',
      'confidence score',
      'machine learning',
      'prototype',
      'Demo',
      'demo',
      'Mock',
      'mock',
      'synthetic',
      'coming soon',
    ]) {
      expect(html).not.toContain(banned);
    }
  });

  test('states no usage statistics or accuracy claims', () => {
    const html = render();
    // Numbers with a percent sign would imply a measured outcome we do not have.
    expect(html).not.toMatch(/\d+(\.\d+)?\s*%/);
  });
});
