import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  CLINICAL_COLLECTIONS,
  districtFacilityIds,
  mergeAuthorizedWrite,
  parseEnvelope,
  payloadFits,
  referralInScope,
  scopeCollectionsForRead,
  scopeFromBinding,
  serializeEnvelope,
  writablePatientIdsForFacilities,
  writablePatientIdsForHospital,
  type SessionScope,
  type WriteScope,
} from "./authz";

/**
 * Shared data collections for AarogyaLink.
 *
 * Each collection (patients, hospitals, staffUsers, ...) is stored as a single
 * row in the `collections` table, JSON-serialized. Every device loads the same
 * rows and writes go through Convex, so changes made on one device (e.g. the
 * District Admin adding a hospital) appear everywhere.
 *
 * Authorization (see authz.ts):
 *   - unauthenticated callers are rejected outright;
 *   - authenticated callers must also hold a session binding (appSession.ts),
 *     which is created server-side from stored credentials. The binding — not
 *     anything the client sends — decides the role, hospital and patient scope;
 *   - reads are filtered to that scope and writes are merged so a caller can
 *     only create/modify/delete records inside their own scope.
 */

type Ctx = QueryCtx | MutationCtx;

/** Resolve the caller's authorization scope from their stored binding. */
async function resolveScope(ctx: Ctx): Promise<{ userId: string; scope: SessionScope | null }> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated: sign in to access AarogyaLink data.");
  }
  const binding = await ctx.db
    .query("authSessions")
    .withIndex("by_user", q => q.eq("convexUserId", userId))
    .first();
  // The scope always comes from the STORED binding, never from the request.
  return { userId, scope: scopeFromBinding(binding) };
}

/** Read the raw items of one stored collection (never throws on bad payloads). */
async function readItems(ctx: Ctx, key: string): Promise<unknown[]> {
  const row = await ctx.db.query("collections").withIndex("by_key", q => q.eq("key", key)).unique();
  return parseEnvelope(row?.data)?.items ?? [];
}

/**
 * Work out what a hospital/district caller may write. Everything is derived
 * from the STORED collections, so a caller cannot widen its own scope by
 * sending a crafted payload.
 */
async function writeScopeFor(ctx: Ctx, key: string, scope: SessionScope | null): Promise<WriteScope | undefined> {
  if (!scope || (scope.kind !== "hospital" && scope.kind !== "district")) return undefined;

  const needsPatients = CLINICAL_COLLECTIONS.has(key) || key === "patients";
  const needsReferrals = key === "referralEvents";
  if (!needsPatients && !needsReferrals && scope.kind !== "district") return undefined;

  const [referrals, patients, appointments] = await Promise.all([
    readItems(ctx, "referrals"),
    needsPatients ? readItems(ctx, "patients") : Promise.resolve<unknown[]>([]),
    needsPatients ? readItems(ctx, "appointments") : Promise.resolve<unknown[]>([]),
  ]);

  const write: WriteScope = {};

  if (scope.kind === "district") {
    // A district admin may only write records tied to their own hospitals.
    write.facilityIds = districtFacilityIds(await readItems(ctx, "hospitals"), scope.districtId, scope.districtName);
    if (needsPatients) {
      write.writablePatientIds = writablePatientIdsForFacilities(
        patients,
        referrals,
        appointments,
        facilityId => write.facilityIds?.has(facilityId) === true,
      );
    }
  } else if (needsPatients) {
    write.writablePatientIds = writablePatientIdsForHospital(
      patients,
      referrals,
      appointments,
      scope.hospitalId,
    );
  }

  if (needsReferrals) {
    // Referral events may be appended unless the referral belongs elsewhere.
    write.foreignReferralIds = new Set(
      referrals
        .filter(r => !referralInScope(r, scope, write.facilityIds))
        .map(r => (r as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string"),
    );
  }

  return write;
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const { scope } = await resolveScope(ctx);
    const rows = await ctx.db.query("collections").collect();
    const raw: Record<string, string> = {};
    for (const row of rows) {
      raw[row.key] = row.data;
    }
    // An authenticated caller without a session binding receives nothing; the
    // app keeps running from its offline cache until the binding is created.
    if (!scope) return {};
    return scopeCollectionsForRead(raw, scope);
  },
});

export const saveCollection = mutation({
  args: {
    key: v.string(),
    data: v.string(), // JSON-serialized payload
  },
  handler: async (ctx, { key, data }) => {
    const { scope } = await resolveScope(ctx);
    const incoming = parseEnvelope(data);
    if (!incoming) {
      return { written: false as const, reason: "invalid_payload" };
    }

    const existing = await ctx.db
      .query("collections")
      .withIndex("by_key", q => q.eq("key", key))
      .unique();

    // No binding → nothing may be written; the stored row is left untouched.
    if (!scope) {
      return { written: false as const, reason: "unbound_session" };
    }

    const storedEnvelope = existing ? parseEnvelope(existing.data) : null;
    const storedItems = storedEnvelope?.items ?? [];

    // FRESH SEED: the row is absent or was written with a DIFFERENT data
    // version, so this is the first write of a new dataset. The whole snapshot
    // is accepted (by any bound role) so the demo fixtures land completely no
    // matter which role happens to load first — a scoped write would only ever
    // seed its own slice. Every write AFTER this is strictly scoped to the
    // caller's binding, which is where cross-district protection matters.
    const freshSeed = !storedEnvelope || storedEnvelope.v !== incoming.v;

    const write = freshSeed ? undefined : await writeScopeFor(ctx, key, scope);
    const mergedItems = freshSeed
      ? incoming.items
      : mergeAuthorizedWrite(key, storedItems, incoming.items, scope, write);

    // Keep the client's data version so version checks stay client-side.
    if (!payloadFits(incoming.v, mergedItems)) {
      return { written: false as const, reason: "payload_too_large" };
    }
    const mergedData = serializeEnvelope(incoming.v, mergedItems);

    if (existing) {
      await ctx.db.patch(existing._id, { data: mergedData, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("collections", { key, data: mergedData, updatedAt: Date.now() });
    }
    return { written: true as const };
  },
});

export const deleteCollection = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const { scope } = await resolveScope(ctx);
    // Deleting a whole shared collection is an Overall Administrator operation
    // (a district admin must never wipe another district's data).
    if (!scope || scope.kind !== "overall") {
      throw new Error("Only the Overall Administrator can delete a shared collection.");
    }
    const existing = await ctx.db
      .query("collections")
      .withIndex("by_key", q => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
