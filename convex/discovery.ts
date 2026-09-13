import { firecrawlRequest } from "./lib/firecrawl";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { workflow } from "./workflows";
import {
  canonicalUrl,
  isLowValueDiscovery,
  isPerkdropHost,
  urlIdentity,
} from "./lib/intakePolicy";
import { enqueueIntake } from "./submissions";

const defaults = [
  "new free API cloud credits developer startup program announcement",
  "new student developer benefits free software program",
  "open source maintainer free credits sponsorship program",
  "hackathon free developer credits rewards new announcement",
];

export const runScheduled = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (process.env.DISCOVERY_ENABLED !== "true") return 0;
    if (!process.env.FIRECRAWL_API_KEY?.trim())
      throw new Error("Discovery requires Firecrawl configuration");
    const queries = await ctx.db
      .query("discoveryQueries")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(20);
    let started = 0;
    const now = Date.now();
    for (const item of queries) {
      if (started >= 4) break;
      if (
        item.lastRunAt !== undefined &&
        Math.floor(now / (Math.max(3, item.cadenceHours) * 3600000)) ===
          Math.floor(
            item.lastRunAt / (Math.max(3, item.cadenceHours) * 3600000),
          )
      )
        continue;
      await ctx.db.patch(item._id, { lastRunAt: now });
      const runId = await ctx.db.insert("discoveryRuns", {
        queryId: item._id,
        query: item.query,
        startedAt: now,
        status: "running",
        found: 0,
        queued: 0,
        duplicates: 0,
        limited: 0,
      });
      await workflow.start(
        ctx,
        internal.discovery.searchWorkflow,
        { runId, query: item.query },
        { startAsync: true },
      );
      started++;
    }
    return started;
  },
});

export const initialize = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    // Preserve operator configuration, including disabled searches.
    if (await ctx.db.query("discoveryQueries").first()) return 0;
    for (const query of defaults)
      await ctx.db.insert("discoveryQueries", {
        query,
        enabled: true,
        cadenceHours: 3,
        createdAt: Date.now(),
      });
    return defaults.length;
  },
});

export const setThreeHourCadence = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const queries = await ctx.db.query("discoveryQueries").take(20);
    for (const item of queries)
      await ctx.db.patch(item._id, { cadenceHours: 3 });
    return queries.length;
  },
});

export const search = internalAction({
  args: { query: v.string() },
  returns: v.array(v.string()),
  handler: async (_ctx, { query }) => {
    const payload = await firecrawlRequest<{
      success?: boolean;
      data?: { web?: { url?: unknown }[] };
    }>(
      "/search",
      {
        query: query.slice(0, 500),
        limit: 20,
        sources: ["web"],
        excludeDomains: [
          "facebook.com",
          "instagram.com",
          "linkedin.com",
          "perkdrop.click",
          "perkdrop-click.sansynx.workers.dev",
        ],
        tbs: "qdr:m",
        timeout: 60000,
      },
      65000,
    );
    if (payload.success !== true || !Array.isArray(payload.data?.web))
      throw new Error("Invalid discovery search response");
    const urls = new Set<string>();
    const identities = new Set<string>();
    for (const item of payload.data.web.slice(0, 20)) {
      if (typeof item?.url !== "string") continue;
      try {
        const url = canonicalUrl(item.url);
        if (isLowValueDiscovery(url)) continue;
        const identity = urlIdentity(url);
        if (identities.has(identity)) continue;
        identities.add(identity);
        urls.add(url);
      } catch {
        /* Exclude unsafe results before extraction. */
      }
    }
    return [...urls];
  },
});

export const enqueue = internalMutation({
  args: { runId: v.id("discoveryRuns"), urls: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, urls }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return null;
    let queued = 0,
      duplicates = 0,
      limited = 0;
    for (const url of [...new Set(urls)]) {
      if (isPerkdropHost(new URL(url).hostname) || isLowValueDiscovery(url)) {
        duplicates++;
        continue;
      }
      if (queued >= 5) continue;
      const result = await enqueueIntake(ctx, url, undefined, runId);
      if (!result) limited++;
      else if (result.duplicate) duplicates++;
      else queued++;
    }
    await ctx.db.patch(runId, {
      status: "completed",
      finishedAt: Date.now(),
      found: Math.min(urls.length, 5),
      queued,
      duplicates,
      limited,
    });
    return null;
  },
});

export const fail = internalMutation({
  args: { runId: v.id("discoveryRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run?.status === "running")
      await ctx.db.patch(runId, {
        status: "failed",
        finishedAt: Date.now(),
        message:
          "Search failed after three attempts. Check Firecrawl service access and credits. The next scheduled run will try again.",
      });
    return null;
  },
});

export const searchWorkflow = workflow
  .define({
    args: { runId: v.id("discoveryRuns"), query: v.string() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    try {
      const urls = await step.runAction(
        internal.discovery.search,
        { query: args.query },
        { retry: true },
      );
      await step.runMutation(internal.discovery.enqueue, {
        runId: args.runId,
        urls,
      });
    } catch {
      await step.runMutation(internal.discovery.fail, { runId: args.runId });
    }
    return null;
  });
