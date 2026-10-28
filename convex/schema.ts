import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { profileCustomizationValidator, profileMediaPersistedValidator } from "./validators";

const profileLink = v.object({
  id: v.string(),
  label: v.string(),
  destination: v.string(),
  enabled: v.boolean(),
  icon: v.optional(v.string()),
});

const profileTheme = v.union(
  v.literal("paper"),
  v.literal("moss"),
  v.literal("night"),
  v.literal("custom"),
);

const profileRedirect = v.object({
  enabled: v.boolean(),
  destination: v.string(),
});

const profileContent = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  theme: v.optional(profileTheme),
  customization: v.optional(profileCustomizationValidator),
  media: v.optional(profileMediaPersistedValidator),
  redirect: v.optional(profileRedirect),
  links: v.array(profileLink),
});

const publishedProfile = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  theme: v.optional(profileTheme),
  customization: v.optional(profileCustomizationValidator),
  media: v.optional(profileMediaPersistedValidator),
  redirect: v.optional(profileRedirect),
  links: v.array(profileLink),
  publishedAt: v.number(),
});

const cardOrderDesignSource = v.union(
  v.object({
    kind: v.literal("upload"),
    uploadId: v.id("cardOrderDesignUploads"),
  }),
  v.object({
    kind: v.literal("url"),
    url: v.string(),
  }),
);

const cardOrderPaymentSnapshot = v.object({
  provider: v.string(),
  label: v.string(),
  accountDetails: v.string(),
  instructions: v.string(),
  qrUploadId: v.optional(v.id("cardOrderQrUploads")),
});

const cardOrderReferralSnapshot = v.object({
  code: v.string(),
  referrerCode: v.optional(v.string()),
  referrerLabel: v.optional(v.string()),
});

