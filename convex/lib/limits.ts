import type { MutationCtx } from "../_generated/server";

export async function reserveLimit(
  ctx: MutationCtx,
  buckets: readonly (readonly [
    key: string,
    maximum: number,
    expiresAt: number,
  ])[],
) {
  const updates = [];
  for (const [key, maximum, expiresAt] of buckets) {
    const bucket = await ctx.db
      .query("intakeLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (bucket && bucket.count >= maximum) return false;
    updates.push({ key, expiresAt, bucket });
  }
  for (const { key, expiresAt, bucket } of updates) {
    if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    else await ctx.db.insert("intakeLimits", { key, count: 1, expiresAt });
  }
  return true;
}
