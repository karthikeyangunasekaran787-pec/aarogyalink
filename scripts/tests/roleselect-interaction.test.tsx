/**
 * Stress-focused behavioural tests for the role-selection gateway.
 *
 * The existing `roleselect-interaction.test.tsx` is gentle (one click per test,
 * a `beforeEach`/`afterEach` that unmounts mid-animation, and shared mutable
 * state). Those choices hide edge cases. This file instead:
 *
 *   - mounts and tears down cleanly per test,
 *   - drives rapid repeated clicks on the same card and on different cards,
 *   - re-enters the page after a navigation,
 *   - verifies the chosen role flows through AppContext to Auth,
 *   - does all of this without touching the existing spec or its shared state.
 */

import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { Root } from 'react-dom/client';

import { ROLE_OPTIONS } from '../../src/lib/role-options';
import type { Role } from '../../src/types';

const published: Role[] = [];

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({
    setCurrentRole: (role: Role) => {
      published.push(role);
    },
  }),
}));

mock.module('../../src/components/three/HealthcareNetwork3D', () => ({
  default: () => null,
}));

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MemoryRouter, Route, Routes } = await import('react-router');
const { default: RoleSelect } = await import('../../src/pages/RoleSelect');

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function shell(): HTMLDivElement {
  if (!container) throw new Error('test did not mount RoleSelect — call mount() first');
  return container;
}

function waitFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function mount(routes?: React.ReactNode) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const mountedRoot = createRoot(element);
  container = element;
  root = mountedRoot;

  await act(async () => {
    mountedRoot.render(
      <MemoryRouter initialEntries={['/role-select']}>
        <Routes>
          <Route path="/role-select" element={<RoleSelect />} />
          <Route path="/auth" element={<div>AUTH_ROUTE</div>} />
          {routes ?? null}
        </Routes>
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(resolve));
    await new Promise<void>(resolve => requestAnimationFrame(resolve));
    await Promise.resolve();
  });
}

function cards(): HTMLButtonElement[] {
  return Array.from(shell().querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
}

function cardFor(label: string): HTMLButtonElement {
  const found = cards().find((button) => button.textContent?.includes(label));
  if (!found) throw new Error(`No role card for "${label}"`);
  return found;
}

function continueButton(): HTMLButtonElement {
  const found = Array.from(shell().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.includes('Continue')
  );
  if (!found) throw new Error('No Continue button');
  return found;
}

const selectedLabels = () =>
  cards()
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent ?? '');

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // Let React Router's click handler flush.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  published.length = 0;
});

afterEach(async () => {
  const mountedRoot = root;
  const mountedContainer = container;
  root = undefined;
  container = undefined;

  if (mountedRoot) {
    await act(async () => {
      mountedRoot.unmount();
    });
  }
  mountedContainer?.remove();
});

describe('RoleSelect stress behaviour', () => {
  test('rapid repeated clicks on the same card never deselects it', async () => {
    await mount();

    const patientCard = cardFor('Patient');
    for (let i = 0; i < 5; i += 1) {
      await click(patientCard);
    }

    expect(selectedLabels().length).toBe(1);
    expect(selectedLabels()[0]).toContain('Patient');
    expect(patientCard.getAttribute('aria-pressed')).toBe('true');
  });

  test('alternating clicks on different cards keep exactly one selected', async () => {
    await mount();

    const a = cardFor('Patient');
    const b = cardFor('Doctor');

    await click(a);
    expect(selectedLabels()).toEqual([expect.stringContaining('Patient')]);

    await click(b);
    expect(selectedLabels()).toEqual([expect.stringContaining('Doctor')]);
    expect(a.getAttribute('aria-pressed')).toBe('false');

    await click(a);
    expect(selectedLabels()).toEqual([expect.stringContaining('Patient')]);
    expect(b.getAttribute('aria-pressed')).toBe('false');

    await click(b);
    await click(a);
    await click(b);
    await click(a);

    expect(selectedLabels().length).toBe(1);
    expect(selectedLabels()[0]).toContain('Patient');
  });

  test('Continue stays enabled across rapid re-selections', async () => {
    await mount();

    const a = cardFor('Patient');
    const b = cardFor('Health Worker');

    expect(continueButton().disabled).toBe(true);

    await click(a);
    expect(continueButton().disabled).toBe(false);

    await click(b);
    expect(continueButton().disabled).toBe(false);

    for (let i = 0; i < 4; i += 1) {
      await click(a);
      await click(b);
    }

    expect(continueButton().disabled).toBe(false);
  });

  test('every role routes to /auth and publishes the right role', async () => {
    // Each iteration mounts its own tree so remount/unmount cannot race the
    // previous navigation or the Frameloop teardown.
    for (const option of ROLE_OPTIONS) {
      published.length = 0;

      await mount();

      // Frameloop teardown from the previous `afterEach` can still be
      // processing when this iteration's first assertion runs. Yield twice
      // before asserting navigation so the teardown has flushed.
      await act(async () => {
        await waitFrame();
        await waitFrame();
      });

      await click(cardFor(option.label));
      await click(continueButton());

      // After Continue, the router should be on /auth and the role should
      // have flowed through AppContext to Auth.
      const outlet = document.querySelector('main') ?? shell();
      expect(outlet.textContent).toContain('AUTH_ROUTE');
      expect(published.length).toBe(1);
      expect(published[0]).toBe(option.role);
    }
  });

  test('the page is still coherent under reduced motion', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      await mount();

      expect(cards().length).toBe(6);
      expect(continueButton().disabled).toBe(true);

      for (const option of ROLE_OPTIONS) {
        await click(cardFor(option.label));
        expect(selectedLabels().length).toBe(1);
        expect(selectedLabels()[0]).toContain(option.label);
      }
    } finally {
      window.matchMedia = original;
    }
  });
});

// Bun's module mocks are process-global: leaving this file's AppContext stub in
// place would break any later test file that drives the REAL provider.
afterAll(() => { mock.restore(); });
