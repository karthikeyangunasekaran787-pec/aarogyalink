/**
 * Live round-trip test against the deployed Convex deployment.
 * Run with: bun scripts/tests/convex-roundtrip.ts
 * Verifies: saveCollection persists → getAll returns it → deleteCollection cleans up.
 */
import { AnyApi, ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';

const url = process.env.VITE_CONVEX_URL;
if (!url) {
  console.error('FAIL: VITE_CONVEX_URL is not set');
  process.exit(1);
}

const client = new ConvexHttpClient(url);
const testKey = '__sync_selftest__';
let failures = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`(pass) ${name}`);
  } else {
    failures++;
    console.error(`(FAIL) ${name}`, detail ?? '');
  }
}

async function readKey(key: string): Promise<unknown> {
  const all = await client.query(api.appData.getAll as AnyApi, {});
  return (all as Record<string, unknown>)[key];
}

try {
  // 0) clean slate
  await client.mutation(api.appData.deleteCollection as AnyApi, { key: testKey });
  check('deleteCollection clears any prior test row', (await readKey(testKey)) === undefined);

  // 1) write (simulating device A pushing a new hospital)
  const payload = {
    v: 'test',
    items: [{ id: 'h6', hospitalId: 'HOS-PDK-006', name: 'Sync Self-Test Hospital', adminUsername: 'selftest.admin' }],
  };
  await client.mutation(api.appData.saveCollection as AnyApi, { key: testKey, data: JSON.stringify(payload) });

  // 2) read back (simulating device B)
  const raw = await readKey(testKey);
  check('getAll returns the written row', typeof raw === 'string', raw);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : null;
  check('payload round-trips intact', parsed?.items?.[0]?.hospitalId === 'HOS-PDK-006', parsed);

  // 3) update overwrites (no duplicate rows)
  payload.items[0].name = 'Sync Self-Test Hospital (updated)';
  await client.mutation(api.appData.saveCollection as AnyApi, { key: testKey, data: JSON.stringify(payload) });
  const updated = await readKey(testKey);
  check('saveCollection overwrites instead of duplicating', typeof updated === 'string' && JSON.parse(updated as string).items[0].name.includes('updated'));

  // 4) cleanup
  await client.mutation(api.appData.deleteCollection as AnyApi, { key: testKey });
  check('cleanup removed the test row', (await readKey(testKey)) === undefined);
} catch (err) {
  failures++;
  console.error('(FAIL) unexpected error:', err);
  process.exitCode = 1;
}

console.log(failures === 0 ? '\nAll live Convex round-trip tests passed.' : `\n${failures} live test(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
