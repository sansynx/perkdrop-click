import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import {
  DISCOVERY_INTENTS,
  DISCOVERY_QUERIES,
  ENQUEUE_URL_LIMIT,
  SEARCH_RESULT_LIMIT,
  SOURCE_SEARCH_BATCH,
  sourceSearchFromClaim,
} from "./discovery";
import { DISCOVERY_DAILY_LIMIT } from "./submissions";
const componentTestModule = "@convex-dev/workflow/test";
const { default: workflow } = await import(componentTestModule);
const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  return t;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DISCOVERY_ENABLED", "true");
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key\r\n");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("keeps explore searches as five product intents, not vendors or UI shelves", () => {
  expect(DISCOVERY_INTENTS).toHaveLength(5);
  expect(DISCOVERY_QUERIES).toEqual(
    DISCOVERY_INTENTS.map((item) => item.query),
  );
  expect(new Set(DISCOVERY_INTENTS.map((item) => item.key)).size).toBe(5);
  expect(DISCOVERY_QUERIES.every((query) => !/\bsite:/i.test(query))).toBe(
    true,
  );
  expect(
    DISCOVERY_QUERIES.every(
      (query) =>
        !/\b(devpost|mlh|github|azure|aws|notion|figma|twilio|jetbrains|namecheap)\b/i.test(
          query,
        ),
    ),
  ).toBe(true);
  expect(DISCOVERY_QUERIES.some((query) => query.includes("AI & APIs"))).toBe(
    false,
  );
});

it("scopes exploit searches to the published host or path and skips Perkdrop", () => {
  expect(
    sourceSearchFromClaim("https://education.github.com/pack"),
  ).toMatchObject({
    key: "source:education.github.com",
    query: "site:education.github.com free credits program eligibility",
    kind: "source",
  });
  expect(
    sourceSearchFromClaim("https://github.com/education/pack"),
  ).toMatchObject({
    key: "source:github.com/education",
    query: "site:github.com/education free credits program eligibility",
  });
  expect(sourceSearchFromClaim("https://resend.com/startups")).toMatchObject({
    key: "source:resend.com/startups",
  });
  expect(sourceSearchFromClaim("https://perkdrop.click/offer")).toBeNull();
  expect(
    sourceSearchFromClaim("https://perkdrop-click.example.workers.dev"),
  ).toBe(null);
});

it("initializes once, preserves disabled searches, and reserves each search only once per cadence", async () => {
  const t = setup();
  expect(await t.mutation(internal.discovery.initialize, {})).toBe(
    DISCOVERY_QUERIES.length,
  );
  expect(await t.mutation(internal.discovery.initialize, {})).toBe(0);
  expect(await t.mutation(internal.discovery.ensureQueries, {})).toBe(0);
  const first = await t.run((ctx) => ctx.db.query("discoveryQueries").first());
  await t.run((ctx) => ctx.db.patch(first!._id, { enabled: false }));
  const enabled = DISCOVERY_QUERIES.length - 1;
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(enabled);
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(0);
  vi.setSystemTime(Date.now() + 3 * 3600000);
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(enabled);
  expect(
    await t.run((ctx) => ctx.db.query("trustedPages").collect()),
  ).toHaveLength(0);
});

it("backfills missing default searches on existing deployments", async () => {
  const t = setup();
  await t.run((ctx) =>
    ctx.db.insert("discoveryQueries", {
      query: DISCOVERY_QUERIES[0],
      enabled: true,
      cadenceHours: 3,
      createdAt: 1,
    }),
  );
  expect(await t.mutation(internal.discovery.ensureQueries, {})).toBe(
    DISCOVERY_QUERIES.length - 1,
  );
  expect(
    await t.run((ctx) => ctx.db.query("discoveryQueries").collect()),
  ).toHaveLength(DISCOVERY_QUERIES.length);
});

it("disables leftover vendor searches that are not in the catalog rule", async () => {
  const t = setup();
  await t.run((ctx) =>
    ctx.db.insert("discoveryQueries", {
      query: "site:devpost.com hackathon prizes credits sponsors",
      enabled: true,
      cadenceHours: 3,
      createdAt: 1,
    }),
  );
  expect(await t.mutation(internal.discovery.ensureQueries, {})).toBe(
    DISCOVERY_QUERIES.length,
  );
  const rows = await t.run((ctx) => ctx.db.query("discoveryQueries").collect());
  expect(rows).toHaveLength(DISCOVERY_QUERIES.length + 1);
  expect(
    rows.find((row) => row.query.startsWith("site:devpost.com"))?.enabled,
  ).toBe(false);
  expect(rows.filter((row) => row.enabled)).toHaveLength(
    DISCOVERY_QUERIES.length,
  );
});

