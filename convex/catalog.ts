import { query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  displayValue,
  providerLogo,
  publicMeta,
  safeRewardImage,
  urlIdentity,
} from "./lib/intakePolicy";
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
  foundOn: v.optional(v.string()),
});
function extraFoundOn(claimUrl: string, sources: { sourceUrl: string }[]) {
  for (const source of sources) {
    try {
      if (urlIdentity(source.sourceUrl) !== urlIdentity(claimUrl))
        return { foundOn: source.sourceUrl };
    } catch {
      continue;
    }
  }
  return {};
}
function cardFromPublication(
  row: Doc<"resources">,
  published: Doc<"publishedOffers">,
  sources: { sourceUrl: string }[],
) {
  if (!published.title || !published.slug || !published.claimUrl) return null;
  const claimUrl = published.claimUrl;
  const provider = published.provider ?? "Independent provider";
  return {
    resourceId: row._id,
    requiresApplication:
      published.requiresApplication ?? row.requiresApplication,
    requirements: published.requirements ?? [],
    slug: published.slug,
    provider,
    providerMark: provider.slice(0, 2).toUpperCase(),
    logoUrl: published.logoUrl ?? providerLogo(claimUrl, provider) ?? "",
    title: published.title,
    description: published.description ?? row.description,
    value: displayValue(
      published.valueText?.trim() || row.valueText?.trim() || "",
    ),
    category: published.category || row.category,
    resourceType: row.resourceType,
    eligibility: publicMeta(published.eligibility ?? ""),
    region: publicMeta(published.region ?? ""),
    source: claimUrl,
    sourceType: "Verified submission",
    ago: "Published",
    claimed: `${row.claimedCount ?? 0} claimed`,
    confirmed: `${row.confirmedCount ?? 0} community confirmations`,
    requiresCard: published.requiresCard ?? row.requiresCard,
    claimUrl,
    ...extraFoundOn(claimUrl, sources),
    ...(safeRewardImage(published.imageUrl, claimUrl)
      ? { imageUrl: safeRewardImage(published.imageUrl, claimUrl) }
      : {}),
    ...(row.expiresAt
      ? {
          expires: `Ends ${new Date(row.expiresAt).toISOString().slice(0, 10)}`,
        }
      : {}),
  };
}

async function display(
  ctx: QueryCtx,
  row: Doc<"resources">,
  published?: Doc<"publishedOffers"> | null,
) {
  const publishedRow =
    published === undefined
      ? await ctx.db
          .query("publishedOffers")
          .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
          .unique()
      : published;
  const sources = await ctx.db
    .query("resourceSources")
    .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
    .collect();
  if (publishedRow) {
    const card = cardFromPublication(row, publishedRow, sources);
    if (card) return card;
  }
  const claimUrl = row.resolvedClaimUrl ?? row.originalClaimUrl ?? "";
  const [provider, version] = await Promise.all([
    ctx.db.get(row.providerId),
    ctx.db
      .query("resourceVersions")
      .withIndex("by_resource", (q) => q.eq("resourceId", row._id))
      .order("desc")
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
    value: displayValue(row.valueText?.trim() || ""),
    category: row.category,
    resourceType: row.resourceType,
    eligibility: publicMeta(version?.eligibility.join(", ") || ""),
    region: publicMeta(version?.regions.join(", ") || ""),
    source: claimUrl,
    sourceType: "Verified submission",
    ago: "Published",
    claimed: `${row.claimedCount ?? 0} claimed`,
    confirmed: `${row.confirmedCount ?? 0} community confirmations`,
    requiresCard: row.requiresCard,
    claimUrl,
    ...extraFoundOn(claimUrl, sources),
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
          let match = q.search("text", search);
          if (args.category !== "Everything")
            match = match.eq("category", args.category);
          if (args.endingSoon) match = match.eq("endingSoon", true);
          return match;
        })
      : args.endingSoon && args.category === "Everything"
        ? ctx.db
            .query("publishedOffers")
            .withIndex("by_endingSoon", (q) => q.eq("endingSoon", true))
            .order("desc")
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
    if (args.endingSoon && args.category !== "Everything" && !search)
      query = query.filter((q) => q.eq(q.field("endingSoon"), true));
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
          if (!row || row.status !== "active") return null;
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
