import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { DISCOVERY_QUERIES, SEARCH_RESULT_LIMIT } from "./discovery";
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
    t.query(api.admin.discoveryStatus, { token: "invalid" }),
  ).rejects.toThrow("Administrator access required");
});
