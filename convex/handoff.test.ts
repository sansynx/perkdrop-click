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
  return { t, resource: resource!, candidate: candidate!, jobId };
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
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(0);
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
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(0);
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
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(0);
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
  await expect(
    t.mutation(api.submissions.create, {
      url: "https://perkdrop-click.sanathr106.chatgpt.site/drop/example",
      anonymousId: "visitor-identifier-001",
    }),
  ).rejects.toThrow("original offer page");
});

it("approves the rest of a batch when one queued offer has expired", async () => {
  const t = convexTest(schema, modules);
  workflow.register(t);
  async function pending(url: string, title: string) {
    const jobId = await t.run((ctx) =>
      ctx.db.insert("intakeJobs", {
        canonicalUrl: url,
        status: "queued",
        message: "",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await t.mutation(internal.intake.finish, {
      jobId,
      url,
      finalUrl: url,
      offer: { ...offer, title, claimUrl: url },
      markdown: offer.evidence,
    });
    return (await t.run((ctx) =>
      ctx.db
        .query("resourceCandidates")
        .filter((q) => q.eq(q.field("title"), title))
        .first(),
    ))!;
  }
  const live = await pending("https://example.com/live", "Live credits");
  const expired = await pending(
    "https://example.com/expired",
    "Expired credits",
  );
  await t.run(async (ctx) => {
    const details = await ctx.db
      .query("candidateDetails")
      .withIndex("by_candidate", (q) => q.eq("candidateId", expired._id))
      .unique();
    await ctx.db.patch(details!._id, { expiresAt: Date.now() - 1 });
  });
  expect(
    await t.mutation(api.admin.decide, {
      token,
      ids: [live._id, expired._id],
      decision: "approved",
      reason: "Checked original offer and eligibility",
    }),
  ).toBe(2);
  expect(await t.run((ctx) => ctx.db.get(live._id))).toMatchObject({
    status: "approved",
  });
  expect(await t.run((ctx) => ctx.db.get(expired._id))).toMatchObject({
    status: "rejected",
  });
  expect(
    await t.run((ctx) => ctx.db.query("resources").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(1);
});

it("unpublishes an active offer and removes it from the live catalog", async () => {
  const { t, resource, jobId } = await fixture();
  await expect(
    t.mutation(api.admin.unpublish, {
      token: "wrong-token-that-is-long-enough-to-compare",
      resourceId: resource._id,
      reason: "Claim page now requires payment",
    }),
  ).rejects.toThrow("Administrator access required");
  await t.mutation(api.admin.unpublish, {
    token,
    resourceId: resource._id,
  });
  expect(await t.query(api.catalog.get, { slug: resource.slug })).toBeNull();
  expect(await t.query(api.submissions.status, { id: jobId })).toMatchObject({
    status: "rejected",
  });
  expect(await t.run((ctx) => ctx.db.get(resource._id))).toMatchObject({
    status: "archived",
  });
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(0);
});

it("returns a rejected offer to pending review", async () => {
  const { t, candidate } = await fixture();
  await t.run((ctx) =>
    ctx.db.patch(candidate._id, { status: "rejected", reviewedAt: 2 }),
  );
  expect(
    await t.mutation(api.admin.reopen, { token, ids: [candidate._id] }),
  ).toBe(1);
  expect(await t.run((ctx) => ctx.db.get(candidate._id))).toMatchObject({
    status: "pending",
  });
});

it("moves a live offer into another homepage category", async () => {
  const { t, resource } = await fixture();
  await t.mutation(api.admin.recategorize, {
    token,
    resourceId: resource._id,
    category: "Education",
    audience: "Students",
  });
  expect(await t.run((ctx) => ctx.db.get(resource._id))).toMatchObject({
    category: "Education",
  });
  const live = await t.query(api.admin.liveOffers, {
    token,
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(live.page[0]?.category).toBe("Education");
  expect(live.page[0]?.audience).toBe("Students");
});

it("approves from the queue without a typed review note", async () => {
  const { t } = await fixture();
  const jobId = await t.run((ctx) =>
    ctx.db.insert("intakeJobs", {
      canonicalUrl: "https://example.com/second",
      status: "queued",
      message: "",
      createdAt: 2,
      updatedAt: 2,
    }),
  );
  await t.mutation(internal.intake.finish, {
    jobId,
    url: "https://example.com/second",
    finalUrl: "https://example.com/second",
    offer: {
      ...offer,
      title: "Second credits",
      claimUrl: "https://example.com/second",
    },
    markdown: offer.evidence,
  });
  const pending = await t.run((ctx) =>
    ctx.db
      .query("resourceCandidates")
      .filter((q) => q.eq(q.field("title"), "Second credits"))
      .first(),
  );
  expect(
    await t.mutation(api.admin.decide, {
      token,
      ids: [pending!._id],
      decision: "approved",
    }),
  ).toBe(1);
  const queue = await t.query(api.admin.queue, {
    token,
    status: "approved",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(queue.page.some((item) => item.lastReason)).toBe(true);
});

it("preserves administrator placement when changed terms return for review", async () => {
  const { t, resource, candidate } = await fixture();
  await t.mutation(api.admin.recategorize, {
    token,
    resourceId: resource._id,
    category: "Education",
    audience: "Students",
  });
  await t.mutation(internal.revalidation.finish, {
    resourceId: resource._id,
    checkedAt: Date.now(),
    offer: { ...offer, category: "AI & APIs", valueText: "$50" },
    markdown: offer.evidence,
    finalUrl: offer.claimUrl,
  });
  const queue = await t.query(api.admin.queue, {
    token,
    status: "pending",
    paginationOpts: { cursor: null, numItems: 20 },
  });
  expect(queue.page[0]).toMatchObject({
    category: "Education",
    audience: "Students",
  });
  await t.mutation(api.admin.decide, {
    token,
    ids: [candidate._id],
    decision: "approved",
  });
  const page = await t.query(api.catalog.page, {
    category: "Education",
    audience: "Students",
    search: "",
    endingSoon: false,
    paginationOpts: { cursor: null, numItems: 5 },
  });
  expect(page.page).toHaveLength(1);
});

it("rejects invalid placement rather than silently publishing defaults", async () => {
  const { t, resource, candidate } = await fixture();
  await t.mutation(api.admin.unpublish, { token, resourceId: resource._id });
  await t.mutation(api.admin.reopen, { token, ids: [candidate._id] });
  await expect(
    t.mutation(api.admin.decide, {
      token,
      ids: [candidate._id],
      decision: "approved",
      categories: [{ id: candidate._id, category: "made up" }],
    }),
  ).rejects.toThrow("category");
  expect(await t.query(api.catalog.get, { slug: resource.slug })).toBeNull();
});

it("keeps the new moderation mutations private", async () => {
  const { t, resource, candidate } = await fixture();
  await expect(
    t.mutation(api.admin.recategorize, {
      token: "AllGas2026",
      resourceId: resource._id,
      category: "Education",
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    t.mutation(api.admin.reopen, {
      token: "AllGas2026",
      ids: [candidate._id],
    }),
  ).rejects.toThrow("Administrator access required");
});

it("does not expose legacy cross-origin reward images", async () => {
  const { t, resource } = await fixture();
  await t.run(async (ctx) => {
    const publication = await ctx.db.query("publishedOffers").first();
    await ctx.db.patch(publication!._id, {
      imageUrl: "https://tracker.example/pixel",
    });
  });
  expect(
    (await t.query(api.catalog.get, { slug: resource.slug }))?.imageUrl,
  ).toBeUndefined();
});

it("rechecks more than ten due offers in one scheduled run", async () => {
  const { t, resource } = await fixture();
  await t.run(async (ctx) => {
    const current = await ctx.db.get(resource._id);
    await ctx.db.patch(resource._id, { recheckAfter: 0 });
    for (let i = 0; i < 10; i++) {
      const { _id, _creationTime, ...fields } = current!;
      void _id;
      void _creationTime;
      await ctx.db.insert("resources", {
        ...fields,
        slug: `${fields.slug}-${i}`,
        recheckAfter: 0,
      });
    }
  });
  expect(await t.mutation(internal.revalidation.runScheduled, {})).toBe(11);
});
