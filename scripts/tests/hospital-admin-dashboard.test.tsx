/**
 * DOM test for the hospital-admin dashboard, focused on the facility
 * management tab that edits the administrator's own hospital record.
 *
 * It mounts the real component tree in happy-dom, switches to the Facility
 * Management tab and asserts what the administrator actually sees: the stored
 * hospital values (not a blank draft) and the translated actions. A runtime
 * error here fails the test instead of producing an empty page in the browser.
 */
import { afterAll, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Hospital } from '../../src/types';

const hospital: Hospital = {
  id: 'h1',
  hospitalId: 'HOS-PDK-001',
  name: 'Pudukkottai Government Hospital',
  type: 'government',
  address: '3 Hospital Road',
  village: 'Kallikudi',
  district: 'Pudukkottai',
  state: 'Tamil Nadu',
  phone: '04322-111111',
  email: 'pdk@example.org',
  departments: ['Medicine', 'Pediatrics'],
  services: ['Emergency', 'In-patient'],
  totalBeds: 100,
  occupiedBeds: 64,
  status: 'active',
  adminUserId: 'uadmin-1',
  createdByUserId: 'udistrict-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

mock.module('../../src/contexts/AppContext', () => ({
  useApp: () => ({
    language: 'en' as const,
    currentUser: {
      id: 'uadmin-1',
      name: 'Hospital Administrator',
      role: 'hospital_admin',
      facilityId: 'h1',
      facilityName: hospital.name,
    },
  }),
}));

mock.module('../../src/contexts/DataContext', () => ({
  useData: () => ({
    referrals: [],
    referralEvents: [],
    facilities: [],
    hospitals: [hospital],
    medicineStock: [],
    diagnostics: [],
    doctors: [],
    acceptReferral: async () => ({ ok: true, message: '' }),
    rejectReferral: async () => ({ ok: true, message: '' }),
    scheduleReferral: async () => ({ ok: true, message: '' }),
    addMedicineStock: () => {},
    removeMedicineStock: () => {},
    updateHospital: () => {},
    toggleHospitalStatus: () => {},
    addHospital: () => {},
  }),
}));

mock.module('../../src/hooks/use-referral-engine', () => ({
  useReferralEngine: () => ({
    assignDoctor: async () => ({ ok: true, message: '' }),
    verifyArrivalByQr: async () => ({ ok: true, message: '' }),
  }),
}));

const window = new Window({ url: 'http://localhost:3000/hospital-admin/dashboard' });
const g = globalThis as unknown as Record<string, unknown>;
g.window = window;
g.document = window.document;
g.navigator = window.navigator;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
g.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
g.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const manifest = window.document.createElement('div');
window.document.body.appendChild(manifest);
(globalThis as unknown as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const { default: HospitalAdminDashboard } = await import('../../src/pages/hospitaladmin/Dashboard');

const root = createRoot(manifest);
await act(async () => {
  root.render(<HospitalAdminDashboard />);
});

const text = () => manifest.textContent ?? '';

/** Open a tab by its visible label, the way a person would. */
const openTab = async (label: string) => {
  const trigger = Array.from(manifest.querySelectorAll('[role="tab"]')).find(
    tab => (tab.textContent ?? '').trim() === label,
  );
  expect(trigger).toBeDefined();
  await act(async () => {
    (trigger as HTMLElement).dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
    (trigger as HTMLElement).click();
  });
};

afterAll(() => {
  root.unmount();
});

describe('hospital-admin dashboard', () => {
  test('renders the dashboard without crashing', () => {
    expect(text()).toContain('Welcome, Hospital Admin');
    expect(text()).toContain('Pudukkottai Government Hospital');
  });

  test('the facility tab shows the stored hospital, not a blank draft', async () => {
    await openTab('Facility Management');

    expect(text()).toContain('Hospital details');
    expect(text()).toContain('3 Hospital Road, Kallikudi, Pudukkottai, Tamil Nadu');
    expect(text()).toContain('pdk@example.org');
    expect(text()).toContain('100');
    expect(text()).toContain('Medicine, Pediatrics');
  });

  test('the status action and staff list are translated and in place', async () => {
    await openTab('Facility Management');

    expect(text()).toContain('Active hospital');
    expect(text()).toContain('Suspend');
    expect(text()).toContain('Staff Management');
    // No raw translation key may leak into the surface.
    expect(text()).not.toContain('facilityPause');
    expect(text()).not.toContain('facilityManagementTitle');
    expect(text()).not.toContain('staffManagement');
  });
});
