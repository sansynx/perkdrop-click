import { firecrawlRequest } from "./lib/firecrawl";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { workflow } from "./workflows";
import {
  canonicalUrl,
  isLowValueDiscovery,
  isPerkdropHost,
  urlIdentity,
} from "./lib/intakePolicy";
import { enqueueIntake } from "./submissions";

const LIVE_RESOURCE = new Set([
  "active",
  "ending_soon",
  "needs_recheck",
  "candidate",
]);

export const INTENT_CADENCE_HOURS = 3;
export const SOURCE_CADENCE_HOURS = 12;
export const SOURCE_SEARCH_BATCH = 8;
export const SEARCH_RESULT_LIMIT = 20;
export const ENQUEUE_URL_LIMIT = 20;

export const DISCOVERY_INTENTS = [
  {
    key: "intent:credits",
    query: "new free API cloud credits developer program",
  },
  {
    key: "intent:students",
    query: "student developer pack free software credits",
  },
  {
    key: "intent:hackathons",
    query: "hackathon prizes sponsor API cloud credits",
  },
  {
    key: "intent:startups",
    query: "startup program free cloud API credits",
  },
  {
    key: "intent:oss",
    query: "open source maintainer free credits sponsorship",
  },
] as const;

export const DISCOVERY_QUERIES = DISCOVERY_INTENTS.map((item) => item.query);

type SearchKind = "intent" | "source";
type SearchSpec = {
  key: string;
  query: string;
  kind: SearchKind;
  cadenceHours: number;
};

export function sourceSearchFromClaim(input: string): SearchSpec | null {
  try {
    const url = new URL(canonicalUrl(input));
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.includes(".") || isPerkdropHost(host)) return null;
    const segment = url.pathname.split("/").filter(Boolean)[0];
    const scoped = host.split(".").length <= 2 && segment;
    const site = scoped ? `${host}/${segment}` : host;
    return {
      key: `source:${site}`,
      query: `site:${site} free credits program eligibility`,
      kind: "source",
      cadenceHours: SOURCE_CADENCE_HOURS,
    };
  } catch {
    return null;
  }
}

function isDue(
  lastRunAt: number | undefined,
  cadenceHours: number,
  now: number,
) {
  if (lastRunAt === undefined) return true;
  const window = Math.max(3, cadenceHours) * 3600000;
  return Math.floor(now / window) !== Math.floor(lastRunAt / window);
}

export const runScheduled = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (process.env.DISCOVERY_ENABLED !== "true") return 0;
    if (!process.env.FIRECRAWL_API_KEY?.trim())
      throw new Error("Discovery requires Firecrawl configuration");
    await ensureQueryRecords(ctx);
    const queries = await ctx.db
      .query("discoveryQueries")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(200);
    const now = Date.now();
    const due = queries.filter((item) =>
      isDue(item.lastRunAt, item.cadenceHours, now),
    );
    const intents = due.filter((item) => item.kind !== "source");
    const sources = due
      .filter((item) => item.kind === "source")
      .sort((a, b) => (a.lastRunAt ?? 0) - (b.lastRunAt ?? 0))
      .slice(0, SOURCE_SEARCH_BATCH);
    let started = 0;
    for (const item of [...intents, ...sources]) {
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

async function catalogSourceSearches(ctx: MutationCtx) {
  const found = new Map<string, SearchSpec>();
  const publications = await ctx.db.query("publishedOffers").take(200);
  for (const publication of publications) {
    const resource = await ctx.db.get(publication.resourceId);
    if (!resource || !LIVE_RESOURCE.has(resource.status)) continue;
    const spec = sourceSearchFromClaim(
      resource.resolvedClaimUrl ?? resource.originalClaimUrl ?? "",
    );
    if (spec) found.set(spec.key, spec);
  }
  const trusted = await ctx.db.query("trustedPages").take(100);
  for (const page of trusted) {
    if (!page.enabled) continue;
    const spec = sourceSearchFromClaim(page.claimUrl || page.url);
    if (spec) found.set(spec.key, spec);
  }
  return [...found.values()];
}

async function upsertSearch(
  ctx: MutationCtx,
  existing: Doc<"discoveryQueries">[],
  spec: SearchSpec,
) {
  const match =
    existing.find((row) => row.key === spec.key) ??
    existing.find((row) => row.query === spec.query && row.key === undefined);
  if (!match) {
    await ctx.db.insert("discoveryQueries", {
      query: spec.query,
      enabled: true,
      cadenceHours: spec.cadenceHours,
      createdAt: Date.now(),
      key: spec.key,
      kind: spec.kind,
    });
    return 1;
  }
  const patch: {
    query?: string;
    cadenceHours?: number;
    key?: string;
    kind?: SearchKind;
  } = {};
  if (match.query !== spec.query) patch.query = spec.query;
  if (match.cadenceHours !== spec.cadenceHours)
    patch.cadenceHours = spec.cadenceHours;
  if (match.key !== spec.key) patch.key = spec.key;
  if (match.kind !== spec.kind) patch.kind = spec.kind;
  if (Object.keys(patch).length) await ctx.db.patch(match._id, patch);
  return 0;
}

async function ensureQueryRecords(ctx: MutationCtx) {
  const existing = await ctx.db.query("discoveryQueries").take(200);
  const wanted: SearchSpec[] = [
    ...DISCOVERY_INTENTS.map((item) => ({
      key: item.key,
      query: item.query,
      kind: "intent" as const,
      cadenceHours: INTENT_CADENCE_HOURS,
    })),
    ...(await catalogSourceSearches(ctx)),
  ];
  const wantedKeys = new Set(wanted.map((item) => item.key));
  const wantedQueries = new Set(wanted.map((item) => item.query));
  let added = 0;
  for (const spec of wanted) added += await upsertSearch(ctx, existing, spec);
  for (const item of existing) {
    const keep = item.key
      ? wantedKeys.has(item.key)
      : wantedQueries.has(item.query);
    if (!keep && item.enabled) await ctx.db.patch(item._id, { enabled: false });
  }
  return added;
}

export const initialize = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (await ctx.db.query("discoveryQueries").first()) return 0;
    return await ensureQueryRecords(ctx);
  },
});

