/**
 * Live round-trip test against the deployed Convex deployment.
 * Run with: bun scripts/tests/convex-roundtrip.ts
 *
 * Verifies the cross-device contract the SIH demo depends on:
 *   1. unauthenticated access is rejected
 *   2. two independent authenticated clients ("device A" / "device B")
 *      share the same data through Convex
 *   3. a clinical record written on one device is read (and updated) on the other
 *
 * It uses the real `vitals` collection and removes its own record again, so it
 * never leaves test data behind (whole-collection deletion is reserved for the
 * Overall Administrator).
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';
import { DATA_VERSION } from '../../src/contexts/cloudData';

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

/**
 * Create an authenticated client the way the app does: an anonymous Convex
 * session, then a server-verified session binding (the backend refuses to share
 * healthcare collections with an unbound session).
 */
async function device(label: string): Promise<ConvexHttpClient> {
  const client = new ConvexHttpClient(url);
  const result = (await client.action(api.auth.signIn as AnyApi, {
    provider: 'anonymous',
  })) as { tokens?: { token: string } };
  const token = result?.tokens?.token;
  if (!token) throw new Error(`${label}: anonymous sign-in returned no token`);
  client.setAuth(token);

  // Bind the (full-data) District Administrator demo account so both devices
  // share one scope; the binding only exists after the deployment has been
  // seeded with the current fixtures (the app does this on first load).
  const bound = (await client.mutation(api.appSession.loginDistrictSession as AnyApi, {
    username: 'distadmin_pdk',
  })) as { ok?: boolean };
  if (!bound?.ok) {
    throw new Error(`${label}: could not bind a session — load the app once to seed the current fixtures`);
  }
  return client;
}

async function readPayload(
  client: ConvexHttpClient,
  key: string,
): Promise<{ v: string; items: Record<string, unknown>[] }> {
  const all = await client.query(api.appData.getAll as AnyApi, {});
  const raw = (all as Record<string, unknown>)[key];
  if (typeof raw !== 'string') return { v: DATA_VERSION, items: [] };
  const parsed = JSON.parse(raw) as { v?: string; items?: Record<string, unknown>[] };
  return { v: parsed.v ?? DATA_VERSION, items: parsed.items ?? [] };
}

function payload(version: string, items: unknown[]): string {
  return JSON.stringify({ v: version, items });
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

  // 2) Baseline: the vitals this scope can see, plus a patient inside it.
  const baseline = await readPayload(deviceA, 'vitals');
  const visiblePatients = await readPayload(deviceA, 'patients');
  const patientId = visiblePatients.items[0]?.id;
  check('the district scope exposes patients to record vitals for', typeof patientId === 'string', patientId);
  if (typeof patientId !== 'string') throw new Error('no visible patient to record vitals for');

  const testRecordId = 'v-sync-selftest';
  const cleanedUp = baseline.items.filter(v => v.id !== testRecordId);

  // 3) Device A records vitals (Health Worker at the facility).
  await deviceA.mutation(api.appData.saveCollection as AnyApi, {
    key: 'vitals',
    data: payload(baseline.v, [
      ...cleanedUp,
      {
        id: testRecordId,
        patientId,
        recordedBy: 'Sync Self-Test',
        date: '2026-09-20',
        bloodPressureSystolic: 128,
        bloodPressureDiastolic: 82,
        spO2: 97,
      },
    ]),
  });

  // 4) Device B reads it (Doctor opens the patient).
  const afterWrite = await readPayload(deviceB, 'vitals');
  const written = afterWrite.items.find(v => v.id === testRecordId);
  check(
    'a vitals reading written on device A round-trips intact to device B',
    written?.spO2 === 97 && written?.bloodPressureSystolic === 128,
    written,
  );

  // 5) Device B records a follow-up reading (Doctor) — device A must see it.
  await deviceB.mutation(api.appData.saveCollection as AnyApi, {
    key: 'vitals',
    data: payload(afterWrite.v, [
      ...afterWrite.items.filter(v => v.id !== testRecordId),
      {
        id: testRecordId,
        patientId,
        recordedBy: 'Sync Self-Test',
        date: '2026-09-20',
        bloodPressureSystolic: 118,
        bloodPressureDiastolic: 76,
        spO2: 99,
      },
    ]),
  });
  const seenByA = await readPayload(deviceA, 'vitals');
  const updated = seenByA.items.find(v => v.id === testRecordId);
  check('the updated vitals are visible on device A', updated?.spO2 === 99, updated);
  check(
    'saving does not duplicate the record',
    seenByA.items.filter(v => v.id === testRecordId).length === 1,
  );

  // 6) Cleanup: put the collection back exactly as it was.
  await deviceA.mutation(api.appData.saveCollection as AnyApi, {
    key: 'vitals',
    data: payload(baseline.v, cleanedUp),
  });
  const afterCleanup = await readPayload(deviceB, 'vitals');
  check('cleanup removed the self-test record', !afterCleanup.items.some(v => v.id === testRecordId));
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
}

console.log(failures === 0 ? '\nAll live Convex cross-device tests passed.' : `\n${failures} live test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
