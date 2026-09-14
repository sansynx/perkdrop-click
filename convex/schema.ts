import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const status = v.union(
  v.literal("candidate"),
  v.literal("active"),
  v.literal("ending_soon"),
  v.literal("needs_recheck"),
  v.literal("expired"),
  v.literal("dead"),
  v.literal("archived"),
  v.literal("replaced"),
);
const sourceStatus = v.union(
  v.literal("active"),
  v.literal("deleted"),
  v.literal("unreachable"),
  v.literal("login_required"),
);
const reactionType = v.union(
  v.literal("claimed"),
  v.literal("works"),
  v.literal("expired"),
  v.literal("needs_card"),
  v.literal("region_issue"),
  v.literal("not_free"),
);

export default defineSchema({
  publishedOffers: defineTable({
    audience: v.optional(v.string()),
    resourceId: v.id("resources"),
    text: v.string(),
    category: v.string(),
    expiresAt: v.optional(v.number()),
    endingSoon: v.optional(v.boolean()),
    imageUrl: v.optional(v.string()),
    slug: v.optional(v.string()),
    title: v.optional(v.string()),
    provider: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    valueText: v.optional(v.string()),
    eligibility: v.optional(v.string()),
    region: v.optional(v.string()),
    claimUrl: v.optional(v.string()),
    requiresCard: v.optional(v.boolean()),
    requiresApplication: v.optional(v.boolean()),
    requirements: v.optional(v.array(v.string())),
  })
    .index("by_resource", ["resourceId"])
    .index("by_category", ["category"])
    .index("by_endingSoon", ["endingSoon"])
    .index("by_expiresAt", ["expiresAt"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["category", "endingSoon"],
    }),
  intakeJobs: defineTable({
    discoveryRunId: v.optional(v.id("discoveryRuns")),
    canonicalUrl: v.string(),
    status: v.string(),
    candidateId: v.optional(v.id("resourceCandidates")),
    message: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_url", ["canonicalUrl"])
    .index("by_candidate", ["candidateId"])
    .index("by_status", ["status"]),
  intakeLimits: defineTable({
    key: v.string(),
    count: v.number(),
    expiresAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_expiry", ["expiresAt"]),
  offerKeys: defineTable({
    key: v.string(),
    candidateId: v.id("resourceCandidates"),
  }).index("by_key", ["key"]),
  candidateDetails: defineTable({
    logoUrl: v.optional(v.string()),
    candidateId: v.id("resourceCandidates"),
    jobId: v.id("intakeJobs"),
    reasons: v.array(v.string()),
    imageUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    resourceId: v.optional(v.id("resources")),
  })
    .index("by_candidate", ["candidateId"])
    .index("by_resource", ["resourceId"]),
  reviewAudit: defineTable({
    candidateId: v.id("resourceCandidates"),
    decision: v.string(),
    reason: v.string(),
    actor: v.string(),
    createdAt: v.number(),
  }).index("by_candidate", ["candidateId"]),
  trustedPages: defineTable({
    url: v.string(),
    claimUrl: v.string(),
    enabled: v.boolean(),
  }).index("by_url", ["url"]),
  providers: defineTable({
    name: v.string(),
    slug: v.string(),
    logoUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),
  resources: defineTable({
    verificationKey: v.optional(v.string()),
    recheckAfter: v.optional(v.number()),
    claimedCount: v.optional(v.number()),
    confirmedCount: v.optional(v.number()),
    slug: v.string(),
    providerId: v.id("providers"),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    resourceType: v.string(),
    valueText: v.optional(v.string()),
    originalClaimUrl: v.optional(v.string()),
    resolvedClaimUrl: v.optional(v.string()),
    requiresCard: v.boolean(),
    requiresApplication: v.boolean(),
    availabilityType: v.optional(v.string()),
    status,
    startsAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    lastVerifiedAt: v.optional(v.number()),
    communityConfirmedAt: v.optional(v.number()),
    consecutiveFailures: v.number(),
    eventName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_provider", ["providerId"])
    .index("by_status_expiry", ["status", "expiresAt"])
    .index("by_status_recheck", ["status", "recheckAfter"]),
  reactionCounts: defineTable({
    resourceId: v.id("resources"),
    reactionType,
    count: v.number(),
  }).index("by_resource_type", ["resourceId", "reactionType"]),
  resourceSources: defineTable({
    resourceId: v.id("resources"),
    sourceType: v.string(),
    sourceUrl: v.string(),
    authorName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    isPrimary: v.boolean(),
    status: sourceStatus,
    firstSeenAt: v.number(),
    lastCheckedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_resource", ["resourceId"])
    .index("by_resource_url", ["resourceId", "sourceUrl"]),
  resourceReactions: defineTable({
    resourceId: v.id("resources"),
    reactionType,
    anonymousId: v.string(),
    country: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resource", ["resourceId"])
    .index("by_visitor_reaction", [
      "resourceId",
      "anonymousId",
      "reactionType",
    ]),
  resourceChecks: defineTable({
    resourceId: v.id("resources"),
    checkedAt: v.number(),
    httpStatus: v.optional(v.number()),
    finalUrl: v.optional(v.string()),
    offerDetected: v.boolean(),
    result: v.string(),
    changeSummary: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_resource", ["resourceId"])
    .index("by_checkedAt", ["checkedAt"]),
  resourceVersions: defineTable({
    resourceId: v.id("resources"),
    valueText: v.optional(v.string()),
    eligibility: v.array(v.string()),
    expiresAt: v.optional(v.number()),
    claimUrl: v.optional(v.string()),
    requirements: v.array(v.string()),
    regions: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_resource", ["resourceId"]),
  resourceCandidates: defineTable({
    audience: v.optional(v.string()),
    sourceUrl: v.string(),
    provider: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    resourceType: v.string(),
    valueText: v.optional(v.string()),
    eligibility: v.array(v.string()),
    requirements: v.array(v.string()),
    regions: v.array(v.string()),
    requiresCard: v.boolean(),
    requiresApplication: v.boolean(),
    claimUrl: v.optional(v.string()),
    evidence: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    reviewedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),
  adminSessions: defineTable({
    hash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_hash", ["hash"])
    .index("by_expiry", ["expiresAt"]),
  discoveryQueries: defineTable({
    query: v.string(),
    enabled: v.boolean(),
    cadenceHours: v.number(),
    lastRunAt: v.optional(v.number()),
    createdAt: v.number(),
    key: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("intent"), v.literal("source"))),
  })
    .index("by_enabled", ["enabled"])
    .index("by_key", ["key"]),
  discoveryRuns: defineTable({
    queryId: v.id("discoveryQueries"),
    query: v.string(),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    found: v.number(),
    queued: v.number(),
    duplicates: v.number(),
    limited: v.number(),
    message: v.optional(v.string()),
  }).index("by_started", ["startedAt"]),
  seenUrls: defineTable({
    identity: v.string(),
    jobId: v.id("intakeJobs"),
    createdAt: v.number(),
  }).index("by_identity", ["identity"]),
});
