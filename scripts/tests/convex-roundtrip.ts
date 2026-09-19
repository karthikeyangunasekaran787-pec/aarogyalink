/**
 * Live round-trip test against the deployed Convex deployment.
 * Run with: bun scripts/tests/convex-roundtrip.ts
 *
 * Verifies the cross-device contract the SIH demo depends on:
 *   1. unauthenticated access is rejected
 *   2. two independent authenticated clients ("device A" / "device B")
 *      share the same data through Convex
 *   3. saveCollection persists, getAll returns it, deleteCollection cleans up
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('FAIL: VITE_CONVEX_URL is not set');
  process.exit(1);
}

let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`(pass) ${name}`);
  } else {
    failures++;
    console.error(`(FAIL) ${name}`, detail ?? '');
  }
}

/** Create an authenticated client the way the app does (anonymous session). */
async function device(label: string): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url);
  const result = (await client.action(api.auth.signIn as AnyApi, {
    provider: 'anonymous',
  })) as { tokens?: { token: string } };
  const token = result?.tokens?.token;
  if (!token) throw new Error(`${label}: anonymous sign-in returned no token`);
  client.setAuth(token);
  return client;
}

const testKey = '__sync_selftest__';

async function readKey(client: ConvexHttpClient, key: string): Promise<unknown> {
  const all = await client.query(api.appData.getAll as AnyApi, {});
  return (all as Record<string, unknown>)[key];
}

try {
  // 0) Authorization: an unauthenticated client must be rejected.
  const anonymous = new ConvexHttpClient(url);
  let rejected = false;
  try {
    await anonymous.query(api.appData.getAll as AnyApi, {});
  } catch {
    rejected = true;
  }
  check('unauthenticated getAll is rejected', rejected);

  // 1) Two devices, each with its own session (device A / device B).
  const deviceA = await device('device A');
  const deviceB = await device('device B');
  check('two independent authenticated sessions established', true);

  // 2) Clean slate.
  await deviceA.mutation(api.appData.deleteCollection as AnyApi, { key: testKey });
  check('deleteCollection clears any prior test row', (await readKey(deviceB, testKey)) === undefined);

  // 3) Device A writes a patient collection (Health Worker registers a patient).
  const payload = {
    v: 'test',
    items: [
      {
        id: 'p99',
        healthCardId: 'AL-PT-2026-099',
        registeredByEmail: 'sync.selftest@example.com',
        name: 'Sync Self-Test Patient',
        vitals: [{ id: 'v1', bloodPressureSystolic: 128, bloodPressureDiastolic: 82, spO2: 97 }],
      },
    ],
  };
  await deviceA.mutation(api.appData.saveCollection as AnyApi, {
    key: testKey,
    data: JSON.stringify(payload),
  });

  // 4) Device B reads it (Doctor searches by Health Card ID).
  const raw = await readKey(deviceB, testKey);
  check('device B sees the row written by device A', typeof raw === 'string', raw);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
  check(
    'written patient (with vitals) round-trips intact to the other device',
    parsed?.items?.[0]?.healthCardId === 'AL-PT-2026-099' &&
      parsed?.items?.[0]?.vitals?.[0]?.spO2 === 97,
    parsed,
  );

  // 5) Device B updates (Doctor records vitals) — device A must see it.
  parsed.items[0].vitals.push({ id: 'v2', bloodPressureSystolic: 118, bloodPressureDiastolic: 76, spO2: 99 });
  await deviceB.mutation(api.appData.saveCollection as AnyApi, {
    key: testKey,
    data: JSON.stringify(parsed),
  });
  const seenByA = await readKey(deviceA, testKey);
  const parsedByA = typeof seenByA === 'string' ? JSON.parse(seenByA) : null;
  check(
    'vitals recorded on device B are visible on device A',
    parsedByA?.items?.[0]?.vitals?.length === 2 && parsedByA?.items?.[0]?.vitals?.[1]?.spO2 === 99,
    parsedByA,
  );

  // 6) Overwrite replaces the row instead of duplicating it.
  parsed.items[0].name = 'Sync Self-Test Patient (updated)';
  await deviceA.mutation(api.appData.saveCollection as AnyApi, { key: testKey, data: JSON.stringify(parsed) });
  const updated = await readKey(deviceB, testKey);
  check(
    'saveCollection overwrites instead of duplicating',
    typeof updated === 'string' && JSON.parse(updated as string).items.length === 1,
  );

  // 7) Cleanup.
  await deviceA.mutation(api.appData.deleteCollection as AnyApi, { key: testKey });
  check('cleanup removed the test row', (await readKey(deviceB, testKey)) === undefined);
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
}

console.log(failures === 0 ? '\nAll live Convex cross-device tests passed.' : `\n${failures} live test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
