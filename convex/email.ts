import {
  internalAction,
  internalMutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { enqueueIntake } from "./submissions";
import type { Id } from "./_generated/dataModel";
import {
  extractPublicUrls,
  noticeMail,
  receiptMail,
  senderEmail,
} from "./lib/emailIntake";

const receiptValidator = v.object({
  id: v.id("intakeJobs"),
  duplicate: v.boolean(),
  url: v.string(),
});
const ingestResultValidator = v.object({
  queued: v.number(),
  duplicates: v.number(),
  skipped: v.number(),
  unavailable: v.boolean(),
  urls: v.number(),
  receipts: v.array(receiptValidator),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function hasIntakeLabel(value: Record<string, unknown>) {
  const labels = value.labels;
  return (
    Array.isArray(labels) &&
    labels.some(
      (label) =>
        typeof label === "string" && label.toLowerCase() === "perk-intake",
    )
  );
}

async function ingestMail(
  ctx: MutationCtx,
  args: { subject: string; text: string; html?: string },
) {
  const urls = extractPublicUrls(args.subject, args.text, args.html);
  const receipts: { id: Id<"intakeJobs">; duplicate: boolean; url: string }[] =
    [];
  let queued = 0,
    duplicates = 0,
    skipped = 0,
    unavailable = false;
  for (const url of urls) {
    try {
      const result = await enqueueIntake(ctx, url);
      if (!result) {
        skipped++;
        continue;
      }
      receipts.push({ ...result, url });
      if (result.duplicate) duplicates++;
      else queued++;
    } catch (error) {
      if (!(error instanceof ConvexError)) throw error;
      skipped++;
      if (
        error instanceof ConvexError &&
        String(error.data).includes("temporarily unavailable")
      )
        unavailable = true;
    }
  }
  return {
    queued,
    duplicates,
    skipped,
    unavailable,
    urls: urls.length,
    receipts,
  };
}

export const intakeAddress = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async () => {
    const address = process.env.AGENTMAIL_INTAKE_ADDRESS?.trim().toLowerCase();
    if (
      !address ||
      address.length > 320 ||
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(address)
    )
      return null;
    return address;
  },
});

export const ingestForwardedMail = internalMutation({
  args: {
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => ingestMail(ctx, args),
});

export const onMessageReceived = internalMutation({
  args: { message: v.any(), thread: v.any(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = asRecord(args.message);
    if (hasIntakeLabel(message)) return null;
    const from = senderEmail(message.from);
    const intake = process.env.AGENTMAIL_INTAKE_ADDRESS?.trim().toLowerCase();
    if (from && intake && from === intake) return null;
    const inboxId =
      stringField(message, "inbox_id") ?? stringField(message, "inboxId");
    if (!intake || !from || inboxId?.trim().toLowerCase() !== intake)
      return null;
    const messageId =
      stringField(message, "message_id") ?? stringField(message, "messageId");
    const result = await ingestMail(ctx, {
      subject: stringField(message, "subject") ?? "",
      text: [
        stringField(message, "text"),
        stringField(message, "extracted_text"),
      ]
        .filter(Boolean)
        .join("\n"),
      html:
        stringField(message, "html") ?? stringField(message, "extracted_html"),
    });
    if (!from || !inboxId) return null;
    if (!result.receipts.length && !result.unavailable && result.urls === 0)
      return null;
    if (!(await reserveReceipt(ctx, from))) return null;
    const copy = result.receipts.length
      ? receiptMail(result.receipts)
      : noticeMail(result.unavailable ? "unavailable" : "limited");
    await ctx.scheduler.runAfter(0, internal.email.sendReceipt, {
      inboxId,
      to: from,
      text: copy.text,
      html: copy.html,
      ...(messageId ? { messageId } : {}),
    });
    return null;
  },
});

async function reserveReceipt(ctx: MutationCtx, sender: string) {
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000);
  const day = Math.floor(now / 86_400_000);
  const limits: [string, number, number][] = [
    [`mail:sender:${sender}:${hour}`, 5, (hour + 1) * 3_600_000],
    [`mail:global:${day}`, 200, (day + 1) * 86_400_000],
  ];
  const updates = [];
  for (const [key, maximum, expiresAt] of limits) {
    const bucket = await ctx.db
      .query("intakeLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (bucket && bucket.count >= maximum) return false;
    updates.push({ key, expiresAt, bucket });
  }
  for (const { key, expiresAt, bucket } of updates) {
    if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    else await ctx.db.insert("intakeLimits", { key, count: 1, expiresAt });
  }
  return true;
}

export const sendReceipt = internalAction({
  args: {
    inboxId: v.string(),
    to: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    messageId: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = process.env.AGENTMAIL_API_KEY?.trim();
    if (!key) return null;
    const payload = {
      text: args.text,
      ...(args.html ? { html: args.html } : {}),
      labels: ["perk-intake"],
    };
    let response: Response | undefined;
    try {
      if (args.messageId) {
        response = await agentmailRequest(
          key,
          `/inboxes/${encodeURIComponent(args.inboxId)}/messages/${encodeURIComponent(args.messageId)}/reply`,
          payload,
        );
      }
      // Only a missing original message permits a new-message fallback.
      if (!response || response.status === 404) {
        response = undefined;
        response = await agentmailRequest(
          key,
          `/inboxes/${encodeURIComponent(args.inboxId)}/messages/send`,
          { to: args.to, subject: "Got your perk", ...payload },
        );
      }
    } catch {
      // A transport failure is retryable, but its message may contain secrets.
    }
    if (response?.ok) return null;
    const attempt = args.attempt ?? 0;
    const transient =
      !response || response.status === 429 || response.status >= 500;
    if (transient && attempt < 2) {
      await ctx.scheduler.runAfter(
        30_000 * 2 ** attempt,
        internal.email.sendReceipt,
        { ...args, attempt: attempt + 1 },
      );
      return null;
    }
    throw new Error(
      `AgentMail receipt failed (${response ? `HTTP ${response.status}` : "network error"})`,
    );
  },
});

async function agentmailRequest(
  key: string,
  path: string,
  body: Record<string, unknown>,
) {
  const base = (
    process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to/v0"
  ).replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}
