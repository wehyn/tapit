import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");

const testConvex = () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
};

const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

const draft = (slug: string, name: string) => ({
  name,
  slug,
  bio: `${name} bio`,
  website: "https://example.com",
  links: [
    {
      id: `${slug}-link`,
      label: "Website",
      destination: "https://example.com",
      enabled: true,
    },
  ],
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const adminUserId = await ctx.db.insert("users", {
      email: "admin@example.com",
      emailVerificationTime: 1,
    });
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@example.com",
      emailVerificationTime: 1,
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "other@example.com",
      emailVerificationTime: 1,
    });
    const adminCustomerId = await ctx.db.insert("customers", {
      userId: adminUserId,
      email: "admin@example.com",
      role: "admin",
      status: "active",
      deletionStatus: "active",
      createdAt: 1,
      updatedAt: 1,
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
    const ownerProfileId = await ctx.db.insert("profiles", {
      ownerId: ownerCustomerId,
      slug: "owner",
      status: "published",
      draft: draft("owner", "Owner Draft"),
      published: { ...draft("owner", "Owner Published"), publishedAt: 1 },
      createdAt: 1,
      updatedAt: 1,
      publishedAt: 1,
    });
    const otherProfileId = await ctx.db.insert("profiles", {
      ownerId: otherCustomerId,
      slug: "other",
      status: "draft",
      draft: draft("other", "Private Draft"),
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.patch(ownerCustomerId, { profileId: ownerProfileId });
    await ctx.db.patch(otherCustomerId, { profileId: otherProfileId });
    const invitationId = await ctx.db.insert("invitations", {
      customerId: ownerCustomerId,
      email: "owner@example.com",
      tokenHash: "owner-token",
      expiresAt: Date.now() + 60_000,
      createdByUserId: adminUserId,
      createdAt: 1,
    });
    return {
      adminUserId,
      ownerUserId,
      otherUserId,
      adminCustomerId,
      ownerCustomerId,
      otherCustomerId,
      ownerProfileId,
      otherProfileId,
      invitationId,
    };
  });
}

describe("Convex authentication and ownership", () => {
  it("rejects unauthenticated private reads and writes", async () => {
    const t = testConvex();
    const data = await seed(t);

    await expect(t.query(api.profiles.mine, {})).rejects.toThrow("Authentication required.");
    await expect(t.query(api.profiles.current, {})).rejects.toThrow("Authentication required.");
    await expect(
      t.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: draft("owner", "Nope"),
      }),
    ).rejects.toThrow("Authentication required.");
    await expect(
      t.mutation(api.customers.createSelfServiceAccount, { name: "New User", slug: "new-user" }),
    ).rejects.toThrow("Authentication required.");
  });

  it("provisions an authenticated self-service customer and is idempotent", async () => {
    const t = testConvex();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: " New@Example.COM ",
          emailVerificationTime: 1,
        }),
    );
    const user = t.withIdentity(identity(userId));

    const first = await user.mutation(api.customers.createSelfServiceAccount, {
      name: " Ada Lovelace ",
      slug: " Ada-Lovelace ",
    });
    const second = await user.mutation(api.customers.createSelfServiceAccount, {
      name: "Changed Name",
      slug: "changed-name",
    });
    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      const customer = await ctx.db.get(first.customerId);
      const profile = await ctx.db.get(first.profileId);
      expect(customer).toMatchObject({
        email: "new@example.com",
        userId,
        role: "customer",
        status: "active",
        deletionStatus: "active",
        profileId: first.profileId,
      });
      expect(profile).toMatchObject({
        ownerId: first.customerId,
        slug: "ada-lovelace",
        status: "draft",
        draft: { name: "Ada Lovelace", slug: "ada-lovelace", links: [] },
      });
      expect(profile?.published).toBeUndefined();
    });
  });

  it("rejects self-service setup for an unverified authenticated user", async () => {
    const t = testConvex();
    const userId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "unverified@example.test" }),
    );
    const user = t.withIdentity(identity(userId));

    await expect(
      user.mutation(api.customers.createSelfServiceAccount, {
        name: "Unverified Customer",
        slug: "unverified-customer",
      }),
    ).rejects.toThrow("Email verification required.");

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("customers")
          .withIndex("by_email", (query) => query.eq("email", "unverified@example.test"))
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("rejects the fourth same-identity self-service attempt while keeping one customer", async () => {
    const t = testConvex();
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: "quota@example.test",
          emailVerificationTime: 1,
        }),
    );
    const user = t.withIdentity(identity(userId));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await user.mutation(api.customers.createSelfServiceAccount, {
        name: "Quota Customer",
        slug: "quota-customer",
      });
    }
    await expect(
      user.mutation(api.customers.createSelfServiceAccount, {
        name: "Quota Customer",
        slug: "quota-customer",
      }),
    ).rejects.toThrow("Too many account creation attempts. Try again later.");

    await expect(
      t.run(
        async (ctx) =>
          (
            await ctx.db
              .query("customers")
              .withIndex("by_email", (query) => query.eq("email", "quota@example.test"))
              .take(10)
          ).length,
      ),
    ).resolves.toBe(1);
  });

  it("rejects admin identities and duplicate emails or slugs", async () => {
    const t = testConvex();
    const data = await seed(t);
    const admin = t.withIdentity(identity(data.adminUserId));
    await expect(
      admin.mutation(api.customers.createSelfServiceAccount, { name: "Admin", slug: "admin-new" }),
    ).rejects.toThrow(/admin|administrator/i);

    const newUserId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          email: "new@example.com",
          emailVerificationTime: 1,
        }),
    );
    const newUser = t.withIdentity(identity(newUserId));
    await expect(
      newUser.mutation(api.customers.createSelfServiceAccount, { name: "New", slug: "owner" }),
    ).rejects.toThrow("already in use");
    await expect(
      newUser.mutation(api.customers.createSelfServiceAccount, { name: "New", slug: "login" }),
    ).rejects.toThrow("reserved");
  });

  it("allows the owner to read, save, and publish their profile", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));

    expect(await owner.query(api.profiles.mine, {})).toMatchObject({ _id: data.ownerProfileId });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.ownerProfileId,
      draft: draft("owner", "Updated Owner"),
    });
    const published = await owner.mutation(api.profiles.publish, {
      profileId: data.ownerProfileId,
    });
    expect(published).toMatchObject({ name: "Updated Owner", slug: "owner" });
    expect(await owner.query(api.profiles.current, {})).toMatchObject({
      profile: { status: "published", published: { name: "Updated Owner" } },
    });
  });

  it("keeps a saved draft theme private until publishing", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    await t.run(async (ctx) => {
      await ctx.db.insert("cards", {
        cardUrl: "https://cards.example/c/owner-card",
        token: "owner-card",
        profileId: data.ownerProfileId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        assignedAt: 1,
      });
    });

    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "paper",
    });
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "paper" },
    });
    await owner.mutation(api.profiles.saveDraft, {
      profileId: data.ownerProfileId,
      draft: { ...draft("owner", "Owner Draft"), theme: "night" },
    });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "paper",
    });
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "paper" },
    });

    await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      theme: "night",
    });
    await expect(t.query(api.cards.resolve, { token: "owner-card" })).resolves.toMatchObject({
      status: "active",
      profile: { theme: "night" },
    });
  });

  it("denies cross-customer access and keeps drafts out of the public projection", async () => {
    const t = testConvex();
    const data = await seed(t);
    const other = t.withIdentity(identity(data.otherUserId));

    await expect(other.query(api.profiles.mine, {})).resolves.toMatchObject({
      _id: data.otherProfileId,
    });
    await expect(
      other.mutation(api.profiles.saveDraft, {
        profileId: data.ownerProfileId,
        draft: draft("owner", "Tampered"),
      }),
    ).rejects.toThrow("Profile access denied.");
    await expect(
      other.mutation(api.profiles.publish, { profileId: data.ownerProfileId }),
    ).rejects.toThrow("Profile access denied.");
    await expect(t.query(api.profiles.publicBySlug, { slug: "other" })).resolves.toBeNull();
    await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
      name: "Owner Published",
      slug: "owner",
    });
  });

  it("enforces setup-token validity, customer matching, and one-time use", async () => {
    const t = testConvex();
    const data = await seed(t);
    const owner = t.withIdentity(identity(data.ownerUserId));
    const other = t.withIdentity(identity(data.otherUserId));

    const now = Date.now();
    await expect(
      t.query(api.invitations.status, { tokenHash: "owner-token", now }),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      other.mutation(api.customers.completeSetup, {
        customerId: data.otherCustomerId,
        tokenHash: "owner-token",
      }),
    ).rejects.toThrow("does not belong to that customer");
    await expect(
      other.mutation(api.customers.completeSetup, {
        tokenHash: "owner-token",
      }),
    ).rejects.toThrow("does not match the invitation email");
    await expect(
      owner.mutation(api.customers.completeSetup, {
        customerId: data.ownerCustomerId,
        tokenHash: "owner-token",
      }),
    ).resolves.toEqual({ profileId: data.ownerProfileId });
    await expect(
      owner.mutation(api.customers.completeSetup, {
        customerId: data.ownerCustomerId,
        tokenHash: "owner-token",
      }),
    ).rejects.toThrow("invalid or has expired");
    await expect(
      t.query(api.invitations.status, { tokenHash: "owner-token", now: Date.now() }),
    ).resolves.toEqual({ valid: false });
  });

  it("rejects setup-link completion for an unverified invitation user", async () => {
    const t = testConvex();
    const data = await seed(t);
    const userId = await t.run(
      async (ctx) => await ctx.db.insert("users", { email: "owner@example.com" }),
    );
    const user = t.withIdentity(identity(userId));

    await expect(
      user.mutation(api.customers.completeSetup, {
        customerId: data.ownerCustomerId,
        tokenHash: "owner-token",
      }),
    ).rejects.toThrow("Email verification required.");
  });

  it("bootstraps the same accounts and profile idempotently", async () => {
    const t = testConvex();
    const data = await seed(t);
    const args = {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Owner bootstrap bio",
      cardUrl: "https://tapit.test/c/bootstrap-token",
      cardToken: "bootstrap-token",
    };
    const first = await t.mutation(internal.bootstrap.bootstrap, args);
    const second = await t.mutation(internal.bootstrap.bootstrap, args);
    expect(second).toEqual(first);
    const counts = await t.run(async (ctx) => ({
      customers: (await ctx.db.query("customers").collect()).length,
      profiles: (await ctx.db.query("profiles").collect()).length,
      cards: (await ctx.db.query("cards").collect()).length,
    }));
    expect(counts).toEqual({ customers: 3, profiles: 2, cards: 1 });
  });

  it("seeds the configured published bio during bootstrap", async () => {
    const t = testConvex();
    const data = await seed(t);
    const result = await t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.adminUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Configured live bio",
      cardUrl: "https://tapit.test/c/configured-bio-token",
      cardToken: "configured-bio-token",
    });
    const profile = await t.run(async (ctx) => await ctx.db.get(result.profileId));
    expect(profile).toMatchObject({
      draft: { bio: "Configured live bio" },
      published: { bio: "Configured live bio" },
    });
  });

  it("rejects bootstrap when an Auth user is already linked to another customer", async () => {
    const t = testConvex();
    const data = await seed(t);
    await expect(
      t.mutation(internal.bootstrap.bootstrap, {
        adminUserId: data.otherUserId,
        customerUserId: data.ownerUserId,
        adminEmail: "new-admin@example.com",
        customerEmail: "owner@example.com",
        customerSlug: "owner",
        publishedBio: "Owner bootstrap bio",
        cardUrl: "https://tapit.test/c/bootstrap-token",
        cardToken: "bootstrap-token",
      }),
    ).rejects.toThrow("already linked to another customer");
  });
});
