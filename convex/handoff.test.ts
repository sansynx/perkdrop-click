import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const componentTestModule = "@convex-dev/workflow/test";
const { default: workflow } = await import(componentTestModule);
const modules = import.meta.glob("./**/*.ts");
const token = "test-administrator-token-with-enough-length";
const offer = {
  provider: "Example",
  title: "Developer credits",
  description: "Credits for developers.",
  claimUrl: "https://example.com/offer",
  valueText: "$100",
  eligibility: ["Developers"],
  requirements: [],
  regions: ["Worldwide"],
  requiresCard: false,
  requiresApplication: false,
  evidence: "All developers can claim one hundred dollars of credits.",
  isOffer: true,
  termsKnown: true,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  vi.stubEnv("ADMIN_REVIEW_TOKEN", token);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function fixture() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const jobId = await t.run((ctx) =>
    ctx.db.insert("intakeJobs", {
      canonicalUrl: offer.claimUrl,
      status: "queued",
      message: "",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await t.mutation(internal.intake.finish, {
    jobId,
    url: offer.claimUrl,
    finalUrl: offer.claimUrl,
    offer,
    markdown: offer.evidence,
  });
  const candidate = await t.run((ctx) =>
    ctx.db.query("resourceCandidates").first(),
  );
  await t.mutation(api.admin.decide, {
    token,
    ids: [candidate!._id],
    decision: "approved",
    reason: "Checked original offer and eligibility",
  });
  const resource = await t.run((ctx) => ctx.db.query("resources").first());
  return { t, resource: resource!, candidate: candidate! };
}
it("persists anonymous feedback once and reads bounded aggregate counts", async () => {
  const { t, resource } = await fixture();
  const args = {
    resourceId: resource._id,
    reactionType: "claimed" as const,
    anonymousId: "visitor-identifier-001",
  };
  const a = await t.mutation(api.reactions.add, args);
  expect(await t.mutation(api.reactions.add, args)).toBe(a);
  expect(
    await t.query(api.reactions.getSummary, { resourceId: resource._id }),
  ).toEqual({ claimed: 1 });
  expect(
    (await t.query(api.catalog.get, { slug: resource.slug }))?.claimed,
  ).toBe("1 claimed");
  await t.run((ctx) => ctx.db.patch(resource._id, { status: "expired" }));
  await expect(
    t.mutation(api.reactions.add, { ...args, reactionType: "works" }),
  ).rejects.toThrow("no longer available");
});
it("blocks reaction spam at the shared limit", async () => {
  const { t, resource } = await fixture();
  await t.run((ctx) =>
    ctx.db.insert("intakeLimits", {
      key: `reaction:global:${Math.floor(Date.now() / 3600000)}`,
      count: 1000,
      expiresAt: Date.now() + 3600000,
    }),
  );
  await expect(
    t.mutation(api.reactions.add, {
      resourceId: resource._id,
      reactionType: "works",
      anonymousId: "visitor-identifier-001",
    }),
  ).rejects.toThrow("Too many feedback");
  expect(
    await t.query(api.reactions.getSummary, { resourceId: resource._id }),
  ).toEqual({});
});
it("hides expired detail pages before the cron and archives them without deletion", async () => {
  const { t, resource } = await fixture();
  await t.run((ctx) =>
    ctx.db.patch(resource._id, { expiresAt: Date.now() - 1 }),
  );
  expect(await t.query(api.catalog.get, { slug: resource.slug })).toBeNull();
  expect(await t.mutation(internal.lifecycle.processExpiry, {})).toEqual({
    expired: 1,
  });
  expect(await t.mutation(internal.lifecycle.processExpiry, {})).toEqual({
    expired: 0,
  });
  expect(await t.run((ctx) => ctx.db.get(resource._id))).toMatchObject({
    status: "expired",
  });
});
it("revalidates unchanged offers idempotently", async () => {
  const { t, resource } = await fixture();
  const args = {
    resourceId: resource._id,
    checkedAt: Date.now(),
    offer,
    markdown: offer.evidence,
    finalUrl: offer.claimUrl,
  };
  await t.mutation(internal.revalidation.finish, args);
  await t.mutation(internal.revalidation.finish, args);
  expect(await t.run((ctx) => ctx.db.get(resource._id))).toMatchObject({
    status: "active",
    consecutiveFailures: 0,
  });
  expect(
    await t.run((ctx) => ctx.db.query("resourceChecks").collect()),
  ).toHaveLength(1);
});
it("queues changed terms and republishes the same resource after review", async () => {
  const { t, resource, candidate } = await fixture();
  await t.mutation(internal.revalidation.finish, {
    resourceId: resource._id,
    checkedAt: Date.now(),
    offer: { ...offer, valueText: "$50", requiresApplication: true },
    markdown: offer.evidence,
    finalUrl: offer.claimUrl,
  });
  expect(await t.query(api.catalog.get, { slug: resource.slug })).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(candidate._id))).toMatchObject({
    status: "pending",
    valueText: "$50",
  });
  await t.mutation(api.admin.decide, {
    token,
    ids: [candidate._id],
    decision: "approved",
    reason: "Confirmed the new application requirements",
  });
  expect(await t.query(api.catalog.get, { slug: resource.slug })).toMatchObject(
    { value: "$50", requiresApplication: true },
  );
  expect(
    await t.run((ctx) => ctx.db.query("resources").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("resourceVersions").collect()),
  ).toHaveLength(2);
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(1);
});
it("keeps temporary failures visible but queues review after three failed checks", async () => {
  const { t, resource, candidate } = await fixture();
  for (let i = 1; i <= 3; i++)
    await t.mutation(internal.revalidation.fail, {
      resourceId: resource._id,
      checkedAt: Date.now() + i,
    });
  expect(await t.run((ctx) => ctx.db.get(resource._id))).toMatchObject({
    status: "needs_recheck",
    consecutiveFailures: 3,
  });
  expect(await t.run((ctx) => ctx.db.get(candidate._id))).toMatchObject({
    status: "pending",
  });
});
it("reserves due rechecks once and clears only expired rate buckets", async () => {
  const { t, resource } = await fixture();
  await t.run((ctx) => ctx.db.patch(resource._id, { recheckAfter: 0 }));
  expect(await t.mutation(internal.revalidation.runScheduled, {})).toBe(1);
  expect(await t.mutation(internal.revalidation.runScheduled, {})).toBe(0);
  await t.run(async (ctx) => {
    await ctx.db.insert("intakeLimits", {
      key: "old",
      count: 1,
      expiresAt: Date.now() - 1,
    });
    await ctx.db.insert("intakeLimits", {
      key: "new",
      count: 1,
      expiresAt: Date.now() + 3600000,
    });
  });
  expect(await t.mutation(internal.lifecycle.cleanupLimits, {})).toBe(1);
  expect(
    await t.run((ctx) => ctx.db.query("intakeLimits").collect()),
  ).toHaveLength(1);
});
it("rejects crawler loops back into Perkdrop", async () => {
  const { t } = await fixture();
  await expect(
    t.mutation(api.submissions.create, {
      url: "https://perkdrop.click/drop/example",
      anonymousId: "visitor-identifier-001",
    }),
  ).rejects.toThrow("original offer page");
});
