import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { DEMO_CREDENTIAL } from "./reviewer-demo";
const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());

it("rejects the public demo credential at production admin boundaries", async () => {
  vi.stubEnv(
    "ADMIN_REVIEW_TOKEN",
    "private-production-token-not-shared-with-demo",
  );
  const t = convexTest(schema, modules);
  await expect(
    t.query(api.admin.queue, {
      token: DEMO_CREDENTIAL,
      status: "pending",
      paginationOpts: { cursor: null, numItems: 20 },
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    t.query(api.admin.discoveryStatus, { token: DEMO_CREDENTIAL }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    t.mutation(api.admin.decide, {
      token: DEMO_CREDENTIAL,
      ids: [],
      decision: "approved",
      reason: "Demo attempt",
    }),
  ).rejects.toThrow("Administrator access required");
  await expect(
    t.query(api.admin.liveOffers, {
      token: DEMO_CREDENTIAL,
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  ).rejects.toThrow("Administrator access required");
  expect(
    await t.run((ctx) => ctx.db.query("publishedOffers").collect()),
  ).toHaveLength(0);
});
