import type { QueryCtx } from "../_generated/server";

export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

export async function hashSessionSecret(secret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function newSessionSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isSessionSecret(value: string) {
  return /^[a-f0-9]{64}$/.test(value);
}

export function authorizeOperatorToken(token: string) {
  const expected = process.env.ADMIN_REVIEW_TOKEN?.trim();
  if (!expected || expected.length < 32 || token.length !== expected.length)
    throw new Error("Administrator access required");
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  if (difference) throw new Error("Administrator access required");
}

export async function authorizeSession(
  ctx: { db: QueryCtx["db"] },
  session: string,
) {
  if (!isSessionSecret(session))
    throw new Error("Administrator access required");
  const hash = await hashSessionSecret(session);
  const row = await ctx.db
    .query("adminSessions")
    .withIndex("by_hash", (q) => q.eq("hash", hash))
    .unique();
  if (!row || row.expiresAt <= Date.now())
    throw new Error("Administrator access required");
  return row;
}
