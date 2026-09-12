import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { removePublication } from "./lib/publications";

export const processExpiry = internalMutation({
  args: {},
  returns: v.object({ expired: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("resources")
      .withIndex("by_status_expiry", (q) =>
        q.eq("status", "active").gt("expiresAt", 0).lte("expiresAt", now),
      )
      .take(100);
    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "expired",
        archivedAt: now,
        updatedAt: now,
      });
      await removePublication(ctx, row._id);
    }
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.lifecycle.processExpiry, {});
    return { expired: rows.length };
  },
});
export const cleanupLimits = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("intakeLimits")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(200);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === 200)
      await ctx.scheduler.runAfter(0, internal.lifecycle.cleanupLimits, {});
    return expired.length;
  },
});
