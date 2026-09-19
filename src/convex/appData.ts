import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Shared data collections for AarogyaLink.
 *
 * Each collection (patients, hospitals, staffUsers, ...) is stored as a single
 * row in the `collections` table, JSON-serialized. Every device loads the same
 * rows and writes go through Convex, so changes made on one device (e.g. the
 * District Admin adding a hospital) appear everywhere.
 */

/**
 * Authorization gate for every collection operation.
 *
 * Healthcare data must never be readable or writable without an authenticated
 * session, so each function requires a Convex Auth user (the client obtains one
 * automatically on load).
 *
 * NOTE: this is the MINIMUM check — it blocks unauthenticated access, but it is
 * not yet role- or hospital-scoped (any authenticated client may still read the
 * district-wide collection). Per-role / per-hospital filtering remains future
 * work and is reported as a known limitation.
 */
async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated: sign in to access AarogyaLink data.");
  }
  return userId;
}

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const rows = await ctx.db.query("collections").collect();
    // Return RAW payloads. Parsing + version validation happens on the client
    // (unwrapFromCloud) so stale/foreign-version records are rejected there.
    const out: Record<string, string> = {};
    for (const row of rows) {
      out[row.key] = row.data;
    }
    return out;
  },
});

export const saveCollection = mutation({
  args: {
    key: v.string(),
    data: v.string(), // JSON-serialized payload
  },
  handler: async (ctx, { key, data }) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("collections")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { data, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("collections", { key, data, updatedAt: Date.now() });
    }
  },
});

export const deleteCollection = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("collections")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
