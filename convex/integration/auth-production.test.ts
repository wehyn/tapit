import { generateKeyPairSync } from "node:crypto";

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{ts,js}");
const testJWTPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString()
  .replace(/\n/g, " ");

const testConvex = () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
};

function stubEmailTransport() {
  const transport = vi.fn(async () => new Response(null, { status: 202 }));
  vi.stubGlobal("fetch", transport);
  vi.stubEnv("TAPIT_SUPPORT_URL", "https://support.example.test");
  vi.stubEnv("TAPIT_AUTH_EMAIL_FROM", "Tapit <auth@example.test>");
  vi.stubEnv("TAPIT_AUTH_EMAIL_API_KEY", "test-api-key");
  vi.stubEnv("TAPIT_AUTH_EMAIL_API_URL", "https://mailer.example.test/send");
  vi.stubEnv("SITE_URL", "https://tapit.example.test");
  vi.stubEnv("CONVEX_SITE_URL", "https://tapit.test");
  vi.stubEnv("JWT_PRIVATE_KEY", testJWTPrivateKey);
  return transport;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const identity = (userId: Id<"users">) => ({
  issuer: "https://tapit.test",
  subject: userId,
  tokenIdentifier: `https://tapit.test|${userId}`,
});

describe("production authentication boundaries", () => {
  it("returns the same generic password-reset result for known and unknown emails", async () => {
    const t = testConvex();
    const transport = stubEmailTransport();
    const email = "known@example.test";

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email, password: "correct-horse-battery" },
      }),
    ).resolves.toMatchObject({ tokens: null });

    const knownStartedAt = Date.now();
    const knownResult = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email },
    });
    const knownElapsed = Date.now() - knownStartedAt;
    const unknownStartedAt = Date.now();
    const unknownResult = await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email: "unknown@example.test" },
    });
    const unknownElapsed = Date.now() - unknownStartedAt;
    await t.finishAllScheduledFunctions(() => undefined);

    expect(knownResult).toEqual(unknownResult);
    expect(knownResult).toEqual({});
    expect(knownElapsed).toBeGreaterThanOrEqual(200);
    expect(unknownElapsed).toBeGreaterThanOrEqual(200);
    expect(transport).toHaveBeenCalledTimes(2);

    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email: "unknown@example.test" },
    });
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email: " UNKNOWN@example.test " },
    });
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signUp", email: "unknown@example.test", password: "correct-horse-battery" },
    });
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "reset", email: "unknown@example.test" },
      }),
    ).resolves.toEqual({});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("redeems a verification token with normalized email input", async () => {
    const t = testConvex();
    const transport = stubEmailTransport();
    const email = "Mixed-Case@example.test";

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "signUp", email, password: "correct-horse-battery" },
      }),
    ).resolves.toMatchObject({ tokens: null });

    const providerCall = (transport.mock.calls as unknown as Array<[string, { body?: string }]>)[0];
    expect(providerCall?.[1]?.body).toBeTypeOf("string");
    const message = JSON.parse(providerCall![1].body!) as { text: string };
    const verificationURL = new URL(message.text.split("\n")[1]!);
    const code = verificationURL.searchParams.get("code");
    expect(code).toBeTruthy();

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          flow: "email-verification",
          email: `  ${email.toUpperCase()}  `,
          code,
        },
      }),
    ).resolves.toMatchObject({
      tokens: expect.objectContaining({
        refreshToken: expect.any(String),
        token: expect.any(String),
      }),
    });
  });

  it("shares a normalized per-email quota across reset and verification sends", async () => {
    const t = testConvex();
    const transport = stubEmailTransport();
    const email = "Rate-Limit@example.test";

    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "signUp", email, password: "correct-horse-battery" },
    });
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email: email.toLowerCase() },
    });
    await t.action(api.auth.signIn, {
      provider: "password",
      params: { flow: "reset", email: `  ${email.toUpperCase()}  ` },
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "reset", email },
      }),
    ).resolves.toEqual({});
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: { flow: "email-verification", email },
      }),
    ).rejects.toThrow("Authentication email service unavailable.");
    await t.finishAllScheduledFunctions(() => undefined);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("does not create an application customer until signup email verification completes", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { email: "unverified@example.test" }),
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

  it("rejects the fourth same-identity signup attempt without creating another customer", async () => {
    const t = testConvex();
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
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
});
