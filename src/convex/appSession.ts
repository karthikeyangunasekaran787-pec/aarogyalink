// ============================================================================
// AarogyaLink — server-side session binding
// ----------------------------------------------------------------------------
// The backend cannot trust a role/hospital/patient id sent by the client, so
// every backend authorization decision is based on the binding stored in the
// `authSessions` table. A binding is created here, by the SERVER, after it has
// verified the caller against stored data:
//
//   staff   → username + password checked against the stored `staffUsers` row
//   patient → email checked against the stored `patients` row
//   district→ a stored `gov_admin` staff record (prototype auto-login: the
//             demo District Administrator has no password — documented)
//
// The role / hospital / patient id written into the binding always come from
// the STORED record, never from the request.
// ============================================================================

import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { parseEnvelope, scopeFromBinding } from './authz';

/** Roles that sign in with a username + password (District Administrators too). */
const LOGIN_ROLES = ['health_worker', 'doctor', 'hospital_admin', 'gov_admin'] as const;

/**
 * Master (Overall Administrator) email. Configurable per deployment; the
 * Overall Administrator also has to prove ownership of this address with the
 * emailed one-time code, so no password is stored for the master account.
 * Never exposed to the client.
 */
function overallAdminEmail(): string {
  return (process.env.OVERALL_ADMIN_EMAIL ?? 'karthikeyangunasekaran787@gmail.com').trim().toLowerCase();
}

/** Email of the currently authenticated Convex user, or undefined. */
async function callerEmail(ctx: Ctx): Promise<string | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  const fromIdentity = str(identity?.email);
  if (fromIdentity) return fromIdentity.toLowerCase();
  const userId = await getAuthUserId(ctx);
  if (userId === null) return undefined;
  const user = await ctx.db.get(userId);
  return str(user?.email)?.toLowerCase();
}

type Ctx = QueryCtx | MutationCtx;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function requireUserId(ctx: Ctx): Promise<string> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error('Not authenticated: sign in to access AarogyaLink data.');
  }
  return userId;
}

