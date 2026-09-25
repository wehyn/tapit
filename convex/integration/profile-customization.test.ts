import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

const customization = {
  preset: "warm-studio" as const,
  accent: "coral" as const,
  typeScale: "comfortable" as const,
  linkTreatment: "filled" as const,
  contentOrder: "links-first" as const,
  identityColors: {
    name: { kind: "preset" as const, value: "coral" as const },
    bio: { kind: "custom" as const, hex: "#a84431" },
  },
  featuredLinkId: "site",
  section: { kind: "about" as const, body: "A small studio." },
};

const draft = (slug: string, extra: Record<string, unknown> = {}) => ({
  name: "Owner",
  slug,
  theme: "paper" as const,
  links: [
    {
      id: "site",
      label: "Website",
      destination: "https://example.com",
      enabled: true,
    },
  ],
  ...extra,
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@example.com",
      emailVerificationTime: 1,
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.com",
      emailVerificationTime: 1,
    });
    const ownerCustomerId = await ctx.db.insert("customers", {
      userId: ownerUserId,
      email: "owner@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const otherCustomerId = await ctx.db.insert("customers", {
      userId: otherUserId,
      email: "other@example.com",
      role: "customer",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "published",
      draft: draft("owner"),
      published: { ...draft("owner"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherCustomerId,
      slug: "other",
      status: "draft",
      draft: draft("other"),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId });
    await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
    await ctx.db.insert("cards", {
      cardUrl: "https://cards.example/c/owner-card",
      token: "owner-card",
      profileId,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      assignedAt: 1,
    });
    return { ownerUserId, otherUserId, profileId };
  });
}

test("customization stays private in drafts and is shared by public projections after publish", async () => {
  const t = convexTest(schema, modules);
  const data = await seed(t);
  const owner = t.withIdentity(identity(data.ownerUserId));

  await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
    theme: "paper",
  });
  const savedDraft = await owner.mutation(api.profiles.saveDraft, {
    profileId: data.profileId,
    draft: draft("owner", { customization }),
  });
  expect(savedDraft).toMatchObject({ customization });
  await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
    theme: "paper",
  });
  await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.not.toHaveProperty(
    "customization",
  );
  await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
    profile: { theme: "paper" },
  });

  await owner.mutation(api.profiles.publish, { profileId: data.profileId });
  const publicProfile = await t.query(api.profiles.publicBySlug, { slug: "owner" });
  const cardProfile = await t.query(api.cards.resolve, { token: "owner-card" });
  expect(publicProfile).toMatchObject({ customization });
  expect(cardProfile).toMatchObject({ status: "active", profile: { customization } });
});

test("server rejects invalid customization values and preserves ownership checks", async () => {
  const t = convexTest(schema, modules);
  const data = await seed(t);
  const owner = t.withIdentity(identity(data.ownerUserId));
  const other = t.withIdentity(identity(data.otherUserId));

  await expect(
    owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", { customization: { ...customization, accent: "violet" } }),
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", {
        customization: {
          ...customization,
          identityColors: {
            bio: { kind: "custom", hex: "#ffffff" },
          },
        },
      }),
    }),
  ).rejects.toThrow("The profile bio custom color does not meet contrast requirements.");
  await expect(
    owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", {
        customization: {
          ...customization,
          identityColors: {
            name: { kind: "custom", hex: "#fff" },
          },
        },
      }),
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", {
        customization: {
          ...customization,
          section: { kind: "services", body: "Services", items: ["1", "2", "3", "4"] },
        },
      }),
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", {
        customization: {
          ...customization,
          section: { kind: "about", body: "x".repeat(281) },
        },
      }),
    }),
  ).rejects.toThrow();
  await expect(
    other.mutation(api.profiles.saveDraft, {
      profileId: data.profileId,
      draft: draft("owner", { customization }),
    }),
  ).rejects.toThrow("Profile access denied.");
});
