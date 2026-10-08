/**
 * Behavioural tests for the role-selection gateway, run in a real DOM.
 *
 * `tsc` and server rendering cannot prove the interactive requirements in the
 * brief, so this file mounts the page with react-dom/client under happy-dom and
 * drives it with real click events:
 *
 *   - six selectable roles, exactly one selected at a time
 *   - Continue starts disabled and enables only after a choice
 *   - Continue navigates into the EXISTING /auth route
 *   - the chosen role is published to AppContext (what Auth.tsx validates against)
 *   - all six roles work, not just the first
 *   - the page still works with prefers-reduced-motion: reduce
 *
 * WebGL and Convex are not involved: the 3D backdrop is mocked (decorative and
 * lazy) and AppContext is stubbed, so this exercises the page's own logic and
 * the real router.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { Root } from 'react-dom/client';

import { ROLE_OPTIONS } from '../../src/lib/role-options';
import type { Role } from '../../src/types';

/** Roles passed to AppContext.setCurrentRole, in order. */
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

/** The mounted host — fails clearly if a test forgot to call mount(). */
function shell(): HTMLDivElement {
  if (!container) throw new Error('test did not mount RoleSelect — call mount() first');
  return container;
}

/** Mount the page at /role-select with the real /auth route alongside it. */
async function mount() {
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
        </Routes>
      </MemoryRouter>,
    );
  });
  // Flush the lazy 3D import so it settles inside act().
  await act(async () => {
    await Promise.resolve();
  });
}

function cards(): HTMLButtonElement[] {
  return Array.from(shell().querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
}

function cardFor(label: string): HTMLButtonElement {
  const found = cards().find(button => button.textContent?.includes(label));
  if (!found) throw new Error(`No role card for "${label}"`);
  return found;
}

function continueButton(): HTMLButtonElement {
  const found = Array.from(shell().querySelectorAll<HTMLButtonElement>('button')).find(button =>
    button.textContent?.includes('Continue'),
  );
  if (!found) throw new Error('No Continue button');
  return found;
}

const selectedLabels = () =>
  cards()
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.textContent ?? '');

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
    // Let the entrance animations finish before tearing down. Unmounting a
    // `motion` component mid-animation makes happy-dom reject that animation's
    // promise (AbortError); those unhandled rejections poison React's act()
    // scope and fail unrelated later tests. Real browsers cancel silently, so
    // this is a harness concern, not a product one.
    await new Promise(resolve => setTimeout(resolve, 1200));
    act(() => mountedRoot.unmount());
  }
  mountedContainer?.remove();
});

describe('RoleSelect behaviour', () => {
  test('renders six selectable cards and one disabled Continue action', async () => {
    await mount();

    expect(cards().length).toBe(6);
    expect(ROLE_OPTIONS.length).toBe(6);
    expect(selectedLabels()).toEqual([]);
    expect(continueButton().disabled).toBe(true);
  });

  test('keeps exactly one role selected at a time', async () => {
    await mount();

    await click(cardFor(ROLE_OPTIONS[0].label));
    expect(selectedLabels().length).toBe(1);
    expect(selectedLabels()[0]).toContain(ROLE_OPTIONS[0].label);

    await click(cardFor(ROLE_OPTIONS[2].label));
    // Choosing another role replaces the first instead of adding to it.
    expect(selectedLabels().length).toBe(1);
    expect(selectedLabels()[0]).toContain(ROLE_OPTIONS[2].label);
    expect(cardFor(ROLE_OPTIONS[0].label).getAttribute('aria-pressed')).toBe('false');

    // Re-selecting the same card is idempotent, not a toggle into nothing.
    await click(cardFor(ROLE_OPTIONS[2].label));
    expect(selectedLabels().length).toBe(1);
  });

  test('enables Continue only after a role is chosen', async () => {
    await mount();

    expect(continueButton().disabled).toBe(true);
    await click(cardFor('Patient'));
    expect(continueButton().disabled).toBe(false);
  });

  test('publishes the chosen role and navigates into the existing /auth route', async () => {
    await mount();

    await click(cardFor('Health Worker'));
    expect(published).toEqual(['health_worker']);

    await click(continueButton());
    expect(container.textContent).toContain('AUTH_ROUTE');
  });

  test('every one of the six roles can be selected and continued', async () => {
    await mount();

    for (const option of ROLE_OPTIONS) {
      await click(cardFor(option.label));
      expect(selectedLabels().length).toBe(1);
      expect(published.at(-1)).toBe(option.role);
    }

    expect(published).toEqual(ROLE_OPTIONS.map(option => option.role));
    expect(continueButton().disabled).toBe(false);
  });

  test('the empty entry frame is removed on mount, so it never covers the app', async () => {
    // index.html ships an EMPTY #boot-splash — fixed, inset:0, opaque — so the
    // entry shows no logo. This proves React clears those pre-existing
    // children on mount; otherwise that frame would sit on top of the app and
    // the preview would look permanently blank.
    const shell = document.createElement('div');
    shell.innerHTML = '<div id="boot-splash"></div>';
    document.body.appendChild(shell);
    const shellRoot = createRoot(shell);

    await act(async () => {
      shellRoot.render(<div>APP_SHELL</div>);
    });

    expect(shell.textContent).toBe('APP_SHELL');
    expect(shell.querySelector('#boot-splash')).toBeNull();

    await act(async () => shellRoot.unmount());
    shell.remove();
  });

  test('the page still works with reduced motion enabled', async () => {
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

      await click(cardFor('Doctor'));
      expect(selectedLabels().length).toBe(1);
      expect(continueButton().disabled).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});
