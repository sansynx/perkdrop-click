import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { canonicalUrl } from "./lib/intakePolicy";
import { workflow } from "./workflows";
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
  if (
    ["perkdrop.click", "perkdrop-click.sansynx.workers.dev"].includes(
      new URL(url).hostname,
    )
  )
    throw new ConvexError(
      "Submit the original offer page, rather than a Perkdrop link.",
    );
  const existing = await ctx.db
    .query("intakeJobs")
    .withIndex("by_url", (q) => q.eq("canonicalUrl", url))
    .unique();
  if (existing) return { id: existing._id, duplicate: true };
  if (!process.env.FIRECRAWL_API_KEY)
    throw new ConvexError(
      "Submissions are temporarily unavailable. Please try again later.",
    );
  const now = Date.now();
  const day = Math.floor(now / 86400000);
  const buckets: [string, number, number][] = [
    ...(anonymousId
      ? [
          [
            `visitor:${anonymousId}:${Math.floor(now / 600000)}`,
            5,
            now + 600000,
          ] as [string, number, number],
        ]
      : []),
    [`domain:${new URL(url).hostname}:${day}`, 30, now + 86400000],
    [`global:${day}`, 200, now + 86400000],
  ];
  const updates = [];
  for (const [key, maximum, expiresAt] of buckets) {
    const bucket = await ctx.db
      .query("intakeLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (bucket && bucket.count >= maximum) return null;
    updates.push({ key, expiresAt, bucket });
  }
  for (const { key, expiresAt, bucket } of updates) {
    if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    else await ctx.db.insert("intakeLimits", { key, count: 1, expiresAt });
  }
  const id = await ctx.db.insert("intakeJobs", {
    ...(discoveryRunId ? { discoveryRunId } : {}),
    canonicalUrl: url,
    status: "queued",
    message: "Checking the original source.",
    createdAt: now,
    updatedAt: now,
  });
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
