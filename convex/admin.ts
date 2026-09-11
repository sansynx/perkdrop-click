import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { publish } from "./intake";
import { canonicalUrl, sourceFavicon } from "./lib/intakePolicy";
import { workflow } from "./workflows";

function authorize(token: string) {
  const expected = process.env.ADMIN_REVIEW_TOKEN?.trim();
  if (!expected || expected.length < 32 || token.length !== expected.length)
    throw new Error("Administrator access required");
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (difference) throw new Error("Administrator access required");
}
export const discoveryStatus = query({
  args: { token: v.string() },
  returns: v.object({
    enabled: v.boolean(),
    searches: v.array(
      v.object({
        id: v.id("discoveryQueries"),
        query: v.string(),
        enabled: v.boolean(),
        cadenceHours: v.number(),
        lastRunAt: v.optional(v.number()),
      }),
    ),
    runs: v.array(
      v.object({
        id: v.id("discoveryRuns"),
        query: v.string(),
        status: v.string(),
        startedAt: v.number(),
        found: v.number(),
        queued: v.number(),
        duplicates: v.number(),
        limited: v.number(),
        message: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, { token }) => {
    authorize(token);
    const searches = await ctx.db.query("discoveryQueries").take(20);
    const runs = await ctx.db
      .query("discoveryRuns")
      .withIndex("by_started")
      .order("desc")
      .take(8);
    return {
      enabled: process.env.DISCOVERY_ENABLED === "true",
      searches: searches.map(
        ({ _id, query, enabled, cadenceHours, lastRunAt }) => ({
          id: _id,
          query,
          enabled,
          cadenceHours,
          ...(lastRunAt === undefined ? {} : { lastRunAt }),
        }),
      ),
      runs: runs.map(
        ({
          _id,
          query,
          status,
          startedAt,
          found,
          queued,
          duplicates,
          limited,
          message,
        }) => ({
          id: _id,
          query,
          status,
          startedAt,
          found,
          queued,
          duplicates,
          limited,
          ...(message ? { message } : {}),
        }),
      ),
    };
  },
});
const item = v.object({
  id: v.id("resourceCandidates"),
  title: v.string(),
  provider: v.string(),
  sourceUrl: v.string(),
  claimUrl: v.string(),
  evidence: v.string(),
  reasons: v.array(v.string()),
  eligibility: v.array(v.string()),
  value: v.string(),
  terms: v.array(v.string()),
  imageUrl: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
});
export const queue = query({
  args: {
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(item),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    authorize(args.token);
    const result = await ctx.db
      .query("resourceCandidates")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("asc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)),
      });
    const page = await Promise.all(
      result.page.map(async (candidate) => {
        const details = await ctx.db
          .query("candidateDetails")
          .withIndex("by_candidate", (q) => q.eq("candidateId", candidate._id))
          .unique();
        return {
          id: candidate._id,
          title: candidate.title,
          provider: candidate.provider,
          sourceUrl: candidate.sourceUrl,
          claimUrl: candidate.claimUrl ?? "",
          evidence: candidate.evidence ?? "",
          eligibility: candidate.eligibility,
          value: candidate.valueText ?? "Unspecified",
          terms: [
            ...candidate.requirements,
            `Regions: ${candidate.regions.join(", ") || "Unknown"}`,
            `Card: ${candidate.requiresCard ? "Required" : "Not reported as required; verify source"}`,
            `Application: ${candidate.requiresApplication ? "Required" : "Not reported as required; verify source"}`,
            ...(details?.expiresAt
              ? [`Expiry: ${new Date(details.expiresAt).toISOString()}`]
              : []),
          ],
          reasons: details?.reasons ?? ["Legacy submission: verify all terms"],
          ...(details?.imageUrl ? { imageUrl: details.imageUrl } : {}),
          logoUrl: sourceFavicon(details?.logoUrl, candidate.claimUrl ?? ""),
        };
      }),
    );
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
export const decide = mutation({
  args: {
    token: v.string(),
    ids: v.array(v.id("resourceCandidates")),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    reason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    authorize(args.token);
    if (
      !args.ids.length ||
      args.ids.length > 20 ||
      args.reason.trim().length < 8 ||
      args.reason.length > 500
    )
      throw new Error("Select 1–20 offers and provide a review reason");
    let count = 0;
    for (const id of new Set(args.ids)) {
      const candidate = await ctx.db.get(id);
      if (!candidate || candidate.status !== "pending") continue;
      if (args.decision === "approved") await publish(ctx, id);
      await ctx.db.patch(id, { status: args.decision, reviewedAt: Date.now() });
      await ctx.db.insert("reviewAudit", {
        candidateId: id,
        decision: args.decision,
        reason: args.reason.trim(),
        actor: "administrator",
        createdAt: Date.now(),
      });
      const details = await ctx.db
        .query("candidateDetails")
        .withIndex("by_candidate", (q) => q.eq("candidateId", id))
        .unique();
      if (details)
        await ctx.db.patch(details.jobId, {
          status: args.decision,
          message:
            args.decision === "approved"
              ? "Reviewed and published."
              : "Reviewed; this offer does not meet the collection requirements.",
          updatedAt: Date.now(),
        });
      count++;
    }
    return count;
  },
});
export const retry = mutation({
  args: { token: v.string(), jobId: v.id("intakeJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.token);
    await retryJob(ctx, args.jobId);
    return null;
  },
});

async function retryJob(ctx: MutationCtx, jobId: Id<"intakeJobs">) {
  const job = await ctx.db.get(jobId);
  if (!job || job.status !== "failed")
    throw new Error("Only failed jobs can be retried");
  await ctx.db.patch(job._id, {
    status: "queued",
    message: "Retrying source verification.",
    updatedAt: Date.now(),
  });
  await workflow.start(
    ctx,
    internal.workflows.intake,
    { jobId: job._id, url: job.canonicalUrl },
    { startAsync: true },
  );
}
export const retryFailed = internalMutation({
  args: { jobId: v.id("intakeJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await retryJob(ctx, args.jobId);
    return null;
  },
});
export const failedJobs = query({
  args: { token: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.id("intakeJobs"),
        url: v.string(),
        message: v.string(),
      }),
    ),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    authorize(args.token);
    const result = await ctx.db
      .query("intakeJobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .paginate({ ...args.paginationOpts, numItems: 10 });
    return {
      page: result.page.map((job) => ({
        id: job._id,
        url: job.canonicalUrl,
        message: job.message,
      })),
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
// Trust changes are restricted to the deployment operator, not public callers.
export const trustPage = internalMutation({
  args: { url: v.string(), claimUrl: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const url = canonicalUrl(args.url),
      claimUrl = canonicalUrl(args.claimUrl);
    const existing = await ctx.db
      .query("trustedPages")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
    if (existing)
      await ctx.db.patch(existing._id, { claimUrl, enabled: args.enabled });
    else
      await ctx.db.insert("trustedPages", {
        url,
        claimUrl,
        enabled: args.enabled,
      });
    return null;
  },
});
