import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { providerLogo, safeRewardImage } from "./lib/intakePolicy";
const dropValidator = v.object({
  resourceId: v.id("resources"),
  requiresApplication: v.boolean(),
  requirements: v.array(v.string()),
  slug: v.string(),
  provider: v.string(),
  providerMark: v.string(),
  logoUrl: v.string(),
  title: v.string(),
  description: v.string(),
  value: v.string(),
  category: v.string(),
  resourceType: v.string(),
  eligibility: v.string(),
  region: v.string(),
  source: v.string(),
  sourceType: v.string(),
  ago: v.string(),
  claimed: v.string(),
  confirmed: v.string(),
  expires: v.optional(v.string()),
  requiresCard: v.boolean(),
  claimUrl: v.string(),
  imageUrl: v.optional(v.string()),
});
async function display(
  ctx: QueryCtx,
  row: Doc<"resources">,
  published?: Doc<"publishedOffers"> | null,
) {
  const claimUrl = row.resolvedClaimUrl ?? row.originalClaimUrl ?? "";
  const [provider, publishedRow, version, source] = await Promise.all([
    ctx.db.get(row.providerId),
    published === undefined
      ? ctx.db
          .query("publishedOffers")
          .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
          .unique()
      : Promise.resolve(published),
    ctx.db
      .query("resourceVersions")
      .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
      .order("desc")
      .first(),
    ctx.db
      .query("resourceSources")
      .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
      .first(),
  ]);
  return {
    resourceId: row._id,
    requiresApplication: row.requiresApplication,
    requirements: version?.requirements ?? [],
    slug: row.slug,
    provider: provider?.name ?? "Independent provider",
    providerMark: (provider?.name ?? "P").slice(0, 2).toUpperCase(),
    logoUrl: provider?.logoUrl ?? providerLogo(claimUrl, provider?.name) ?? "",
    title: row.title,
    description: row.description,
    value: row.valueText ?? "See offer",
    category: row.category,
    resourceType: row.resourceType,
    eligibility: version?.eligibility.join(", ") || "Check source",
    region: version?.regions.join(", ") || "Check source",
    source: source?.sourceUrl ?? "",
    sourceType: "Verified submission",
    ago: "Published",
    claimed: `${row.claimedCount ?? 0} claimed`,
    confirmed: `${row.confirmedCount ?? 0} community confirmations`,
    requiresCard: row.requiresCard,
    claimUrl,
    ...(safeRewardImage(publishedRow?.imageUrl, claimUrl)
      ? { imageUrl: safeRewardImage(publishedRow?.imageUrl, claimUrl) }
      : {}),
    ...(row.expiresAt
      ? {
          expires: `Ends ${new Date(row.expiresAt).toISOString().slice(0, 10)}`,
        }
      : {}),
  };
}
export const page = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.string(),
    audience: v.optional(v.string()),
    search: v.string(),
    endingSoon: v.boolean(),
  },
  returns: v.object({
    page: v.array(dropValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const search = args.search.trim().slice(0, 200);
    let query = search
      ? ctx.db.query("publishedOffers").withSearchIndex("search_text", (q) => {
          const match = q.search("text", search);
          return args.category === "Everything"
            ? match
            : match.eq("category", args.category);
        })
      : args.category === "Everything"
        ? ctx.db.query("publishedOffers").order("desc")
        : ctx.db
            .query("publishedOffers")
            .withIndex("by_category", (q) => q.eq("category", args.category))
            .order("desc");
    if (args.audience && args.audience !== "Everyone")
      query = query.filter((q) =>
        q.or(
          q.eq(q.field("audience"), args.audience!),
          q.eq(q.field("audience"), "Everyone"),
        ),
      );
    if (args.endingSoon)
      query = query.filter((q) =>
        q.and(
          q.gt(q.field("expiresAt"), Date.now()),
          q.lte(q.field("expiresAt"), Date.now() + 14 * 86400000),
        ),
      );
    const result = await query.paginate({
      ...args.paginationOpts,
      numItems: 5,
      maximumRowsRead: 200,
    });
    const resources = await Promise.all(
      result.page.map((row) => ctx.db.get(row.resourceId)),
    );
    const rows = (
      await Promise.all(
        result.page.map((published, index) => {
          const row = resources[index];
          if (
            !row ||
            row.status !== "active" ||
            (row.expiresAt && row.expiresAt <= Date.now())
          )
            return null;
          return display(ctx, row, published);
        }),
      )
    ).filter((row) => row !== null);
    return {
      page: rows,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});
export const get = query({
  args: { slug: v.string() },
  returns: v.union(v.null(), dropValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("resources")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return row &&
      row.status === "active" &&
      (!row.expiresAt || row.expiresAt > Date.now())
      ? display(ctx, row)
      : null;
  },
});