export const ensureQueries = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => ensureQueryRecords(ctx),
});

function searchExcludeDomains() {
  const domains = new Set<string>();
  for (const raw of [
    process.env.PUBLIC_SITE_URL,
    process.env.CONVEX_SITE_URL,
  ]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      if (host.includes(".")) domains.add(host);
    } catch {
      /* Ignore unset or invalid site URLs. */
    }
  }
  return [...domains];
}

export const search = internalAction({
  args: { query: v.string() },
  returns: v.array(v.string()),
  handler: async (_ctx, { query }) => {
    const excludeDomains = searchExcludeDomains();
    const payload = await firecrawlRequest<{
      success?: boolean;
      data?: { web?: { url?: unknown }[] };
    }>(
      "/search",
      {
        query: query.slice(0, 500),
        limit: SEARCH_RESULT_LIMIT,
        sources: ["web"],
        ...(excludeDomains.length ? { excludeDomains } : {}),
        tbs: "qdr:m",
        timeout: 60000,
      },
      65000,
    );
    if (payload.success !== true || !Array.isArray(payload.data?.web))
      throw new Error("Invalid discovery search response");
    const urls = new Set<string>();
    const identities = new Set<string>();
    for (const item of payload.data.web) {
      if (typeof item?.url !== "string") continue;
      try {
        const url = canonicalUrl(item.url);
        if (isPerkdropHost(new URL(url).hostname) || isLowValueDiscovery(url))
          continue;
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
    const unique = [...new Set(urls)];
    const batch = unique.slice(0, ENQUEUE_URL_LIMIT);
    limited += unique.length - batch.length;
    for (const url of batch) {
      if (isPerkdropHost(new URL(url).hostname) || isLowValueDiscovery(url)) {
        duplicates++;
        continue;
      }
      const result = await enqueueIntake(ctx, url, undefined, runId);
      if (!result) limited++;
      else if (result.duplicate) duplicates++;
      else queued++;
    }
    await ctx.db.patch(runId, {
      status: "completed",
      finishedAt: Date.now(),
      found: urls.length,
      queued,
      duplicates,
      limited,
    });
    return null;
  },
});

export const fail = internalMutation({
  args: { runId: v.id("discoveryRuns"), message: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { runId, message }) => {
    const run = await ctx.db.get(runId);
    const detail = message?.replace(/\s+/g, " ").trim().slice(0, 180);
    if (run?.status === "running")
      await ctx.db.patch(runId, {
        status: "failed",
        finishedAt: Date.now(),
        message: detail
          ? `Search failed. ${detail}`
          : "Search failed after retries. Check Firecrawl service access and credits. The next scheduled run will try again.",
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
    } catch (error) {
      await step.runMutation(internal.discovery.fail, {
        runId: args.runId,
        message: error instanceof Error ? error.message : undefined,
      });
    }
    return null;
  });
