import { v } from "convex/values";

import { digest } from "./cards";
import { env, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const DEMO_SCOPE = "demo" as const;
const MARA_SLUG = "mara-velasquez";
const CLAIMABLE_SLUG = "claimed-profile";
const MARA_TOKEN = "mara-card-7f2q";
const CLAIMABLE_TOKEN = "claimable-card-demo";
const INACTIVE_TOKEN = "mara-card-retired";
const CLAIM_CODE = "MARA2Q8K";
const DAY = 24 * 60 * 60 * 1000;

const resultValidator = v.object({
  adminCustomerId: v.id("customers"),
  maraProfileId: v.id("profiles"),
  claimableProfileId: v.id("profiles"),
  activeCardId: v.id("cards"),
  claimableCardId: v.id("cards"),
  inactiveCardId: v.id("cards"),
  status: v.literal("initialized"),
});

const links = [
  {
    id: "linkedin",
    label: "LinkedIn",
    destination: "https://www.linkedin.com/in/mara-velasquez",
    icon: "linkedin",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    destination: "https://mara-velasquez.example",
    icon: "globe",
  },
  {
    id: "booking",
    label: "Book a conversation",
    destination: "https://cal.com/mara-velasquez",
    icon: "calendar",
  },
  { id: "email", label: "Email", destination: "mailto:mara@example.test", icon: "mail" },
] as const;

async function operator(ctx: MutationCtx, userId: Id<"users">) {
  if (env.TAPIT_DEMO_AUTH_MODE !== "hosted-demo")
    throw new Error("Hosted demo initialization requires TAPIT_DEMO_AUTH_MODE=hosted-demo.");
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("The operator Auth user does not exist.");
  const account = await ctx.db
    .query("customers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (account !== null && account.scope !== undefined && account.scope !== DEMO_SCOPE)
    throw new Error("The operator belongs to another scope.");
  const now = Date.now();
  const adminCustomerId =
    account?._id ??
    (await ctx.db.insert("customers", {
      scope: DEMO_SCOPE,
      userId,
      email: user.email ?? "admin@tapit.local",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    }));
  if (account !== null)
    await ctx.db.patch(account._id, {
      scope: DEMO_SCOPE,
      userId,
      role: "admin",
      status: "active",
      deletionStatus: "active",
      updatedAt: now,
    });
  return { userId, adminCustomerId };
}

async function seed(ctx: MutationCtx, operatorUserId: Id<"users">) {
  const { adminCustomerId } = await operator(ctx, operatorUserId);
  const now = Date.now();
  const today = new Date(now);
  const dayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const publishedAt = dayStart - 2 * DAY;
  const maraDraft = {
    name: "Mara Velasquez",
    slug: MARA_SLUG,
    bio: "Brand systems for independent teams.",
    email: "mara@example.test",
    phone: "+63 917 555 0184",
    website: "https://mara-velasquez.example",
    imageUrl: "/images/tapit-demo-mara-avatar.png",
    theme: "paper" as const,
    links: links.map((link) => ({ ...link, enabled: true })),
  };
  const maraPublished = { ...maraDraft, publishedAt };
  const mara = await ctx.db
    .query("profiles")
    .withIndex("by_slug", (q) => q.eq("slug", MARA_SLUG))
    .unique();
  if (mara !== null && mara.scope !== DEMO_SCOPE)
    throw new Error("The Mara demo profile is already owned outside the demo scope.");
  const maraCustomer = mara === null ? null : await ctx.db.get(mara.ownerId);
  const maraCustomerId =
    maraCustomer?._id ??
    (await ctx.db.insert("customers", {
      scope: DEMO_SCOPE,
      email: "mara@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    }));
  const maraId =
    mara?._id ??
    (await ctx.db.insert("profiles", {
      scope: DEMO_SCOPE,
      ownerId: maraCustomerId,
      slug: MARA_SLUG,
      status: "published",
      draft: maraDraft,
      published: maraPublished,
      createdAt: now,
      updatedAt: now,
      publishedAt,
    }));
  if (mara !== null)
    await ctx.db.patch(mara._id, {
      scope: DEMO_SCOPE,
      ownerId: maraCustomerId,
      status: "published",
      draft: maraDraft,
      published: maraPublished,
      publishedAt,
      unpublishedAt: undefined,
      suspendedAt: undefined,
      updatedAt: now,
    });
  await ctx.db.patch(maraCustomerId, { scope: DEMO_SCOPE, profileId: maraId, updatedAt: now });

  for (const [position, link] of links.entries()) {
    const existing = await ctx.db
      .query("links")
      .withIndex("by_profile_position", (q) => q.eq("profileId", maraId).eq("position", position))
      .unique();
    const value = {
      scope: DEMO_SCOPE,
      profileId: maraId,
      destination: link.destination,
      label: link.label,
      icon: link.icon,
      enabled: true,
      position,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("links", value);
  }
  const claimProfile = await ctx.db
    .query("profiles")
    .withIndex("by_slug", (q) => q.eq("slug", CLAIMABLE_SLUG))
    .unique();
  const claimCustomer = claimProfile ? await ctx.db.get(claimProfile.ownerId) : null;
  const claimCustomerId =
    claimCustomer?._id ??
    (await ctx.db.insert("customers", {
      scope: DEMO_SCOPE,
      email: "owner@example.test",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: now,
      updatedAt: now,
    }));
  const claimDraft = {
    name: "Claimed profile",
    slug: CLAIMABLE_SLUG,
    links: [{ id: "site", label: "Website", destination: "https://example.com", enabled: true }],
  };
  const claimProfileId =
    claimProfile?._id ??
    (await ctx.db.insert("profiles", {
      scope: DEMO_SCOPE,
      ownerId: claimCustomerId,
      slug: CLAIMABLE_SLUG,
      status: "unpublished",
      draft: claimDraft,
      createdAt: now,
      updatedAt: now,
    }));
  if (claimProfile !== null)
    await ctx.db.patch(claimProfile._id, {
      scope: DEMO_SCOPE,
      ownerId: claimCustomerId,
      slug: CLAIMABLE_SLUG,
      status: "unpublished",
      draft: claimDraft,
      published: undefined,
      publishedAt: undefined,
      unpublishedAt: undefined,
      suspendedAt: undefined,
      updatedAt: now,
    });
  await ctx.db.patch(claimCustomerId, {
    scope: DEMO_SCOPE,
    profileId: claimProfileId,
    updatedAt: now,
  });
  const claimHash = await digest(CLAIM_CODE);
  const card = async (
    token: string,
    cardUrl: string,
    status: "active" | "claimable" | "inactive",
    profileId: Id<"profiles">,
    extras: Record<string, unknown> = {},
  ) => {
    const existing = await ctx.db
      .query("cards")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing !== null && existing.scope !== DEMO_SCOPE)
      throw new Error("A demo card token is already owned outside the demo scope.");
    const value = {
      scope: DEMO_SCOPE,
      cardUrl,
      token,
      profileId,
      status,
      replacedByCardId: undefined,
      assignmentReason: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...extras,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("cards", value);
  };
  const activeCardId = await card(
    MARA_TOKEN,
    `https://tapit.test/c/${MARA_TOKEN}`,
    "active",
    maraId,
    { assignedAt: now },
  );
  const claimableCardId = await card(
    CLAIMABLE_TOKEN,
    `https://tapit.test/c/${CLAIMABLE_TOKEN}`,
    "claimable",
    claimProfileId,
    {
      claimCodeHash: claimHash,
      claimCodeGeneratedAt: now,
      claimCodeExpiresAt: now + DAY,
      claimCodeInvalidatedAt: undefined,
      claimCodeClaimedAt: undefined,
    },
  );
  const inactiveCardId = await card(
    INACTIVE_TOKEN,
    `https://tapit.test/c/${INACTIVE_TOKEN}`,
    "inactive",
    maraId,
    { deactivatedAt: now },
  );
  const analytics = [
    [18, 11, 9, 2],
    [27, 17, 13, 8],
    [41, 25, 17, 34],
    [63, 39, 24, 120],
  ] as const;
  for (const [total, uniqueCount, clicks, days] of analytics) {
    const bucketStart = dayStart - days * DAY;
    const view = await ctx.db
      .query("analytics")
      .withIndex("by_profile_event_bucket_source", (q) =>
        q
          .eq("profileId", maraId)
          .eq("eventType", "profile_view")
          .eq("bucketStart", bucketStart)
          .eq("source", "direct"),
      )
      .unique();
    if (view) await ctx.db.patch(view._id, { total, uniqueCount });
    else
      await ctx.db.insert("analytics", {
        scope: DEMO_SCOPE,
        profileId: maraId,
        eventType: "profile_view",
        bucketStart,
        total,
        uniqueCount,
        source: "direct",
      });
    const click = await ctx.db
      .query("analytics")
      .withIndex("by_profile_event_bucket_link_source", (q) =>
        q
          .eq("profileId", maraId)
          .eq("eventType", "link_click")
          .eq("bucketStart", bucketStart)
          .eq("linkKey", "portfolio")
          .eq("source", "direct"),
      )
      .unique();
    if (click) await ctx.db.patch(click._id, { total: clicks, uniqueCount: 0 });
    else
      await ctx.db.insert("analytics", {
        scope: DEMO_SCOPE,
        profileId: maraId,
        eventType: "link_click",
        bucketStart,
        total: clicks,
        uniqueCount: 0,
        linkKey: "portfolio",
        source: "direct",
      });
  }
  const auditRows = [
    {
      action: "card.assigned",
      actorLabel: "Administrator",
      after: "active",
      cardId: activeCardId,
      profileId: maraId,
    },
    {
      action: "profile.published",
      actorLabel: "Mara Velasquez",
      after: "published",
      profileId: maraId,
    },
  ];
  const existingAudits = await ctx.db
    .query("auditLogs")
    .withIndex("by_scope_and_occurredAt", (q) => q.eq("scope", DEMO_SCOPE))
    .take(200);
  for (const row of auditRows)
    if (
      !existingAudits.some(
        (audit) =>
          audit.action === row.action &&
          audit.cardId === row.cardId &&
          audit.profileId === row.profileId,
      )
    )
      await ctx.db.insert("auditLogs", {
        ...row,
        scope: DEMO_SCOPE,
        actorUserId: operatorUserId,
        accountId: adminCustomerId,
        occurredAt: publishedAt,
      });
  const setting = await ctx.db
    .query("settings")
    .withIndex("by_scope_and_key", (q) => q.eq("scope", DEMO_SCOPE).eq("key", "supportUrl"))
    .unique();
  if (setting)
    await ctx.db.patch(setting._id, {
      value: "mailto:support@example.test",
      updatedAt: now,
      updatedByUserId: operatorUserId,
    });
  else
    await ctx.db.insert("settings", {
      scope: DEMO_SCOPE,
      key: "supportUrl",
      value: "mailto:support@example.test",
      updatedAt: now,
      updatedByUserId: operatorUserId,
    });
  return {
    adminCustomerId,
    maraProfileId: maraId,
    claimableProfileId: claimProfileId,
    activeCardId,
    claimableCardId,
    inactiveCardId,
    status: "initialized" as const,
  };
}

export const initialize = internalMutation({
  args: { operatorUserId: v.id("users") },
  returns: resultValidator,
  handler: async (ctx, args) => seed(ctx, args.operatorUserId),
});

export const reset = internalMutation({
  args: { operatorUserId: v.id("users") },
  returns: resultValidator,
  handler: async (ctx, args) => {
    if (env.TAPIT_DEMO_AUTH_MODE !== "hosted-demo")
      throw new Error("Hosted demo reset requires TAPIT_DEMO_AUTH_MODE=hosted-demo.");
    const { adminCustomerId } = await operator(ctx, args.operatorUserId);
    const demoCards = await ctx.db
      .query("cards")
      .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
      .take(10_000);
    for (const row of await ctx.db
      .query("cardClaimChallenges")
      .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
      .take(10_000))
      await ctx.db.delete(row._id);
    for (const table of [
      "analyticsSessions",
      "analytics",
      "auditLogs",
      "invitations",
      "deletionRequests",
      "settings",
      "links",
    ] as const)
      for (const row of await ctx.db
        .query(table)
        .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
        .take(10_000))
        await ctx.db.delete(row._id);
    for (const row of await ctx.db
      .query("profileImages")
      .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
      .take(10_000)) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    for (const row of demoCards) await ctx.db.delete(row._id);
    for (const row of await ctx.db
      .query("profiles")
      .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
      .take(10_000))
      await ctx.db.delete(row._id);
    for (const row of await ctx.db
      .query("customers")
      .withIndex("by_scope", (q) => q.eq("scope", DEMO_SCOPE))
      .take(10_000))
      if (row._id !== adminCustomerId) await ctx.db.delete(row._id);
    return await seed(ctx, args.operatorUserId);
  },
});