export default defineSchema({
  ...authTables,
  authVerifiers: authTables.authVerifiers.index("by_sessionId", ["sessionId"]),
  customers: defineTable({
    scope: v.optional(v.literal("demo")),
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    role: v.union(v.literal("customer"), v.literal("admin")),
    isDemo: v.optional(v.boolean()),
    demoResetInProgress: v.optional(v.boolean()),
    status: v.union(
      v.literal("pending"),
      v.literal("invited"),
      v.literal("active"),
      v.literal("deleted"),
    ),
    onboardingName: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
    cardOwnerAccessOverride: v.optional(v.boolean()),
    deletionStatus: v.union(v.literal("active"), v.literal("requested"), v.literal("deleted")),
    deletionRequestedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_role", ["scope", "role"])
    .index("by_scope_and_status", ["scope", "status"])
    .index("by_deletionStatus_and_deletionRequestedAt", ["deletionStatus", "deletionRequestedAt"]),
  profiles: defineTable({
    scope: v.optional(v.literal("demo")),
    ownerId: v.id("customers"),
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("unpublished"),
      v.literal("suspended"),
    ),
    draft: profileContent,
    draftRevision: v.optional(v.number()),
    published: v.optional(publishedProfile),
    createdAt: v.number(),
    updatedAt: v.number(),
    imageRevision: v.optional(v.number()),
    mediaRevision: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    unpublishedAt: v.optional(v.number()),
    suspendedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"])
    .index("by_draft_imageStorageId", ["draft.imageStorageId"])
    .index("by_published_imageStorageId", ["published.imageStorageId"])
    .index("by_status", ["status"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_status", ["scope", "status"]),
  profileImages: defineTable({
    scope: v.optional(v.literal("demo")),
    storageId: v.id("_storage"),
    smallStorageId: v.optional(v.id("_storage")),
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_smallStorageId", ["smallStorageId"])
    .index("by_profileId", ["profileId"])
    .index("by_scope", ["scope"]),
  profileImageUploadJobs: defineTable({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    actorUserId: v.optional(v.id("users")),
    accessMode: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
    largeSha256: v.string(),
    smallSha256: v.optional(v.string()),
    largeStorageId: v.optional(v.id("_storage")),
    smallStorageId: v.optional(v.id("_storage")),
    expectedImageRevision: v.optional(v.number()),
    expectedDraftRevision: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("attached"), v.literal("failed")),
    createdAt: v.number(),
    uploadWindowEndsAt: v.number(),
    scanCursor: v.optional(v.string()),
    scanLargeCandidateId: v.optional(v.id("_storage")),
    scanSmallCandidateId: v.optional(v.id("_storage")),
    scanLargeAmbiguous: v.optional(v.boolean()),
    scanSmallAmbiguous: v.optional(v.boolean()),
  })
    .index("by_profileId", ["profileId"])
    .index("by_profileId_and_status_and_uploadWindowEndsAt", [
      "profileId",
      "status",
      "uploadWindowEndsAt",
    ])
    .index("by_status_and_uploadWindowEndsAt", ["status", "uploadWindowEndsAt"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_largeStorageId", ["largeStorageId"])
    .index("by_smallStorageId", ["smallStorageId"])
    .index("by_scanLargeCandidateId", ["scanLargeCandidateId"])
    .index("by_scanSmallCandidateId", ["scanSmallCandidateId"]),
  profileMediaAssets: defineTable({
    scope: v.optional(v.literal("demo")),
    storageId: v.id("_storage"),
    previewStorageId: v.optional(v.id("_storage")),
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")),
    size: v.number(),
    width: v.number(),
    height: v.number(),
    target: v.optional(v.union(v.literal("background"), v.literal("slideshow"))),
    createdAt: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_previewStorageId", ["previewStorageId"])
    .index("by_profileId", ["profileId"])
    .index("by_scope", ["scope"]),
  profileMediaUploadJobs: defineTable({
    profileId: v.id("profiles"),
    ownerId: v.id("customers"),
    actorUserId: v.optional(v.id("users")),
    accessMode: v.optional(v.union(v.literal("owner"), v.literal("admin"))),
    sha256: v.string(),
    previewSha256: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    previewStorageId: v.optional(v.id("_storage")),
    expectedMediaRevision: v.number(),
    target: v.optional(v.union(v.literal("background"), v.literal("slideshow"))),
    status: v.union(v.literal("pending"), v.literal("attached"), v.literal("failed")),
    createdAt: v.number(),
    uploadWindowEndsAt: v.number(),
    scanCursor: v.optional(v.string()),
    scanSourceCandidateId: v.optional(v.id("_storage")),
    scanPreviewCandidateId: v.optional(v.id("_storage")),
    scanSourceAmbiguous: v.optional(v.boolean()),
    scanPreviewAmbiguous: v.optional(v.boolean()),
  })
    .index("by_profileId", ["profileId"])
    .index("by_storageId", ["storageId"])
    .index("by_previewStorageId", ["previewStorageId"])
    .index("by_scanSourceCandidateId", ["scanSourceCandidateId"])
    .index("by_scanPreviewCandidateId", ["scanPreviewCandidateId"])
    .index("by_profileId_and_status_and_uploadWindowEndsAt", [
      "profileId",
      "status",
      "uploadWindowEndsAt",
    ])
    .index("by_status_and_createdAt", ["status", "createdAt"]),
  uploadAssets: defineTable({
    kind: v.union(v.literal("profile-photo"), v.literal("card-design")),
    policyVersion: v.string(),
    ownerId: v.id("customers"),
    scope: v.optional(v.string()),
    domainType: v.string(),
    domainRecordId: v.string(),
    status: v.union(
      v.literal("initiated"),
      v.literal("uploaded"),
      v.literal("validating"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("attached"),
      v.literal("rejected"),
      v.literal("failed"),
      v.literal("expired"),
      v.literal("deleted"),
    ),
    quarantineStorageId: v.optional(v.id("_storage")),
    sourceStorageId: v.optional(v.id("_storage")),
    declaredContentType: v.optional(v.string()),
    declaredFileName: v.optional(v.string()),
    detectedContentType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    pixelCount: v.optional(v.number()),
    sha256: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    uploadedAt: v.optional(v.number()),
    validatingAt: v.optional(v.number()),
    processingAt: v.optional(v.number()),
    readyAt: v.optional(v.number()),
    attachedAt: v.optional(v.number()),
    deletionEligibleAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    retryCount: v.number(),
    lastFailureAt: v.optional(v.number()),
    failureCode: v.optional(
      v.union(
        v.literal("UNAUTHENTICATED"),
        v.literal("FORBIDDEN"),
        v.literal("UNSUPPORTED_TYPE"),
        v.literal("FILE_TOO_LARGE"),
        v.literal("INVALID_SIGNATURE"),
        v.literal("INVALID_IMAGE"),
        v.literal("DIMENSIONS_EXCEEDED"),
        v.literal("RATE_LIMITED"),
        v.literal("QUOTA_EXCEEDED"),
        v.literal("UPLOAD_EXPIRED"),
        v.literal("PROCESSING_FAILED"),
        v.literal("STORAGE_UNAVAILABLE"),
        v.literal("CONFLICT"),
      ),
    ),
    failureDetail: v.optional(v.string()),
  })
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_sourceStorageId", ["sourceStorageId"])
    .index("by_quarantineStorageId", ["quarantineStorageId"])
    .index("by_domainType_and_domainRecordId", ["domainType", "domainRecordId"])
    .index("by_status_and_deletionEligibleAt", ["status", "deletionEligibleAt"]),
  uploadAssetVariants: defineTable({
    assetId: v.id("uploadAssets"),
    purpose: v.union(v.literal("preview"), v.literal("thumbnail")),
    storageId: v.id("_storage"),
    contentType: v.string(),
    byteSize: v.number(),
    width: v.number(),
    height: v.number(),
    checksum: v.string(),
    createdAt: v.number(),
  })
    .index("by_assetId_and_purpose", ["assetId", "purpose"])
    .index("by_storageId", ["storageId"]),
  uploadAssetReferences: defineTable({
    assetId: v.id("uploadAssets"),
    domainType: v.string(),
    domainRecordId: v.string(),
    role: v.string(),
    createdAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_assetId", ["assetId"])
    .index("by_domainType_and_domainRecordId_and_role", ["domainType", "domainRecordId", "role"])
    .index("by_assetId_and_releasedAt", ["assetId", "releasedAt"]),
  cardDesigns: defineTable({
    customerId: v.id("customers"),
    profileId: v.id("profiles"),
    templateId: v.string(),
    currentAssetId: v.optional(v.id("uploadAssets")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customerId", ["customerId"])
    .index("by_profileId", ["profileId"])
    .index("by_currentAssetId", ["currentAssetId"]),
  links: defineTable({
    scope: v.optional(v.literal("demo")),
    profileId: v.id("profiles"),
    destination: v.string(),
    label: v.string(),
    icon: v.optional(v.string()),
    enabled: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profile_position", ["profileId", "position"])
    .index("by_profile_and_scope_position", ["profileId", "scope", "position"])
    .index("by_scope", ["scope"]),
  cards: defineTable({
    scope: v.optional(v.literal("demo")),
    cardUrl: v.string(),
    token: v.string(),
    profileId: v.optional(v.id("profiles")),
    status: v.union(
      v.literal("registered"),
      v.literal("claimable"),
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
    claimCodeHash: v.optional(v.string()),
    claimCodeGeneratedAt: v.optional(v.number()),
    claimCodeExpiresAt: v.optional(v.number()),
    claimCodeInvalidatedAt: v.optional(v.number()),
    claimCodeClaimedAt: v.optional(v.number()),
  })
    .index("by_cardUrl", ["cardUrl"])
    .index("by_token", ["token"])
    .index("by_profileId", ["profileId"])
    .index("by_profileId_and_status", ["profileId", "status"])
    .index("by_status", ["status"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_status", ["scope", "status"]),
  analytics: defineTable({
    scope: v.optional(v.literal("demo")),
    profileId: v.id("profiles"),
    linkId: v.optional(v.id("links")),
    linkKey: v.optional(v.string()),
    eventType: v.union(v.literal("profile_view"), v.literal("link_click")),
    bucketStart: v.number(),
    total: v.number(),
    uniqueCount: v.number(),
    source: v.optional(
      v.union(v.literal("nfc"), v.literal("qr"), v.literal("direct"), v.literal("unknown")),
    ),
  })
    .index("by_profile_bucket", ["profileId", "bucketStart"])
    .index("by_profile_event_bucket", ["profileId", "eventType", "bucketStart"])
    .index("by_profile_event_bucket_source", ["profileId", "eventType", "bucketStart", "source"])
    .index("by_profile_event_bucket_link_source", [
      "profileId",
      "eventType",
      "bucketStart",
      "linkKey",
      "source",
    ])
    .index("by_bucket", ["bucketStart"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_bucketStart", ["scope", "bucketStart"]),
  analyticsSessions: defineTable({
    scope: v.optional(v.literal("demo")),
    profileId: v.id("profiles"),
    sessionKey: v.string(),
    firstSeenAt: v.number(),
  })
    .index("by_profile_session", ["profileId", "sessionKey"])
    .index("by_firstSeenAt", ["firstSeenAt"])
    .index("by_scope", ["scope"]),
  analyticsRateLimitKeys: defineTable({
    profileId: v.id("profiles"),
    eventType: v.union(v.literal("profile_view"), v.literal("link_click")),
    networkHash: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_eventType_and_profileId_and_networkHash", ["eventType", "profileId", "networkHash"])
    .index("by_profileId", ["profileId"])
    .index("by_lastSeenAt", ["lastSeenAt"]),
  cardClaimChallenges: defineTable({
    scope: v.optional(v.literal("demo")),
    cardId: v.id("cards"),
    claimCodeHash: v.string(),
    challengeHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_challengeHash", ["challengeHash"])
    .index("by_cardId", ["cardId"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_scope", ["scope"]),
  auditLogs: defineTable({
    scope: v.optional(v.literal("demo")),
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
    .index("by_actorUserId", ["actorUserId"])
    .index("by_profileId", ["profileId"])
    .index("by_cardId", ["cardId"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_occurredAt", ["scope", "occurredAt"]),
  invitations: defineTable({
    scope: v.optional(v.literal("demo")),
    customerId: v.id("customers"),
    email: v.optional(v.string()),
    kind: v.optional(v.literal("prepared_setup")),
    tokenHash: v.string(),
    expiresAt: v.optional(v.number()),
    usedAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    invalidatedAt: v.optional(v.number()),
    createdByUserId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_customerId", ["customerId"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_acceptedAt", ["acceptedAt"])
    .index("by_invalidatedAt", ["invalidatedAt"])
    .index("by_usedAt", ["usedAt"])
    .index("by_scope", ["scope"]),
  deletionRequests: defineTable({
    scope: v.optional(v.literal("demo")),
    customerId: v.id("customers"),
    requestedAt: v.number(),
    processedAt: v.optional(v.number()),
    processedByUserId: v.optional(v.id("users")),
    status: v.union(v.literal("requested"), v.literal("approved"), v.literal("rejected")),
  })
    .index("by_customerId", ["customerId"])
    .index("by_customerId_and_status", ["customerId", "status"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_status", ["scope", "status"])
    .index("by_scope_and_status_and_requestedAt", ["scope", "status", "requestedAt"]),
  settings: defineTable({
    scope: v.optional(v.literal("demo")),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
    updatedByUserId: v.id("users"),
  })
    .index("by_key", ["key"])
    .index("by_scope", ["scope"])
    .index("by_scope_and_key", ["scope", "key"]),
  cardOrderPaymentMethods: defineTable({
    scope: v.optional(v.literal("demo")),
    provider: v.string(),
    label: v.string(),
    accountDetails: v.string(),
    instructions: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
    qrUploadId: v.optional(v.id("cardOrderQrUploads")),
  })
    .index("by_scope_and_active", ["scope", "active"])
    .index("by_qrUploadId", ["qrUploadId"]),
  cardOrderQrUploads: defineTable({
    ownerId: v.id("customers"),
    actorUserId: v.id("users"),
    scope: v.optional(v.literal("demo")),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.union(v.literal("image/jpeg"), v.literal("image/png"))),
    byteSize: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("available"),
      v.literal("attached"),
    ),
    createdAt: v.number(),
    processingAt: v.optional(v.number()),
    availableAt: v.optional(v.number()),
    attachedAt: v.optional(v.number()),
  })
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_storageId", ["storageId"])
    .index("by_status_and_createdAt", ["status", "createdAt"]),
  cardOrderReferralCodes: defineTable({
    scope: v.optional(v.literal("demo")),
    code: v.string(),
    referrerLabel: v.optional(v.string()),
    referrerCode: v.optional(v.string()),
    offerId: v.optional(v.id("cardOrderOffers")),
    fixedPriceCentavos: v.optional(v.number()),
    active: v.boolean(),
    usageCount: v.optional(v.number()),
    usageLimit: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
  })
    .index("by_scope_and_code", ["scope", "code"])
    .index("by_scope_and_active", ["scope", "active"]),
  cardOrderOffers: defineTable({
    scope: v.optional(v.literal("demo")),
    code: v.string(),
    expiresOn: v.optional(v.string()),
    fixedPriceCentavos: v.optional(v.number()),
    percentOff: v.optional(v.number()),
    usageCount: v.number(),
    usageLimit: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedByUserId: v.optional(v.id("users")),
  }).index("by_scope_and_code", ["scope", "code"]),
  cardOrderDesignUploads: defineTable({
    scope: v.optional(v.literal("demo")),
    ownerId: v.id("customers"),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.union(v.literal("image/jpeg"), v.literal("image/png"))),
    byteSize: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("available"),
      v.literal("attached"),
    ),
    orderId: v.optional(v.id("cardOrders")),
    createdAt: v.number(),
    processingAt: v.optional(v.number()),
    availableAt: v.optional(v.number()),
  })
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_storageId", ["storageId"]),
  cardOrders: defineTable({
    scope: v.optional(v.literal("demo")),
    customerId: v.id("customers"),
    quantity: v.literal(1),
    designSource: cardOrderDesignSource,
    backDesignSource: v.optional(cardOrderDesignSource),
    deliveryName: v.string(),
    deliveryPhone: v.string(),
    deliveryAddress: v.string(),
    cardPriceCentavos: v.number(),
    discountCentavos: v.number(),
    shippingQuoteCentavos: v.optional(v.number()),
    paymentMethodId: v.id("cardOrderPaymentMethods"),
    paymentSnapshot: cardOrderPaymentSnapshot,
    qrUploadId: v.optional(v.id("cardOrderQrUploads")),
    receiptUploadId: v.optional(v.id("cardOrderReceiptUploads")),
    referralCodeId: v.optional(v.id("cardOrderReferralCodes")),
    offerId: v.optional(v.id("cardOrderOffers")),
    offerSnapshot: v.optional(
      v.object({
        code: v.string(),
        fixedPriceCentavos: v.optional(v.number()),
        percentOff: v.optional(v.number()),
      }),
    ),
    offerUsageCounted: v.optional(v.boolean()),
    usageCounted: v.optional(v.boolean()),
    referralSnapshot: v.optional(cardOrderReferralSnapshot),
    paymentStatus: v.union(v.literal("unpaid"), v.literal("received"), v.literal("refunded")),
    fulfillmentStatus: v.union(
      v.literal("awaiting_shipping_quote"),
      v.literal("awaiting_payment"),
      v.literal("processing"),
      v.literal("delivered"),
      v.literal("cancelled"),
    ),
    commissionStatus: v.union(
      v.literal("none"),
      v.literal("pending"),
      v.literal("eligible"),
      v.literal("paid"),
      v.literal("void"),
    ),
    commissionCentavos: v.number(),
    payoutReference: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_qrUploadId", ["qrUploadId"])
    .index("by_receiptUploadId", ["receiptUploadId"])
    .index("by_scope_and_customerId_and_createdAt", ["scope", "customerId", "createdAt"])
    .index("by_scope_and_createdAt", ["scope", "createdAt"])
    .index("by_scope_and_referralCodeId_and_createdAt", ["scope", "referralCodeId", "createdAt"])
    .index("by_paymentSnapshot_qrUploadId", ["paymentSnapshot.qrUploadId"]),
  cardOrderReceiptUploads: defineTable({
    ownerId: v.id("customers"),
    scope: v.optional(v.literal("demo")),
    orderId: v.id("cardOrders"),
    storageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    contentType: v.optional(
      v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("application/pdf")),
    ),
    declaredContentType: v.optional(v.string()),
    byteSize: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("available"),
      v.literal("failed"),
      v.literal("attached"),
      v.literal("replaced"),
    ),
    createdAt: v.number(),
    processingAt: v.optional(v.number()),
    availableAt: v.optional(v.number()),
  })
    .index("by_orderId_and_status", ["orderId", "status"])
    .index("by_ownerId", ["ownerId"])
    .index("by_storageId", ["storageId"]),
});
