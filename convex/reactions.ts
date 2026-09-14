import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { reserveLimit } from "./lib/limits";
const reactionType = v.union(
  v.literal("claimed"),
  v.literal("works"),
  v.literal("expired"),
  v.literal("needs_card"),
  v.literal("region_issue"),
  v.literal("not_free"),
);
export const add = mutation({
  args: {
    resourceId: v.id("resources"),
    reactionType,
    anonymousId: v.string(),
    country: v.optional(v.string()),
  },
  returns: v.id("resourceReactions"),
  handler: async (ctx, args) => {
    if (
      !/^[a-zA-Z0-9-]{16,128}$/.test(args.anonymousId) ||
      (args.country && !/^[A-Z]{2}$/.test(args.country))
    )
      throw new ConvexError("Invalid feedback details.");
    const resource = await ctx.db.get(args.resourceId);
    if (
      !resource ||
      resource.status !== "active" ||
      (resource.expiresAt && resource.expiresAt <= Date.now())
    )
      throw new ConvexError("This offer is no longer available for feedback.");
    const existing = await ctx.db
      .query("resourceReactions")
      .withIndex("by_visitor_reaction", (q) =>
        q
          .eq("resourceId", args.resourceId)
          .eq("anonymousId", args.anonymousId)
          .eq("reactionType", args.reactionType),
      )
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const hour = Math.floor(now / 3600000);
    if (
      !(await reserveLimit(ctx, [
        [`reaction:visitor:${args.anonymousId}:${hour}`, 20, now + 3600000],
        [`reaction:global:${hour}`, 1000, now + 3600000],
      ]))
    )
      throw new ConvexError(
        "Too many feedback requests. Please try again later.",
      );
    const counter = await ctx.db
      .query("reactionCounts")
      .withIndex("by_resource_type", (q) =>
        q
          .eq("resourceId", args.resourceId)
          .eq("reactionType", args.reactionType),
      )
      .unique();
    if (counter) await ctx.db.patch(counter._id, { count: counter.count + 1 });
    else
      await ctx.db.insert("reactionCounts", {
        resourceId: args.resourceId,
        reactionType: args.reactionType,
        count: 1,
      });
    if (args.reactionType === "claimed")
      await ctx.db.patch(resource._id, {
        claimedCount: (resource.claimedCount ?? 0) + 1,
      });
    if (args.reactionType === "works")
      await ctx.db.patch(resource._id, {
        confirmedCount: (resource.confirmedCount ?? 0) + 1,
        communityConfirmedAt: now,
      });
    return ctx.db.insert("resourceReactions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const getSummary = query({
  args: { resourceId: v.id("resources") },
  returns: v.record(v.string(), v.number()),
  handler: async (ctx, { resourceId }) => {
    const resource = await ctx.db.get(resourceId);
    if (!resource || resource.status !== "active") return {};
    const counts = await ctx.db
      .query("reactionCounts")
      .withIndex("by_resource_type", (q) => q.eq("resourceId", resourceId))
      .take(6);
    return Object.fromEntries(
      counts.map((row) => [row.reactionType, row.count]),
    );
  },
});
