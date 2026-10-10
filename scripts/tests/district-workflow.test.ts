/**
 * District management workflow — run with: bun test
 *
 * Pins the mandatory dependency in the Overall Administrator console:
 *
 *   Create District → Save → View District Details → District Administrator
 *   section → Create District Admin → Save → Verify assignment
 *
 * Creating a district and creating its administrator are SEPARATE operations,
 * an administrator can only be created for a district that already exists, the
 * relationship uses the district's stored id (never its name), and the backend
 * applies the same rule independently of the UI.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DISTRICT_CODE_RE,
  districtAdmins,
  districtIdForCode,
  validateDistrictAdminDraft,
  validateDistrictDraft,
} from '../../src/lib/district-admin';
import { dropAdminsForUnknownDistricts } from '../../src/convex/authz';
import type { District, User } from '../../src/types';

const pdk: District = {
  id: 'dist-pdk',
  districtId: 'DIST-PDK',
  name: 'Pudukkottai',
  displayName: 'Pudukkottai District',
  state: 'Tamil Nadu',
  headquarters: 'Pudukkottai',
  createdByUserId: 'overall_admin',
  createdAt: '2026-01-01',
};

const districtAdmin: User = {
  id: 'uga1',
  name: 'Pudukkottai District Administrator',
  email: 'distadmin.pdk@tn.gov.in',
  role: 'gov_admin',
  username: 'distadmin_pdk',
  password: 'PDK@2026Admin',
  districtId: 'DIST-PDK',
  districtName: 'Pudukkottai',
  status: 'active',
  createdAt: '2026-01-01',
};

const hospitalAdmin: User = {
  id: 'ustaff-ha1',
  name: 'Rajesh Kumar',
  email: 'rajesh@pgsh.gov.in',
  role: 'hospital_admin',
  username: 'rajesh.pdk001',
  facilityId: 'h1',
  districtId: 'DIST-PDK',
  status: 'active',
  createdAt: '2024-03-15',
};

const validAdmin = {
  name: 'Karur District Administrator',
  email: 'distadmin.krr@tn.gov.in',
  username: 'distadmin_krr',
  password: 'KRR@2026Admin',
};

describe('district id derivation', () => {
  test('the district id comes from the code, never the name', () => {
    expect(districtIdForCode('krr')).toBe('DIST-KRR');
    expect(districtIdForCode('  TRY ')).toBe('DIST-TRY');
    // A distinct name with the same code is still the same district id.
    expect(districtIdForCode('Karur')).toBe('DIST-KARUR');
  });

  test('codes are 2–4 letters', () => {
    expect(DISTRICT_CODE_RE.test('KR')).toBe(true);
    expect(DISTRICT_CODE_RE.test('KRR')).toBe(true);
    expect(DISTRICT_CODE_RE.test('KRRR')).toBe(true);
    expect(DISTRICT_CODE_RE.test('K')).toBe(false);
    expect(DISTRICT_CODE_RE.test('KRRRR')).toBe(false);
    expect(DISTRICT_CODE_RE.test('K1')).toBe(false);
  });
});

describe('create district standalone', () => {
  test('a valid draft is accepted and trimmed', () => {
    const result = validateDistrictDraft(
      { name: '  Karur ', code: ' krr ', headquarters: ' Karur ' },
      [pdk],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Karur', code: 'krr', headquarters: 'Karur' });
    }
  });

  test('the name is required', () => {
    const result = validateDistrictDraft({ name: '   ', code: 'KRR', headquarters: '' }, [pdk]);
    expect(result.ok).toBe(false);
  });

  test('a malformed code is rejected', () => {
    const result = validateDistrictDraft({ name: 'Karur', code: 'K1', headquarters: '' }, [pdk]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('2–4 letters');
  });

  test('the district code must be unique', () => {
    const result = validateDistrictDraft({ name: 'Pudukkottai', code: 'pdk', headquarters: '' }, [pdk]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('DIST-PDK');
  });
});

describe('create district administrator requires an existing district', () => {
  test('an administrator cannot be created without a district record', () => {
    const result = validateDistrictAdminDraft(validAdmin, undefined, [districtAdmin]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('Create the district first');
  });

  test('a valid draft is accepted and bound to the stored district', () => {
    const result = validateDistrictAdminDraft(validAdmin, pdk, [hospitalAdmin]);
    expect(result.ok).toBe(true);
    // Bound by DATABASE id, not by the district's display name.
    if (result.ok) expect(result.value.districtId).toBe('DIST-PDK');
  });

  test('a district keeps at most one administrator', () => {
    const result = validateDistrictAdminDraft(validAdmin, pdk, [districtAdmin]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already has a District Administrator');
  });

  test('required fields, email shape and password length are enforced', () => {
    const cases: Array<[string, typeof validAdmin]> = [
      ['blank name', { ...validAdmin, name: '  ' }],
      ['blank email', { ...validAdmin, email: '   ' }],
      ['malformed email', { ...validAdmin, email: 'not-an-email' }],
      ['blank username', { ...validAdmin, username: '  ' }],
      ['short password', { ...validAdmin, password: '12345' }],
    ];
    for (const [label, admin] of cases) {
      const result = validateDistrictAdminDraft(admin, pdk, [hospitalAdmin]);
      expect(`${label}: ${result.ok}`).toBe(`${label}: false`);
    }
  });

  test('the username must be unique across every account', () => {
    const taken = { ...hospitalAdmin, id: 'ustaff-taken', username: 'distadmin_krr' };
    const result = validateDistrictAdminDraft(validAdmin, pdk, [hospitalAdmin, taken]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('already taken');
  });

  test('administrators are matched by district id, not by name', () => {
    // Same display name, different district id → NOT this district's admin.
    const impostor: User = { ...districtAdmin, id: 'x', districtId: 'DIST-OTHER' };
    expect(districtAdmins([impostor], 'DIST-PDK')).toEqual([]);
    expect(districtAdmins([districtAdmin], 'DIST-PDK')).toHaveLength(1);
    // Non-administrator roles never count.
    expect(districtAdmins([hospitalAdmin], 'DIST-PDK')).toEqual([]);
  });
});

describe('backend refuses an administrator for an unknown district', () => {
  const known = new Set(['DIST-PDK', 'DIST-TRY']);

  test('an administrator for an existing district is kept', () => {
    expect(dropAdminsForUnknownDistricts([districtAdmin], known)).toHaveLength(1);
  });

  test('an administrator for a district that was never created is dropped', () => {
    const orphan: User = { ...districtAdmin, id: 'ghost', districtId: 'DIST-GHOST' };
    const kept = dropAdminsForUnknownDistricts([orphan, districtAdmin], known);
    expect(kept).toHaveLength(1);
    expect((kept[0] as User).id).toBe('uga1');
  });

  test('an administrator with no district at all is dropped', () => {
    const noDistrict: User = { ...districtAdmin, id: 'ghost2', districtId: undefined };
    expect(dropAdminsForUnknownDistricts([noDistrict], known)).toEqual([]);
  });

  test('every other account is left exactly as it was', () => {
    const otherStaff = [hospitalAdmin, { id: 'ustaff-doc1', role: 'doctor', facilityId: 'h1' }];
    expect(dropAdminsForUnknownDistricts(otherStaff, known)).toEqual(otherStaff);
  });

  test('without district information the payload is untouched', () => {
    const staff = [districtAdmin];
    expect(dropAdminsForUnknownDistricts(staff, undefined)).toBe(staff);
  });
});

describe('Overall Administrator console wiring', () => {
  const source = readFileSync(resolve(import.meta.dir, '../../src/pages/masteradmin/Dashboard.tsx'), 'utf8');

  test('Create District is a standalone action', () => {
    expect(source).toContain('Create District</Button>');
    // The combined one-step form is gone.
    expect(source).not.toMatch(/Create District \+ Administrator/);
    expect(source).not.toMatch(/handleCreateDistrictWithAdmin/);
    expect(source).toContain('validateDistrictDraft(');
  });

  test('the administrator form is only reachable from a district that exists', () => {
    expect(source).toContain('validateDistrictAdminDraft(');
    // openAdminForm must ALWAYS be called with a district id — never bare.
    const calls = source.match(/openAdminForm\(([^)]*)\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const argument = call.slice('openAdminForm('.length, -1).trim();
      expect(argument.length).toBeGreaterThan(0);
    }
  });

  test('the District Administrator section lives inside a district details panel', () => {
    expect(source).toContain('No District Administrator assigned yet.');
    expect(source).toContain('Create District Admin');
    // No standalone top-level register action remains.
    expect(source).not.toMatch(/Register District Administrator/);
    expect(source).not.toMatch(/>\s*Register\s*</);
  });

  test('the district list offers View Details and no per-row admin action', () => {
    expect(source).toContain('View Details');
    expect(source).not.toContain('Register District Admin');
  });
});

describe('sync ordering supports the backend dependency', () => {
  test('districts are pushed to the backend before staff accounts', () => {
    const source = readFileSync(resolve(import.meta.dir, '../../src/contexts/DataContext.tsx'), 'utf8');
    const districtsAt = source.indexOf("{ key: 'districts'");
    const staffAt = source.indexOf("{ key: 'staffUsers'");
    expect(districtsAt).toBeGreaterThan(-1);
    expect(staffAt).toBeGreaterThan(-1);
    expect(districtsAt).toBeLessThan(staffAt);
  });

  test('the data layer refuses an administrator without an existing district', () => {
    const source = readFileSync(resolve(import.meta.dir, '../../src/contexts/DataContext.tsx'), 'utf8');
    expect(source).toContain('addStaffUser');
    expect(source).toMatch(/must be created from an existing district/);
  });
});
