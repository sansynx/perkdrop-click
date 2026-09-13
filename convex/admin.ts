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
import { canonicalUrl, resolveProviderLogo } from "./lib/intakePolicy";
import {
  catalogAudience,
  catalogCategory,
  inferAudience,
  isOfferAudience,
  isOfferCategory,
} from "./lib/categories";
import { removePublication } from "./lib/publications";
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
    const [searches, runs] = await Promise.all([
      ctx.db.query("discoveryQueries").take(20),
      ctx.db
        .query("discoveryRuns")
        .withIndex("by_started")
        .order("desc")
        .take(8),
    ]);
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
  category: v.string(),
  audience: v.string(),
  lastReason: v.optional(v.string()),
  terms: v.array(v.string()),
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
        const [details, lastAudit] = await Promise.all([
          ctx.db
            .query("candidateDetails")
            .withIndex("by_candidate", (q) =>
              q.eq("candidateId", candidate._id),
            )
            .unique(),
          ctx.db
            .query("reviewAudit")
            .withIndex("by_candidate", (q) =>
              q.eq("candidateId", candidate._id),
            )
            .order("desc")
            .first(),
        ]);
        const published = details?.resourceId
          ? await ctx.db
              .query("publishedOffers")
              .withIndex("by_resource", (q) =>
                q.eq("resourceId", details.resourceId!),
              )
              .unique()
          : null;
        return {
          id: candidate._id,
          title: candidate.title,
          provider: candidate.provider,
          sourceUrl: candidate.sourceUrl,
          claimUrl: candidate.claimUrl ?? "",
          evidence: candidate.evidence ?? "",
          eligibility: candidate.eligibility,
          value: candidate.valueText ?? "Unspecified",
          category: candidate.category,
          audience: catalogAudience(
            candidate.audience ??
              published?.audience ??
              inferAudience(candidate.eligibility),
          ),
          ...(lastAudit?.reason ? { lastReason: lastAudit.reason } : {}),
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
          logoUrl: resolveProviderLogo(
            candidate.claimUrl ?? "",
            candidate.provider,
            details?.logoUrl,
          ),
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
    reason: v.optional(v.string()),
    categories: v.optional(
      v.array(
        v.object({
          id: v.id("resourceCandidates"),
          category: v.string(),
        }),
      ),
    ),
    audiences: v.optional(
      v.array(
        v.object({
          id: v.id("resourceCandidates"),
          audience: v.string(),
        }),
      ),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    authorize(args.token);
    const note = args.reason?.trim() || "Reviewed by administrator.";
    if (!args.ids.length || args.ids.length > 20 || note.length > 500)
      throw new Error("Select 1–20 offers");
    if (
      (args.categories?.length ?? 0) > 20 ||
      (args.audiences?.length ?? 0) > 20
    )
      throw new Error("Choose placement for at most 20 offers");
    const selectedIds = new Set(args.ids);
    for (const item of args.categories ?? [])
      if (!selectedIds.has(item.id) || !isOfferCategory(item.category))
        throw new Error("Choose a catalog category for a selected offer");
    for (const item of args.audiences ?? [])
      if (!selectedIds.has(item.id) || !isOfferAudience(item.audience))
        throw new Error("Choose an audience for a selected offer");
    const chosen = new Map(
      (args.categories ?? []).map((item) => [item.id, item.category]),
    );
    const chosenAudience = new Map(
      (args.audiences ?? []).map((item) => [item.id, item.audience]),
    );
    let count = 0;
    for (const id of new Set(args.ids)) {
      const candidate = await ctx.db.get(id);
      if (!candidate || candidate.status !== "pending") continue;
      let decision = args.decision;
      let reason = note;
      if (decision === "approved") {
        await ctx.db.patch(id, {
          category: catalogCategory(chosen.get(id) ?? candidate.category),
          audience: catalogAudience(
            chosenAudience.get(id) ??
              candidate.audience ??
              inferAudience(candidate.eligibility),
          ),
        });
        try {
          const resourceId = await publish(ctx, id);
          const audience = catalogAudience(
            chosenAudience.get(id) ??
              candidate.audience ??
              inferAudience(candidate.eligibility),
          );
          const published = await ctx.db
            .query("publishedOffers")
            .withIndex("by_resource", (q) => q.eq("resourceId", resourceId))
            .unique();
          if (published) await ctx.db.patch(published._id, { audience });
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "Offer has expired"
          )
            throw error;
          decision = "rejected";
          reason = "Offer expired before review.";
        }
      }
      await ctx.db.patch(id, { status: decision, reviewedAt: Date.now() });
      await ctx.db.insert("reviewAudit", {
        candidateId: id,
        decision,
        reason,
        actor: "administrator",
        createdAt: Date.now(),
      });
      const details = await ctx.db
        .query("candidateDetails")
        .withIndex("by_candidate", (q) => q.eq("candidateId", id))
        .unique();
      if (details)
        await ctx.db.patch(details.jobId, {
          status: decision,
          message:
            decision === "approved"
              ? "Reviewed and published."
              : reason === "Offer expired before review."
                ? "Expired before review and was not published."
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
const liveItem = v.object({
  resourceId: v.id("resources"),
  slug: v.string(),
  title: v.string(),
  provider: v.string(),
  category: v.string(),
  audience: v.string(),
  claimUrl: v.string(),
});
export const liveOffers = query({
  args: { token: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(liveItem),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    authorize(args.token);
    const result = await ctx.db
      .query("publishedOffers")
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)),
      });
    const hydrated = await Promise.all(
      result.page.map(async (row) => {
        const resource = await ctx.db.get(row.resourceId);
        if (!resource || resource.status !== "active") return null;
        const provider = await ctx.db.get(resource.providerId);
        return { row, resource, provider };
      }),
    );
    const page: {
      resourceId: Id<"resources">;
      slug: string;
      title: string;
      provider: string;
      category: string;
      audience: string;
      claimUrl: string;
    }[] = [];
    for (const entry of hydrated) {
      if (!entry) continue;
      const { row, resource, provider } = entry;
      page.push({
        resourceId: resource._id,
        slug: resource.slug,
        title: resource.title,
        provider: provider?.name ?? "Independent provider",
        category: resource.category,
        audience: catalogAudience(row.audience ?? "Everyone"),
        claimUrl: resource.resolvedClaimUrl ?? resource.originalClaimUrl ?? "",
      });
    }
    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
export const unpublish = mutation({
  args: {
    token: v.string(),
    resourceId: v.id("resources"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.token);
    const reason = args.reason?.trim() || "Removed by administrator.";
    if (reason.length > 500) throw new Error("Takedown note is too long");
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.status !== "active")
      throw new Error("Only active offers can be unpublished");
    const now = Date.now();
    await ctx.db.patch(resource._id, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    await removePublication(ctx, resource._id);
    const details = await ctx.db
      .query("candidateDetails")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .unique();
    if (details) {
      await ctx.db.patch(details.candidateId, {
        status: "rejected",
        reviewedAt: now,
      });
      await ctx.db.insert("reviewAudit", {
        candidateId: details.candidateId,
        decision: "unpublished",
        reason,
        actor: "administrator",
        createdAt: now,
      });
      await ctx.db.patch(details.jobId, {
        status: "rejected",
        message: "This offer has been removed from the public catalog.",
        updatedAt: now,
      });
    }
    return null;
  },
});
export const recategorize = mutation({
  args: {
    token: v.string(),
    resourceId: v.id("resources"),
    category: v.string(),
    audience: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.token);
    if (!isOfferCategory(args.category))
      throw new Error("Choose a catalog category");
    if (args.audience !== undefined && !isOfferAudience(args.audience))
      throw new Error("Choose who this offer is for");
    const resource = await ctx.db.get(args.resourceId);
    if (!resource || resource.status !== "active")
      throw new Error("Only live offers can change category");
    const now = Date.now();
    await ctx.db.patch(resource._id, {
      category: args.category,
      updatedAt: now,
    });
    const published = await ctx.db
      .query("publishedOffers")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .unique();
    if (published)
      await ctx.db.patch(published._id, {
        category: args.category,
        ...(args.audience ? { audience: args.audience } : {}),
      });
    const details = await ctx.db
      .query("candidateDetails")
      .withIndex("by_resource", (q) => q.eq("resourceId", resource._id))
      .unique();
    if (details)
      await ctx.db.patch(details.candidateId, {
        category: args.category,
        ...(args.audience ? { audience: args.audience } : {}),
      });
    return null;
  },
});
export const reopen = mutation({
  args: {
    token: v.string(),
    ids: v.array(v.id("resourceCandidates")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    authorize(args.token);
    if (!args.ids.length || args.ids.length > 20)
      throw new Error("Select 1–20 rejected offers");
    const now = Date.now();
    const uniqueIds = [...new Set(args.ids)];
    const candidates = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
    const reopened = await Promise.all(
      uniqueIds.map(async (id, index) => {
        const candidate = candidates[index];
        if (!candidate || candidate.status !== "rejected") return false;
        await ctx.db.patch(id, { status: "pending", reviewedAt: now });
        await ctx.db.insert("reviewAudit", {
          candidateId: id,
          decision: "reopened",
          reason: "Returned to review.",
          actor: "administrator",
          createdAt: now,
        });
        const details = await ctx.db
          .query("candidateDetails")
          .withIndex("by_candidate", (q) => q.eq("candidateId", id))
          .unique();
        if (details)
          await ctx.db.patch(details.jobId, {
            status: "pending",
            message: "Returned to the review queue.",
            updatedAt: now,
          });
        return true;
      }),
    );
    return reopened.filter(Boolean).length;
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
