/**
 * Render smoke test for the role-selection page (src/pages/RoleSelect.tsx).
 *
 * Executes the real component tree via react-dom/server so that runtime
 * errors `tsc` cannot catch (bad hook usage, missing exports, broken context)
 * fail here instead of producing a white screen in the browser.
 */
import { describe, expect, mock, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';

import type { Role } from '../../src/types';

let currentRole: Role | null = null;
const setCurrentRole = () => {};

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({ currentRole, setCurrentRole }),
}));

const { default: RoleSelect } = await import('../../src/pages/RoleSelect');

const render = () =>
  renderToString(
    <MemoryRouter initialEntries={['/']}>
      <RoleSelect />
    </MemoryRouter>,
  );

describe('RoleSelect page', () => {
  test('renders all required content with nothing selected', () => {
    currentRole = null;
    const html = render();

    // Kept content (spec)
    for (const s of [
      'AarogyaLink',
      'Closing the Rural Healthcare Loop',
      'Choose your role',
      'Patient',
      'Health Worker',
      'Doctor',
      'Hospital Administrator',
      'District Administrator',
      'Overall Administrator',
      'Continue',
      '/aarogyalink-logo.jpeg',
    ]) {
      expect(html).toContain(s);
    }

    // Six cards, none selected, Continue disabled
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(6);
    expect(html).toContain('disabled=""');

    // Removed content must not reappear
    expect(html).not.toContain('One connected platform');
    expect(html).not.toContain('Select how you access');
    expect(html).not.toContain('Secure Role-Based Access');
    expect(html).not.toContain('AI-assisted');
    expect(html).not.toContain('View your healthcare journey');
  });

  test('marks exactly one card selected after a choice and enables Continue', () => {
    currentRole = 'doctor';
    const html = render();

    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html.match(/aria-pressed="false"/g)?.length).toBe(5);
    expect(html).not.toContain('disabled=""');
    // Non-colour selection indicator: check badge present
    expect(html).toContain('rounded-full bg-primary text-primary-foreground');
  });
});
