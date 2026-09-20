/**
 * Targeted unit tests for the persisted application session — run with: bun test
 *
 * BUG 1/2: the signed-in user must survive a browser refresh. These tests cover
 * the storage layer that `AppProvider` restores from on boot.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  AUTH_SESSION_KEY,
  readStoredSession,
  writeStoredSession,
  type StoredSession,
} from '../../src/lib/session';
import {
  BACKEND_TOKEN_KEY,
  clearPendingLogin,
  derivePendingLogin,
  peekPendingLogin,
  readBackendToken,
  rememberPendingLogin,
  writeBackendToken,
} from '../../src/lib/backend-session';

interface FakeUser {
  id: string;
  name: string;
  role: string;
  facilityId?: string;
  email?: string;
  healthCardId?: string;
}

const healthWorker: FakeUser = {
  id: 'ustaff-hw1',
  name: 'Suganthi M',
  role: 'health_worker',
  facilityId: 'h1',
};

// Minimal localStorage stub so the tests run without a DOM.
function installStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, v),
    ...overrides,
  };
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  return { store, storage };
}

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('persisted session (refresh restore)', () => {
  beforeEach(() => {
    installStorage();
  });

  test('a written session is readable again (simulates a page refresh)', () => {
    writeStoredSession<FakeUser>({ user: healthWorker, role: healthWorker.role });
    // A refresh re-reads from storage with no in-memory state.
    const restored = readStoredSession<FakeUser>();
    expect(restored).not.toBeNull();
    expect(restored?.user.id).toBe('ustaff-hw1');
    expect(restored?.user.name).toBe('Suganthi M');
    expect(restored?.role).toBe('health_worker');
    expect(restored?.user.facilityId).toBe('h1');
  });

  test('the stored payload lives under the documented key', () => {
    writeStoredSession<FakeUser>({ user: healthWorker, role: healthWorker.role });
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toContain('ustaff-hw1');
  });

  test('a patient session keeps the identifiers needed by the patient app', () => {
    const patient = {
      id: 'u-p11',
      name: 'Kumar',
      role: 'patient',
      patientId: 'p11',
      healthCardId: 'AL-PT-2026-011',
    };
    writeStoredSession({ user: patient, role: 'patient' });
    const restored = readStoredSession<typeof patient>();
    expect(restored?.user.patientId).toBe('p11');
    expect(restored?.user.healthCardId).toBe('AL-PT-2026-011');
  });

  test('logout clears the session so a refresh returns to role selection', () => {
    writeStoredSession<FakeUser>({ user: healthWorker, role: healthWorker.role });
    expect(readStoredSession()).not.toBeNull();
    writeStoredSession(null);
    expect(readStoredSession()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
  });

  test('no stored session → null (signed out)', () => {
    expect(readStoredSession()).toBeNull();
  });

  test('corrupted JSON is ignored instead of crashing the app', () => {
    localStorage.setItem(AUTH_SESSION_KEY, '{not valid json');
    expect(readStoredSession()).toBeNull();
  });

  test('structurally invalid sessions are rejected', () => {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ user: { id: 'x' } })); // no role
    expect(readStoredSession()).toBeNull();
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ role: 'doctor' })); // no user
    expect(readStoredSession()).toBeNull();
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(null));
    expect(readStoredSession()).toBeNull();
  });

  test('storage failures never throw (quota exceeded / private mode)', () => {
    installStorage({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => writeStoredSession<FakeUser>({ user: healthWorker, role: 'health_worker' })).not.toThrow();
    expect(() => writeStoredSession(null)).not.toThrow();
    expect(readStoredSession()).toBeNull();
  });

  test('session shape is role-agnostic (all five roles round-trip)', () => {
    const roles = ['patient', 'health_worker', 'doctor', 'hospital_admin', 'gov_admin'];
    for (const role of roles) {
      writeStoredSession<FakeUser>({ user: { ...healthWorker, role }, role });
      const session: StoredSession<FakeUser> | null = readStoredSession<FakeUser>();
      expect(session?.role).toBe(role);
      expect(session?.user.role).toBe(role);
    }
  });
});

describe('backend session (server-verified binding)', () => {
  beforeEach(() => {
    installStorage();
    clearPendingLogin();
  });

  test('the resume token survives a refresh and clears on logout', () => {
    writeBackendToken('token-123');
    expect(readBackendToken()).toBe('token-123');
    writeBackendToken(null);
    expect(readBackendToken()).toBeNull();
  });

  test('the token lives under its own key, separate from the app session', () => {
    writeBackendToken('token-abc');
    expect(globalThis.localStorage.getItem(BACKEND_TOKEN_KEY)).toBe('token-abc');
    expect(globalThis.localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
  });

  test('pending login credentials are kept in memory only (never persisted)', () => {
    rememberPendingLogin({ kind: 'staff', username: 'doc.pdk001', password: 'Secret@1' });
    expect(peekPendingLogin()).toEqual({ kind: 'staff', username: 'doc.pdk001', password: 'Secret@1' });
    // Nothing about the password may reach storage.
    const dump = Object.entries(globalThis.localStorage)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('|');
    expect(dump.includes('Secret@1')).toBe(false);
    clearPendingLogin();
    expect(peekPendingLogin()).toBeNull();
  });

  test('the overall administrator session self-heals (identity comes from the master email)', () => {
    expect(derivePendingLogin({ role: 'overall_admin' })).toEqual({ kind: 'overall' });
    expect(
      derivePendingLogin({ role: 'patient', email: 'kumar@example.com', healthCardId: 'AL-PT-2026-001' }),
    ).toEqual({ kind: 'patient', email: 'kumar@example.com', healthCardId: 'AL-PT-2026-001' });
  });

  test('username-based sessions are never bound without their password', () => {
    expect(derivePendingLogin({ role: 'doctor', email: 'doc@example.com' })).toBeNull();
    expect(derivePendingLogin({ role: 'health_worker' })).toBeNull();
    expect(derivePendingLogin({ role: 'hospital_admin' })).toBeNull();
    // District administrators are username-based too: re-deriving one would mean
    // guessing which district to bind, so they sign in again instead.
    expect(derivePendingLogin({ role: 'gov_admin' })).toBeNull();
    expect(derivePendingLogin(null)).toBeNull();
  });

  test('a patient session without an email cannot be re-derived', () => {
    expect(derivePendingLogin({ role: 'patient' })).toBeNull();
  });
});
