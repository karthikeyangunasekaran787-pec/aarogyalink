import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  mergeAuthorizedWrite,
  parseEnvelope,
  payloadFits,
  scopeCollectionsForRead,
  serializeEnvelope,
  type SessionScope,
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
  if (!binding) return { userId, scope: null };
  if (binding.role === "gov_admin") return { userId, scope: { kind: "district" } };
  if (binding.role === "patient" && binding.patientId) {
    return { userId, scope: { kind: "patient", patientId: binding.patientId } };
  }
  if (binding.hospitalId) {
    return {
      userId,
      scope: { kind: "hospital", hospitalId: binding.hospitalId, staffUserId: binding.staffUserId },
    };
  }
  return { userId, scope: null };
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
    const mergedItems = mergeAuthorizedWrite(key, storedItems, incoming.items, scope);

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
    // Deleting a whole shared collection is a district-level operation.
    if (!scope || scope.kind !== "district") {
      throw new Error("Only the District Administrator can delete a shared collection.");
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
