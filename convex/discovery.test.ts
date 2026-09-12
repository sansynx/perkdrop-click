import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
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
  expect(await t.mutation(internal.discovery.initialize, {})).toBe(4);
  expect(await t.mutation(internal.discovery.initialize, {})).toBe(0);
  const first = await t.run((ctx) => ctx.db.query("discoveryQueries").first());
  await t.run((ctx) => ctx.db.patch(first!._id, { enabled: false }));
  const counts = await Promise.all([
    t.mutation(internal.discovery.runScheduled, {}),
    t.mutation(internal.discovery.runScheduled, {}),
  ]);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(0);
  vi.setSystemTime(Date.now() + 3 * 3600000);
  expect(await t.mutation(internal.discovery.runScheduled, {})).toBe(3);
  expect(
    await t.run((ctx) => ctx.db.query("trustedPages").collect()),
  ).toHaveLength(0);
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
  expect(JSON.parse(options.body)).toMatchObject({ limit: 5, tbs: "qdr:m" });
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

it("honors shared daily limits without reserving skipped URLs or charging domain quota", async () => {
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
    limited: 1,
    queued: 0,
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(0);
  expect(
    await t.run((ctx) => ctx.db.query("intakeLimits").collect()),
  ).toHaveLength(1);
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
