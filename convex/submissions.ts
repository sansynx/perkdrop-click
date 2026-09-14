import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import {
  canonicalUrl,
  isPerkdropHost,
  urlIdentity,
  urlVariants,
} from "./lib/intakePolicy";
import { workflow } from "./workflows";
import { reserveLimit } from "./lib/limits";

export const DISCOVERY_DAILY_LIMIT = 80;

async function rememberSeenUrl(
  ctx: MutationCtx,
  url: string,
  jobId: Id<"intakeJobs">,
) {
  let identity: string;
  try {
    identity = urlIdentity(url);
  } catch {
    return;
  }
  const existing = await ctx.db
    .query("seenUrls")
    .withIndex("by_identity", (q) => q.eq("identity", identity))
    .unique();
  if (!existing)
    await ctx.db.insert("seenUrls", {
      identity,
      jobId,
      createdAt: Date.now(),
    });
}

async function findExistingJob(ctx: MutationCtx, url: string) {
  const exact = await ctx.db
    .query("intakeJobs")
    .withIndex("by_url", (q) => q.eq("canonicalUrl", url))
    .unique();
  if (exact) return exact;
  try {
    const seen = await ctx.db
      .query("seenUrls")
      .withIndex("by_identity", (q) => q.eq("identity", urlIdentity(url)))
      .unique();
    if (seen) {
      const job = await ctx.db.get(seen.jobId);
      if (job) return job;
    }
  } catch {
    /* Invalid URLs cannot match a prior job. */
  }
  for (const variant of urlVariants(url)) {
    const job = await ctx.db
      .query("intakeJobs")
      .withIndex("by_url", (q) => q.eq("canonicalUrl", variant))
      .first();
    if (job) return job;
  }
  return null;
}
export const create = mutation({
  args: { url: v.string(), anonymousId: v.string() },
  returns: v.object({ id: v.id("intakeJobs"), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    if (!/^[a-zA-Z0-9-]{16,128}$/.test(args.anonymousId))
      throw new ConvexError("Invalid visitor identifier");
    const result = await enqueueIntake(ctx, args.url, args.anonymousId);
    if (!result)
      throw new ConvexError(
        "The submission limit has been reached. Please try again later.",
      );
    return result;
  },
});

export async function enqueueIntake(
  ctx: MutationCtx,
  input: string,
  anonymousId?: string,
  discoveryRunId?: Id<"discoveryRuns">,
) {
  let url: string;
  try {
    url = canonicalUrl(input);
  } catch {
    throw new ConvexError("Enter a valid public website URL.");
  }
  if (isPerkdropHost(new URL(url).hostname))
    throw new ConvexError(
      "Submit the original offer page, rather than a Perkdrop link.",
    );
  const existing = await findExistingJob(ctx, url);
  if (existing) {
    await rememberSeenUrl(ctx, url, existing._id);
    return { id: existing._id, duplicate: true };
  }
  if (!process.env.FIRECRAWL_API_KEY)
    throw new ConvexError(
      "Submissions are temporarily unavailable. Please try again later.",
    );
  const now = Date.now();
  const day = Math.floor(now / 86400000);
  const reserved = await reserveLimit(ctx, [
    ...(anonymousId
      ? ([
          [
            `visitor:${anonymousId}:${Math.floor(now / 600000)}`,
            5,
            now + 600000,
          ],
        ] as const)
      : []),
    ...(discoveryRunId
      ? ([[`discovery:${day}`, DISCOVERY_DAILY_LIMIT, now + 86400000]] as const)
      : ([
          [`domain:${new URL(url).hostname}:${day}`, 30, now + 86400000],
          [`global:${day}`, 200, now + 86400000],
        ] as const)),
  ]);
  if (!reserved) return null;
  const id = await ctx.db.insert("intakeJobs", {
    ...(discoveryRunId ? { discoveryRunId } : {}),
    canonicalUrl: url,
    status: "queued",
    message: "Checking the original source.",
    createdAt: now,
    updatedAt: now,
  });
  await rememberSeenUrl(ctx, url, id);
  await workflow.start(
    ctx,
    internal.workflows.intake,
    { jobId: id, url },
    { startAsync: true },
  );
  return { id, duplicate: false };
}
export const status = query({
  args: { id: v.id("intakeJobs") },
  returns: v.union(
    v.null(),
    v.object({ status: v.string(), message: v.string() }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    return job ? { status: job.status, message: job.message } : null;
  },
});
