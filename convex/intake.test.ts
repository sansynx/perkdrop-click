import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
const componentTestModule = "@convex-dev/workflow/test";
const { default: workflow } = await import(componentTestModule);
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const token = "test-administrator-token-with-enough-length";
const offer = {
  provider: "Resend",
  title: "Startup email credits",
  description: "Email credits for startups.",
  claimUrl: "https://resend.com/startups",
  valueText: "$100",
  eligibility: ["Startups"],
  requirements: [],
  regions: ["Worldwide"],
  requiresCard: false,
  requiresApplication: false,
  evidence: "Startups receive one hundred dollars in email credits.",
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
function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  return t;
}
it("atomically coalesces simultaneous tracking URL variants", async () => {
  const t = setup();
  const receipts = await Promise.all([
    t.mutation(api.submissions.create, {
      url: "https://resend.com/startups?utm_source=a",
      anonymousId: "visitor-identifier-001",
    }),
    t.mutation(api.submissions.create, {
      url: "https://resend.com/startups#offer",
      anonymousId: "visitor-identifier-002",
    }),
  ]);
  expect(receipts[0].id).toBe(receipts[1].id);
  expect(receipts.filter((x) => x.duplicate)).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(1);
});
it("merges exact offers, preserves variants, and publishes approvals once", async () => {
  const t = setup();
  async function finish(
    url: string,
    valueText = "$100",
    claimUrl = offer.claimUrl,
  ) {
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
      offer: { ...offer, valueText, claimUrl },
      markdown: offer.evidence,
    });
    return jobId;
  }
  await finish("https://example.com/one");
  await finish("https://example.com/two");
  await finish("https://example.com/three", "$200");
  await finish(
    "https://medium.com/some-post",
    "$100",
    "https://resend.com/startups",
  );
  const candidates = await t.run((ctx) =>
    ctx.db.query("resourceCandidates").collect(),
  );
  expect(candidates).toHaveLength(1);
  await expect(
    t.query(api.admin.queue, {
      session: "wrong",
      status: "pending",
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Administrator access required");
  const session = (await t.mutation(api.admin.startSession, { token })).session;
  const args = {
    session,
    ids: [candidates[0]._id],
    decision: "approved" as const,
    reason: "Verified original source and all offer terms",
  };
  expect(await t.mutation(api.admin.decide, args)).toBe(1);
  expect(await t.mutation(api.admin.decide, args)).toBe(0);
  expect(
    await t.run((ctx) => ctx.db.query("resources").collect()),
  ).toHaveLength(1);
  const page = await t.query(api.catalog.page, {
    category: "Everything",
    search: "",
    endingSoon: false,
    paginationOpts: { cursor: null, numItems: 5 },
  });
  expect(page.page[0].claimUrl).toBe(offer.claimUrl);
  expect(page.page[0].logoUrl).toContain("simpleicons.org/resend");
  expect(
    await t.run((ctx) => ctx.db.query("resourceSources").collect()),
  ).toHaveLength(4);
  const search = await t.query(api.catalog.page, {
    category: "Everything",
    search: "email",
    audience: "Startups",
    endingSoon: false,
    paginationOpts: { cursor: null, numItems: 5 },
  });
  expect(search.page).toHaveLength(1);
  const students = await t.query(api.catalog.page, {
    category: "Everything",
    search: "email",
    audience: "Students",
    endingSoon: false,
    paginationOpts: { cursor: null, numItems: 5 },
  });
  expect(students.page).toHaveLength(0);
});
it("only auto-publishes explicitly trusted, evidence-backed pages", async () => {
  const t = setup();
  await t.mutation(internal.admin.trustPage, {
    url: offer.claimUrl,
    claimUrl: offer.claimUrl,
    enabled: true,
  });
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
  expect((await t.query(api.submissions.status, { id: jobId }))?.status).toBe(
    "approved",
  );
  expect(
    await t.run((ctx) => ctx.db.query("resources").collect()),
  ).toHaveLength(1);
});
it("blocks paid intake when global quota is exhausted without reserving a URL", async () => {
  const t = setup();
  await t.run((ctx) =>
    ctx.db.insert("intakeLimits", {
      key: `global:${Math.floor(Date.now() / 86400000)}`,
      count: 200,
      expiresAt: Date.now() + 86400000,
    }),
  );
  await expect(
    t.mutation(api.submissions.create, {
      url: "https://resend.com/new",
      anonymousId: "visitor-identifier-001",
    }),
  ).rejects.toThrow("submission limit");
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(0);
});