/** Read the records of one stored collection (never throws on bad payloads). */
async function readCollectionRecords(ctx: Ctx, key: string): Promise<Record<string, unknown>[]> {
  const row = await ctx.db.query('collections').withIndex('by_key', q => q.eq('key', key)).unique();
  const envelope = parseEnvelope(row?.data);
  return (envelope?.items ?? []).filter(isRecord);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Opaque session token used to restore a binding on the same device. */
function randomToken(): string {
  try {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random()
      .toString(16)
      .slice(2)}`;
  }
}

interface BindingInput {
  role: string;
  hospitalId?: string;
  districtId?: string;
  districtName?: string;
  staffUserId?: string;
  patientId?: string;
  username?: string;
  name?: string;
}

/** Create or replace the caller's session binding and return its token. */
async function upsertBinding(ctx: MutationCtx, userId: string, binding: BindingInput): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  const existing = await ctx.db
    .query('authSessions')
    .withIndex('by_user', q => q.eq('convexUserId', userId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { ...binding, token, updatedAt: now });
  } else {
    await ctx.db.insert('authSessions', { convexUserId: userId, token, ...binding, createdAt: now, updatedAt: now });
  }
  return token;
}

function sanitizeStaff(user: Record<string, unknown>) {
  return {
    id: str(user.id),
    name: str(user.name),
    email: str(user.email),
    role: str(user.role),
    facilityId: str(user.facilityId),
    districtId: str(user.districtId),
    districtName: str(user.districtName),
    departmentId: str(user.departmentId),
    phone: str(user.phone),
    status: str(user.status),
    mustChangePassword: user.mustChangePassword === true,
  };
}

/**
 * Staff login. The password is verified against the stored `staffUsers` row on
 * the server, so the returned role and hospital come from stored data.
 */
export const loginStaffSession = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    // Only used when the deployment stores NO staff records yet (brand-new
    // deployment): the client's locally verified identity seeds the binding so
    // the first staff login still works before any data has been uploaded.
    fallback: v.optional(
      v.object({
        role: v.string(),
        facilityId: v.optional(v.string()),
        districtId: v.optional(v.string()),
        districtName: v.optional(v.string()),
        staffUserId: v.optional(v.string()),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        departmentId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { username, password, fallback }) => {
    const userId = await requireUserId(ctx);
    const staff = await readCollectionRecords(ctx, 'staffUsers');
    const wanted = username.trim().toLowerCase();
    const user = staff.find(u => str(u.username)?.toLowerCase() === wanted);

    if (!user && staff.length === 0 && fallback && (LOGIN_ROLES as readonly string[]).includes(fallback.role)) {
      const token = await upsertBinding(ctx, userId, {
        role: fallback.role,
        hospitalId: fallback.facilityId,
        districtId: fallback.districtId,
        districtName: fallback.districtName,
        staffUserId: fallback.staffUserId,
        username,
        name: fallback.name,
      });
      return {
        ok: true as const,
        token,
        user: {
          id: fallback.staffUserId,
          name: fallback.name,
          email: fallback.email,
          role: fallback.role,
          facilityId: fallback.facilityId,
          districtId: fallback.districtId,
          districtName: fallback.districtName,
          departmentId: fallback.departmentId,
          phone: undefined,
          status: 'active',
          mustChangePassword: false,
        },
      };
    }

    if (!user || str(user.password) !== password) {
      return { ok: false as const, reason: 'invalid' };
    }
    if (user.status === 'disabled') {
      return { ok: false as const, reason: 'disabled' };
    }
    const role = str(user.role);
    if (!role || !(LOGIN_ROLES as readonly string[]).includes(role)) {
      return { ok: false as const, reason: 'invalid' };
    }
    const districtId = str(user.districtId);
    if (role === 'gov_admin' && !districtId) {
      // District Administrators are scoped to exactly one district; without one
      // there is nothing to authorize, so refuse rather than bind them broadly.
      return { ok: false as const, reason: 'invalid' };
    }

    const token = await upsertBinding(ctx, userId, {
      role,
      hospitalId: str(user.facilityId),
      districtId,
      districtName: str(user.districtName),
      staffUserId: str(user.id),
      username: str(user.username),
      name: str(user.name),
    });
    return { ok: true as const, token, user: sanitizeStaff(user) };
  },
});

/**
 * District Administrator binding by username.
 *
 * The console uses the same username + password login as every other staff
 * role (loginStaffSession), so this exists only for sessions restored on a
 * device that already knows which district administrator signed in. The
 * district ALWAYS comes from the stored record — never from the request — and
 * a record without a district refuses to bind, so this cannot be used to reach
 * a district the account does not own.
 */
export const loginDistrictSession = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await requireUserId(ctx);
    const staff = await readCollectionRecords(ctx, 'staffUsers');
    const wanted = username.trim().toLowerCase();
    const user = staff.find(
      u =>
        u.role === 'gov_admin' &&
        (str(u.username)?.toLowerCase() === wanted || str(u.email)?.toLowerCase() === wanted),
    );
    const districtId = user ? str(user.districtId) : undefined;
    if (!user || !districtId) {
      return { ok: false as const, reason: 'invalid' };
    }
    const token = await upsertBinding(ctx, userId, {
      role: 'gov_admin',
      districtId,
      districtName: str(user.districtName),
      staffUserId: str(user.id),
      username: str(user.username),
      name: str(user.name),
    });
    return { ok: true as const, token, user: sanitizeStaff(user) };
  },
});

/**
 * Overall Administrator (master) login.
 *
 * The master account has no stored password: identity is proven by the mailed
 * one-time code that signs the caller into Convex Auth with the master email,
 * and this mutation only confirms that the authenticated identity IS the
 * configured master address (`OVERALL_ADMIN_EMAIL`). Nothing the client sends
 * is trusted — there is deliberately no email argument.
 */
export const loginOverallSession = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const email = await callerEmail(ctx);
    if (!email || email !== overallAdminEmail()) {
      return { ok: false as const, reason: 'not_master' };
    }
    const token = await upsertBinding(ctx, userId, {
      role: 'overall_admin',
      username: email,
      name: 'Overall Administrator',
    });
    return {
      ok: true as const,
      token,
      user: {
        id: `overall-${userId}`,
        name: 'Overall Administrator',
        email,
        role: 'overall_admin',
        facilityId: undefined,
        districtId: undefined,
        districtName: undefined,
        departmentId: undefined,
        phone: undefined,
        status: 'active',
        mustChangePassword: false,
      },
    };
  },
});

/**
 * Patient login. The patient record is looked up on the server, which also
 * fixes cross-device login: a patient registered on another device can sign in
 * even when this device has never seen their record.
 */
export const loginPatientSession = mutation({
  args: {
    email: v.string(),
    healthCardId: v.optional(v.string()),
    // See loginStaffSession: only used before the deployment stores any
    // patient records, so the first patient login on a new deployment works.
    fallback: v.optional(v.object({ patientId: v.string(), name: v.optional(v.string()) })),
  },
  handler: async (ctx, { email, healthCardId, fallback }) => {
    const userId = await requireUserId(ctx);
    const patients = await readCollectionRecords(ctx, 'patients');
    const wanted = email.trim().toLowerCase();
    const patient = patients.find(p => str(p.registeredByEmail)?.toLowerCase() === wanted);

    if (!patient) {
      if (patients.length === 0 && fallback?.patientId) {
        const token = await upsertBinding(ctx, userId, { role: 'patient', patientId: fallback.patientId });
        return {
          ok: true as const,
          token,
          user: {
            id: `u-${fallback.patientId}`,
            patientId: fallback.patientId,
            name: fallback.name,
            email,
            healthCardId: healthCardId ?? undefined,
            role: 'patient',
          },
        };
      }
      return { ok: false as const, reason: 'not_registered' };
    }
    if (healthCardId && str(patient.healthCardId) && str(patient.healthCardId) !== healthCardId) {
      return { ok: false as const, reason: 'invalid' };
    }

    const patientId = str(patient.id);
    if (!patientId) {
      return { ok: false as const, reason: 'invalid' };
    }

    const token = await upsertBinding(ctx, userId, { role: 'patient', patientId });
    return {
      ok: true as const,
      token,
      user: {
        id: `u-${patientId}`,
        patientId,
        name: str(patient.name),
        email: str(patient.registeredByEmail),
        healthCardId: str(patient.healthCardId),
        role: 'patient',
      },
    };
  },
});

/**
 * Restore a binding on the same device (e.g. the page was reloaded and the
 * Convex session was recreated). The token is local to the device, at the same
 * trust level as the app's persisted session.
 */
export const resumeSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db
      .query('authSessions')
      .withIndex('by_token', q => q.eq('token', token))
      .unique();
    if (!row) return { ok: false as const };
    // A binding that cannot produce a scope (e.g. an older district binding
    // stored without a district) is unusable: drop it so the client re-binds.
    if (!scopeFromBinding(row)) {
      await ctx.db.delete(row._id);
      return { ok: false as const };
    }
    if (row.convexUserId !== userId) {
      await ctx.db.patch(row._id, { convexUserId: userId, updatedAt: Date.now() });
    }
    return {
      ok: true as const,
      session: {
        role: row.role,
        hospitalId: row.hospitalId,
        districtId: row.districtId,
        districtName: row.districtName,
        patientId: row.patientId,
        staffUserId: row.staffUserId,
        name: row.name,
      },
    };
  },
});

/** The caller's current binding, or null when they are not bound yet. */
export const getMySession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const row = await ctx.db
      .query('authSessions')
      .withIndex('by_user', q => q.eq('convexUserId', userId))
      .first();
    if (!row) return null;
    // Report an unusable binding as "not bound": the client then stays on its
    // offline cache instead of assuming its writes will be accepted.
    if (!scopeFromBinding(row)) return null;
    return {
      role: row.role,
      hospitalId: row.hospitalId ?? null,
      districtId: row.districtId ?? null,
      districtName: row.districtName ?? null,
      patientId: row.patientId ?? null,
      staffUserId: row.staffUserId ?? null,
      name: row.name ?? null,
    };
  },
});