async function publishClaim(t: ReturnType<typeof setup>, claimUrl: string) {
  await t.run(async (ctx) => {
    const providerId = await ctx.db.insert("providers", {
      name: "Example",
      slug: `provider-${claimUrl}`,
      createdAt: 1,
    });
    const resourceId = await ctx.db.insert("resources", {
      slug: `resource-${claimUrl}`,
      providerId,
      title: "Published offer",
      description: "A live catalog offer.",
      category: "Developer Tools",
      resourceType: "credits",
      originalClaimUrl: claimUrl,
      resolvedClaimUrl: claimUrl,
      requiresCard: false,
      requiresApplication: false,
      status: "active",
      firstSeenAt: 1,
      lastSeenAt: 1,
      consecutiveFailures: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("publishedOffers", {
      resourceId,
      text: "Published offer",
      category: "Developer Tools",
    });
  });
}

it("adds exploit searches from published offer hosts after they are approved", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await publishClaim(t, "https://education.github.com/pack");
  expect(await t.mutation(internal.discovery.ensureQueries, {})).toBe(1);
  const rows = await t.run((ctx) => ctx.db.query("discoveryQueries").collect());
  expect(
    rows.find((row) => row.key === "source:education.github.com"),
  ).toMatchObject({
    enabled: true,
    kind: "source",
    query: "site:education.github.com free credits program eligibility",
    cadenceHours: 12,
  });
});

it("adds exploit searches from trusted pages without naming vendors in code", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.run((ctx) =>
    ctx.db.insert("trustedPages", {
      url: "https://resend.com/startups",
      claimUrl: "https://resend.com/startups",
      enabled: true,
    }),
  );
  expect(await t.mutation(internal.discovery.ensureQueries, {})).toBe(1);
  const rows = await t.run((ctx) => ctx.db.query("discoveryQueries").collect());
  expect(
    rows.find((row) => row.key === "source:resend.com/startups"),
  ).toMatchObject({
    enabled: true,
    kind: "source",
  });
});

it("rotates source searches instead of starting every host each cycle", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  for (let index = 0; index < SOURCE_SEARCH_BATCH + 2; index++)
    await publishClaim(t, `https://source-${index}.example.com/pack`);
  await t.mutation(internal.discovery.ensureQueries, {});
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(
    DISCOVERY_QUERIES.length + SOURCE_SEARCH_BATCH,
  );
  const runs = await t.run((ctx) => ctx.db.query("discoveryRuns").collect());
  expect(runs.filter((run) => run.query.startsWith("site:")).length).toBe(
    SOURCE_SEARCH_BATCH,
  );
});

it("queues every new discovery URL instead of capping at five", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  const urls = Array.from(
    { length: 8 },
    (_, index) => `https://example.com/perk-${index}`,
  );
  await t.mutation(internal.discovery.enqueue, { runId: run!._id, urls });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    queued: 8,
  });
});

it("caps discovery enqueue per run and honors the daily discovery budget", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  const urls = Array.from(
    { length: ENQUEUE_URL_LIMIT + 5 },
    (_, index) => `https://example.com/batch-${index}`,
  );
  await t.mutation(internal.discovery.enqueue, { runId: run!._id, urls });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    queued: ENQUEUE_URL_LIMIT,
    limited: 5,
  });
  const later = await t.run(async (ctx) => {
    const query = await ctx.db.query("discoveryQueries").first();
    return ctx.db.insert("discoveryRuns", {
      queryId: query!._id,
      query: query!.query,
      startedAt: Date.now(),
      status: "running",
      found: 0,
      queued: 0,
      duplicates: 0,
      limited: 0,
    });
  });
  await t.run(async (ctx) => {
    const key = `discovery:${Math.floor(Date.now() / 86400000)}`;
    const bucket = await ctx.db
      .query("intakeLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (bucket)
      await ctx.db.patch(bucket._id, { count: DISCOVERY_DAILY_LIMIT });
    else
      await ctx.db.insert("intakeLimits", {
        key,
        count: DISCOVERY_DAILY_LIMIT,
        expiresAt: Date.now() + 86400000,
      });
  });
  await t.mutation(internal.discovery.enqueue, {
    runId: later,
    urls: ["https://example.com/over-budget"],
  });
  expect(await t.run((ctx) => ctx.db.get(later))).toMatchObject({
    queued: 0,
    limited: 1,
  });
});

it("does not spend on discovery when paused", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  vi.stubEnv("DISCOVERY_ENABLED", "false");
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(0);
  expect(
    await t.run((ctx) => ctx.db.query("discoveryRuns").collect()),
  ).toHaveLength(0);
});

