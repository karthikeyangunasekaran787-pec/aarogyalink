/**
 * Live check for appData authorization + Convex Auth sessions.
 *
 * Usage: bun scripts/tests/convex-auth-check.ts
 *
 * Verifies:
 *   1. appData.getAll requires authentication (must fail when unauthenticated)
 *   2. an anonymous Convex Auth session can be created
 *   3. appData.getAll succeeds with that session
 */
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../src/convex/_generated/api';

const url = process.env.VITE_CONVEX_URL || process.env.CONVEX_URL;
if (!url) {
  console.error('VITE_CONVEX_URL is not set in the environment.');
  process.exit(1);
}

console.log(`Deployment: ${url}`);

// 1) Unauthenticated read — should be rejected once authorization is in place.
const anon = new ConvexHttpClient(url);
let unauthOk = false;
try {
  const rows = await anon.query(api.appData.getAll, {});
  unauthOk = true;
  console.log(`1) unauthenticated getAll: ALLOWED (${Object.keys(rows).length} collections)`);
} catch (err) {
  console.log(`1) unauthenticated getAll: REJECTED (${(err as Error).message})`);
}

// 2) Create an anonymous session and use its token.
let signedIn = false;
try {
  const result = (await anon.action(api.auth.signIn, { provider: 'anonymous' })) as {
    tokens?: { token: string };
  };
  const token = result?.tokens?.token;
  if (token) {
    signedIn = true;
    console.log('2) anonymous signIn: OK (session token issued)');

    const authed = new ConvexHttpClient(url);
    authed.setAuth(token);
    try {
      const rows = await authed.query(api.appData.getAll, {});
      console.log(`3) authenticated getAll: OK (${Object.keys(rows).length} collections)`);
    } catch (err) {
      console.log(`3) authenticated getAll: FAILED (${(err as Error).message})`);
    }
  } else {
    console.log('2) anonymous signIn: no token returned');
  }
} catch (err) {
  console.log(`2) anonymous signIn: FAILED (${(err as Error).message})`);
}

console.log(
  `\nSummary: unauthAllowed=${unauthOk} anonymousSignIn=${signedIn}`,
);
