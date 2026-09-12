import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function removePublication(
  ctx: MutationCtx,
  resourceId: Id<"resources">,
) {
  const row = await ctx.db
    .query("publishedOffers")
    .withIndex("by_resource", (q) => q.eq("resourceId", resourceId))
    .unique();
  if (row) await ctx.db.delete(row._id);
}
