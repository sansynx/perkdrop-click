import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
const componentTestModule = "@convex-dev/workflow/test";
const { default: workflow } = await import(componentTestModule);
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  return t;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("FIRECRAWL_API_KEY", "test-key");
  vi.stubEnv("AGENTMAIL_INTAKE_ADDRESS", "drops@agentmail.to");
  vi.stubEnv("AGENTMAIL_WEBHOOK_SECRET", "whsec_dGVzdC1zaWduaW5nLWtleQ==");
});

it("rejects unsigned requests at the webhook boundary", async () => {
  const t = setup();
  const response = await t.fetch("/agentmail/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "message.received",
      event_id: "forged",
    }),
  });
  expect(response.status).toBe(401);
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(0);
}, 30_000);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("ignores mail received by a different inbox", async () => {
  const t = setup();
  await t.mutation(internal.email.onMessageReceived, {
    eventId: "other-inbox",
    thread: {},
    message: {
      from: "founder@example.com",
      inbox_id: "private@agentmail.to",
      text: "https://example.com/private-offer",
    },
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(0);
});

it("retries transient receipt failures with a bounded schedule", async () => {
  const t = setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "test-mail-key");
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await t.action(internal.email.sendReceipt, {
    inboxId: "drops@agentmail.to",
    to: "founder@example.com",
    text: "queued",
  });
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled).toHaveLength(1);
  expect(scheduled[0].args[0]).toMatchObject({ attempt: 1 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("does not fall back to sending after an authorization failure", async () => {
  const t = setup();
  vi.stubEnv("AGENTMAIL_API_KEY", "test-mail-key");
  const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    t.action(internal.email.sendReceipt, {
      inboxId: "drops@agentmail.to",
      to: "founder@example.com",
      messageId: "m1",
      text: "queued",
    }),
  ).rejects.toThrow("HTTP 401");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("caps duplicate-triggered receipts per sender", async () => {
  const t = setup();
  for (let i = 0; i < 6; i++) {
    await t.mutation(internal.email.onMessageReceived, {
      eventId: `duplicate-${i}`,
      thread: {},
      message: {
        inbox_id: "drops@agentmail.to",
        from: "founder@example.com",
        text: "https://example.com/offer",
      },
    });
  }
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(
    scheduled.filter((job) => job.args[0]?.to === "founder@example.com"),
  ).toHaveLength(5);
});

it("queues public links from forwarded mail through the shared intake path", async () => {
  const t = setup();
  const first = await t.mutation(internal.email.ingestForwardedMail, {
    subject: "Startup credits https://resend.com/startups",
    text: "Ignore https://perkdrop.click/drop/x and reuse https://resend.com/startups?utm_source=nl",
  });
  expect(first).toMatchObject({ queued: 1, duplicates: 0, urls: 1 });
  const again = await t.mutation(internal.email.ingestForwardedMail, {
    subject: "Startup credits",
    text: "https://resend.com/startups",
  });
  expect(again).toMatchObject({ queued: 0, duplicates: 1, urls: 1 });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(1);
});

it("skips receipts when AgentMail is not configured on the parent deployment", async () => {
  const t = setup();
  await expect(
    t.action(internal.email.sendReceipt, {
      inboxId: "drops@agentmail.to",
      to: "founder@example.com",
      text: "queued",
    }),
  ).resolves.toBeNull();
});

it("exposes the public intake address and ignores labeled receipt mail", async () => {
  const t = setup();
  expect(await t.query(api.email.intakeAddress, {})).toBe("drops@agentmail.to");
  await t.mutation(internal.email.onMessageReceived, {
    eventId: "evt_1",
    thread: {},
    message: {
      labels: ["perk-intake"],
      from: "founder@example.com",
      inbox_id: "in_1",
      text: "https://resend.com/startups",
    },
  });
  expect(
    await t.run((ctx) => ctx.db.query("intakeJobs").collect()),
  ).toHaveLength(0);
});
