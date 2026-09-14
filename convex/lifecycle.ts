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

const ENDING_SOON_MS = 14 * 86400000;

export const markEndingSoon = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const horizon = now + ENDING_SOON_MS;
    let changed = 0;
    const upcoming = await ctx.db
      .query("publishedOffers")
      .withIndex("by_expiresAt", (q) =>
        q.gt("expiresAt", now).lte("expiresAt", horizon),
      )
      .take(100);
    for (const row of upcoming) {
      if (row.endingSoon === true) continue;
      await ctx.db.patch(row._id, { endingSoon: true });
      changed++;
    }
    const flagged = await ctx.db
      .query("publishedOffers")
      .withIndex("by_endingSoon", (q) => q.eq("endingSoon", true))
      .take(100);
    for (const row of flagged) {
      if (row.expiresAt && row.expiresAt > now && row.expiresAt <= horizon)
        continue;
      await ctx.db.patch(row._id, { endingSoon: false });
      changed++;
    }
    if (upcoming.length === 100 || flagged.length === 100)
      await ctx.scheduler.runAfter(0, internal.lifecycle.markEndingSoon, {});
    return changed;
  },
});

const HISTORY_MS = 30 * 86400000;

export const cleanupHistory = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - HISTORY_MS;
    let deleted = 0;
    const runs = await ctx.db
      .query("discoveryRuns")
      .withIndex("by_started", (q) => q.lt("startedAt", cutoff))
      .take(100);
    for (const row of runs) {
      await ctx.db.delete(row._id);
      deleted++;
    }
    const checks = await ctx.db
      .query("resourceChecks")
      .withIndex("by_checkedAt", (q) => q.lt("checkedAt", cutoff))
      .take(100);
    for (const row of checks) {
      await ctx.db.delete(row._id);
      deleted++;
    }
    if (runs.length === 100 || checks.length === 100)
      await ctx.scheduler.runAfter(0, internal.lifecycle.cleanupHistory, {});
    return deleted;
  },
});
export const cleanupSessions = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("adminSessions")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", Date.now()))
      .take(100);
    for (const row of expired) await ctx.db.delete(row._id);
    if (expired.length === 100)
      await ctx.scheduler.runAfter(0, internal.lifecycle.cleanupSessions, {});
    return expired.length;
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
