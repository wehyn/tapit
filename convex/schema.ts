import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const profileLink = v.object({
  id: v.string(),
  label: v.string(),
  destination: v.string(),
  enabled: v.boolean(),
  icon: v.optional(v.string()),
});

const profileContent = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  links: v.array(profileLink),
});

const publishedProfile = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  links: v.array(profileLink),
  publishedAt: v.number(),
});

export default defineSchema({
  ...authTables,
  customers: defineTable({
    userId: v.optional(v.id("users")),
    email: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    status: v.union(v.literal("invited"), v.literal("active"), v.literal("deleted")),
    profileId: v.optional(v.id("profiles")),
    deletionStatus: v.union(v.literal("active"), v.literal("requested"), v.literal("deleted")),
    deletionRequestedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),
  profiles: defineTable({
    ownerId: v.id("customers"),
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("unpublished"),
      v.literal("suspended"),
    ),
    draft: profileContent,
    published: v.optional(publishedProfile),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    unpublishedAt: v.optional(v.number()),
    suspendedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"])
    .index("by_status", ["status"]),
  links: defineTable({
    profileId: v.id("profiles"),
    destination: v.string(),
    label: v.string(),
    icon: v.optional(v.string()),
    enabled: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_profile_position", ["profileId", "position"]),
  cards: defineTable({
    cardUrl: v.string(),
    token: v.string(),
    profileId: v.optional(v.id("profiles")),
    status: v.union(
      v.literal("registered"),
      v.literal("active"),
      v.literal("inactive"),
      v.literal("replaced"),
    ),
    replacedByCardId: v.optional(v.id("cards")),
    assignmentReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    assignedAt: v.optional(v.number()),
    deactivatedAt: v.optional(v.number()),
  })
    .index("by_cardUrl", ["cardUrl"])
    .index("by_token", ["token"])
    .index("by_profileId", ["profileId"])
    .index("by_status", ["status"]),
  analytics: defineTable({
    profileId: v.id("profiles"),
    linkId: v.optional(v.id("links")),
    eventType: v.union(v.literal("profile_view"), v.literal("link_click")),
    bucketStart: v.number(),
    total: v.number(),
    uniqueCount: v.number(),
  })
    .index("by_profile_bucket", ["profileId", "bucketStart"])
    .index("by_profile_event_bucket", ["profileId", "eventType", "bucketStart"]),
  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    actorLabel: v.string(),
    action: v.string(),
    accountId: v.optional(v.id("customers")),
    profileId: v.optional(v.id("profiles")),
    cardId: v.optional(v.id("cards")),
    occurredAt: v.number(),
    before: v.optional(v.string()),
    after: v.optional(v.string()),
  })
    .index("by_occurredAt", ["occurredAt"])
    .index("by_accountId", ["accountId"])
    .index("by_profileId", ["profileId"])
    .index("by_cardId", ["cardId"]),
  invitations: defineTable({
    customerId: v.id("customers"),
    email: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    invalidatedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_customerId", ["customerId"]),
  deletionRequests: defineTable({
    customerId: v.id("customers"),
    requestedAt: v.number(),
    processedAt: v.optional(v.number()),
    processedByUserId: v.optional(v.id("users")),
    status: v.union(v.literal("requested"), v.literal("approved"), v.literal("rejected")),
  }).index("by_customerId", ["customerId"]),
  settings: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  }).index("by_key", ["key"]),
});
