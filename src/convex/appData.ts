import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Shared data collections for AarogyaLink.
 *
 * Each collection (patients, hospitals, staffUsers, ...) is stored as a single
 * row in the `collections` table, JSON-serialized. Every device loads the same
 * rows and writes go through Convex, so changes made on one device (e.g. the
 * District Admin adding a hospital) appear everywhere.
 */

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("collections").collect();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.data);
      } catch {
        // Ignore malformed rows.
      }
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
