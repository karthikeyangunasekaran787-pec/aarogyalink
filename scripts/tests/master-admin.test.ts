/**
 * The Overall Administrator rule — run with: bun test
 *
 * The master account has no password: ownership of ONE fixed address, proved
 * with an emailed one-time code, is the entire credential. These tests pin that
 * rule on both sides of the wire, so a future edit cannot quietly widen it:
 *
 *   - the address itself, and how it is compared;
 *   - the sign-in form's pre-flight check (a wrong address never gets a code);
 *   - the backend check that decides whether the master binding is opened.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  OVERALL_ADMIN_EMAIL,
  checkMasterEmail,
  isOverallAdminEmail,
  normalizeMasterEmail,
} from '../../src/lib/master-admin';

const source = (relativePath: string) => readFileSync(resolve(import.meta.dir, relativePath), 'utf8');

describe('the master address', () => {
  test('is the single address registered for the platform owner', () => {
    expect(OVERALL_ADMIN_EMAIL).toBe('karthikeyangunasekaran787@gmail.com');
  });

  test('matches case-insensitively and ignores surrounding space', () => {
    expect(isOverallAdminEmail('karthikeyangunasekaran787@gmail.com')).toBe(true);
    expect(isOverallAdminEmail('  KarthikeyanGunasekaran787@Gmail.com ')).toBe(true);
    expect(normalizeMasterEmail('  KarthikeyanGunasekaran787@Gmail.com ')).toBe(OVERALL_ADMIN_EMAIL);
  });

  test('accepts no other address', () => {
    for (const other of [
      'karthikeyan787@gmail.com',
      'karthikeyangunasekaran@gmail.com',
      'karthikeyangunasekaran787@gmail.co',
      'karthikeyangunasekaran787+alt@gmail.com',
      'admin@aarogyalink.in',
      'distadmin.pdk@tn.gov.in',
      '',
      '   ',
      null,
      undefined,
    ]) {
      expect(isOverallAdminEmail(other)).toBe(false);
    }
  });
});

describe('the master sign-in pre-flight check', () => {
  test('lets only the master address request a code', () => {
    expect(checkMasterEmail('karthikeyangunasekaran787@gmail.com')).toBeNull();
    expect(checkMasterEmail('  KarthikeyanGunasekaran787@Gmail.com ')).toBeNull();
  });

  test('refuses another address outright, so no code is emailed for it', () => {
    expect(checkMasterEmail('someone.else@gmail.com')).toBe('not_master');
    expect(checkMasterEmail('master@gmail.com')).toBe('not_master');
  });

  test('asks for an address when nothing usable was typed', () => {
    expect(checkMasterEmail('')).toBe('missing');
    expect(checkMasterEmail('   ')).toBe('missing');
    expect(checkMasterEmail('master')).toBe('missing');
  });
});

describe('both sides of the wire apply the one address', () => {
  test('the backend opens the master binding only for the shared address', () => {
    const server = source('../../src/convex/appSession.ts');

    expect(server).toContain("from '../lib/master-admin'");
    expect(server).toMatch(/!isOverallAdminEmail\(email\)/);
    // No per-deployment override: a configurable master address is how a second
    // Overall Administrator could appear, which is exactly what the rule bans.
    expect(server).not.toContain('process.env.OVERALL_ADMIN_EMAIL');
  });

  test('the sign-in screen checks the address before a code is requested', () => {
    const auth = source('../../src/pages/Auth.tsx');

    expect(auth).toContain("from '@/lib/master-admin'");

    const handlerAt = auth.indexOf('handleMasterRequestCode');
    const checkAt = auth.indexOf('checkMasterEmail(masterEmail)');
    const sendAt = auth.indexOf("await signIn('email-otp', { email: masterEmail.trim() })");

    expect(handlerAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(handlerAt);
    expect(sendAt).toBeGreaterThan(checkAt);
  });
});
