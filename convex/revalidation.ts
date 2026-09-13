import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { offerValidator } from "./intake";
import { assess, offerKey, safeRewardImage } from "./lib/intakePolicy";
import { removePublication } from "./lib/publications";
import { workflow } from "./workflows";

export const runScheduled = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (!process.env.FIRECRAWL_API_KEY?.trim()) return 0;
    const now = Date.now();
    const rows = await ctx.db
      .query("resources")
      .withIndex("by_status_recheck", (q) =>
        q.eq("status", "active").lte("recheckAfter", now),
      )
      .take(25);
    for (const row of rows) {
      await ctx.db.patch(row._id, { recheckAfter: now + 12 * 3600000 });
      await workflow.start(
        ctx,
        internal.revalidation.check,
        {
          resourceId: row._id,
          url: row.resolvedClaimUrl ?? row.originalClaimUrl ?? "",
          checkedAt: now,
        },
        { startAsync: true },
      );
    }
    return rows.length;
  },
});
export const finish = internalMutation({
  args: {
    logoUrl: v.optional(v.string()),
    resourceId: v.id("resources"),
    checkedAt: v.number(),
    offer: offerValidator,
    markdown: v.string(),
    finalUrl: v.string(),
    imageUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.status !== "active") return null;
    const last = await ctx.db
      .query("resourceChecks")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .order("desc")
      .first();
    if (last && last.checkedAt >= args.checkedAt) return null;
    const details = await ctx.db
      .query("candidateDetails")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .unique();
    const candidate = details ? await ctx.db.get(details.candidateId) : null;
    const assessment = assess(args.offer, args.markdown, true, Date.now());
    let key = "";
    try {
      key = offerKey(args.offer);
    } catch {
      /* Invalid claims require review. */
    }
    const changed =
      !resource.verificationKey ||
      key !== resource.verificationKey ||
      assessment.decision !== "approved";
    const expired =
      args.offer.expiresAt !== undefined && args.offer.expiresAt <= Date.now();
    await ctx.db.patch(resource._id, {
      lastVerifiedAt: Date.now(),
      consecutiveFailures: 0,
      status: expired ? "expired" : changed ? "needs_recheck" : "active",
      updatedAt: Date.now(),
      ...(expired ? { archivedAt: Date.now() } : {}),
    });
    if (expired || changed) await removePublication(ctx, resource._id);
    if (changed && candidate && details) {
      const {
        isOffer: _isOffer,
        termsKnown: _termsKnown,
        expiresAt,
        ...fields
      } = args.offer;
      await ctx.db.patch(candidate._id, {
        ...fields,
        category: candidate.category,
        status: expired ? "rejected" : "pending",
      });
      await ctx.db.patch(details._id, {
        expiresAt,
        imageUrl: safeRewardImage(args.imageUrl, args.offer.claimUrl),
        reasons: [
          "Offer changed during its scheduled check.",
          ...assessment.reasons,
        ],
      });
    }
    await ctx.db.insert("resourceChecks", {
      resourceId: resource._id,
      checkedAt: args.checkedAt,
      finalUrl: args.finalUrl,
      offerDetected: args.offer.isOffer,
      result: expired ? "expired" : changed ? "needs_recheck" : "unchanged",
      changeSummary: changed
        ? "Terms or availability need review."
        : "Offer terms still match the approved version.",
    });
    return null;
  },
});
export const fail = internalMutation({
  args: { resourceId: v.id("resources"), checkedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.status !== "active") return null;
    const last = await ctx.db
      .query("resourceChecks")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .order("desc")
      .first();
    if (last && last.checkedAt >= args.checkedAt) return null;
    const failures = resource.consecutiveFailures + 1;
    await ctx.db.patch(resource._id, {
      consecutiveFailures: failures,
      status: failures >= 3 ? "needs_recheck" : "active",
      updatedAt: Date.now(),
    });
    if (failures >= 3) {
      await removePublication(ctx, resource._id);
      const details = await ctx.db
        .query("candidateDetails")
        .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
        .unique();
      if (details) {
        await ctx.db.patch(details.candidateId, { status: "pending" });
        await ctx.db.patch(details._id, {
          reasons: [
            "Three scheduled checks failed. Verify the current offer before republishing.",
          ],
        });
      }
    }
    await ctx.db.insert("resourceChecks", {
      resourceId: resource._id,
      checkedAt: args.checkedAt,
      offerDetected: false,
      result: "check_failed",
      error: "Source verification failed after retries.",
    });
    return null;
  },
});
export const check = workflow
  .define({
    args: {
      resourceId: v.id("resources"),
      url: v.string(),
      checkedAt: v.number(),
    },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    try {
      const result = await step.runAction(
        internal.intake.extract,
        { url: args.url },
        { retry: true },
      );
      await step.runMutation(internal.revalidation.finish, {
        resourceId: args.resourceId,
        checkedAt: args.checkedAt,
        ...result,
      });
    } catch {
      await step.runMutation(internal.revalidation.fail, {
        resourceId: args.resourceId,
        checkedAt: args.checkedAt,
      });
    }
    return null;
  });