it("searches recent public results, normalizes URLs, excludes unsafe results, and trims credentials", async () => {
  const t = setup();
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        data: {
          web: [
            { url: "https://example.com/offer?utm_source=search" },
            { url: "https://example.com/offer#terms" },
            { url: "http://127.0.0.1/internal" },
            { url: "file:///secret" },
            { url: "https://other.example/offer" },
            {
              url: "https://github.com/orgs/community/discussions/197557",
            },
          ],
        },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    await t.action(internal.discovery.search, { query: "free credits" }),
  ).toEqual(["https://example.com/offer", "https://other.example/offer"]);
  const [, options] = fetch.mock.calls[0];
  expect(options.headers.Authorization).toBe("Bearer test-key");
  expect(JSON.parse(options.body)).toMatchObject({
    limit: SEARCH_RESULT_LIMIT,
    tbs: "qdr:m",
  });
});

it("rejects search failures instead of recording a successful empty search", async () => {
  const t = setup();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 429 })),
  );
  await expect(
    t.action(internal.discovery.search, { query: "free credits" }),
  ).rejects.toThrow("HTTP 429");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: {} })),
      ),
  );
  await expect(
    t.action(internal.discovery.search, { query: "free credits" }),
  ).rejects.toThrow("Invalid discovery");
});

it("deduplicates against user submissions and makes enqueue replay safe", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  await t.mutation(api.submissions.create, {
    url: "https://example.com/old",
    anonymousId: "visitor-identifier-001",
  });
  const args = {
    runId: run!._id,
    urls: ["https://example.com/old?utm_source=a", "https://example.com/new"],
  };
  await t.mutation(internal.discovery.enqueue, args);
  await t.mutation(internal.discovery.enqueue, args);
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    status: "completed",
    queued: 1,
    duplicates: 1,
  });
  const jobs = await t.run((ctx) => ctx.db.query("intakeJobs").collect());
  expect(jobs).toHaveLength(2);
  expect(
    jobs.find((j) => j.canonicalUrl.endsWith("/new"))?.discoveryRunId,
  ).toBe(run!._id);
});

it("skips www and query variants of a link already seen", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  await t.mutation(api.submissions.create, {
    url: "https://example.com/pack",
    anonymousId: "visitor-identifier-001",
  });
  await t.mutation(internal.discovery.enqueue, {
    runId: run!._id,
    urls: ["https://www.example.com/pack?utm_source=tweet"],
  });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    queued: 0,
    duplicates: 1,
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(1);
});

it("matches legacy HTTP jobs before an identity has been recorded", async () => {
  const t = setup();
  const id = await t.run((ctx) =>
    ctx.db.insert("intakeJobs", {
      canonicalUrl: "http://example.com/offer",
      status: "pending",
      message: "",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  expect(
    await t.mutation(api.submissions.create, {
      url: "https://example.com/offer",
      anonymousId: "visitor-identifier-001",
    }),
  ).toEqual({ id, duplicate: true });
});

it("keeps distinct query values and case-sensitive paths as separate submissions", async () => {
  const t = setup();
  const ids = [];
  for (const url of [
    "https://example.com/offer",
    "https://example.com/offer?tier=student",
    "https://example.com/offer?tier=startup",
    "https://example.com/Offer",
  ]) {
    const result = await t.mutation(api.submissions.create, {
      url,
      anonymousId: "visitor-identifier-001",
    });
    expect(result.duplicate).toBe(false);
    ids.push(result.id);
  }
  expect(new Set(ids).size).toBe(4);
});

it("does not apply public submission caps to scheduled discovery", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  await t.run((ctx) =>
    ctx.db.insert("intakeLimits", {
      key: `global:${Math.floor(Date.now() / 86400000)}`,
      count: 200,
      expiresAt: Date.now() + 86400000,
    }),
  );
  await t.mutation(internal.discovery.enqueue, {
    runId: run!._id,
    urls: ["https://example.com/new"],
  });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    limited: 0,
    queued: 1,
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(1);
  await expect(
    t.mutation(api.submissions.create, {
      url: "https://example.com/public",
      anonymousId: "visitor-identifier-001",
    }),
  ).rejects.toThrow("submission limit");
});

it("skips self-links without rolling back valid discovery results", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  await t.mutation(internal.discovery.enqueue, {
    runId: run!._id,
    urls: [
      "https://example.com/new",
      "https://perkdrop-click.sansynx.workers.dev/",
    ],
  });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    status: "completed",
    queued: 1,
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(1);
});

it("keeps discovery activity admin-only and records exhausted search failures", async () => {
  const t = setup();
  await t.mutation(internal.discovery.initialize, {});
  await t.mutation(internal.discovery.runScheduled, {});
  const run = await t.run((ctx) => ctx.db.query("discoveryRuns").first());
  await t.mutation(internal.discovery.fail, { runId: run!._id });
  expect(await t.run((ctx) => ctx.db.get(run!._id))).toMatchObject({
    status: "failed",
  });
  await expect(
    t.query(api.admin.discoveryStatus, { session: "invalid" }),
  ).rejects.toThrow("Administrator access required");
});
