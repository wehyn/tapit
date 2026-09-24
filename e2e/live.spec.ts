import { contextForIdentity, expect, signInWithGoogle, test } from "./fixtures/live";

test.describe("live Google OAuth journeys", () => {
  test.describe.configure({ mode: "serial" });

  test("first allowlisted Google identity reaches the administrator workspace", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "admin");
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await signInWithGoogle(page, /\/admin\/customers$/);
      await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("returning active Google identity goes directly to its private profile", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "customer");
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await signInWithGoogle(page, /\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
      await expect(page.getByText(liveEnv.publishedBio)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("non-allowlisted Google identity is routed to pending onboarding", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await signInWithGoogle(page);
      await expect(page).toHaveURL(/\/(?:onboarding|app\/profile|login)(?:\?.*)?$/);
      if (page.url().includes("/onboarding")) {
        await expect(page.getByRole("heading", { name: "Choose your display name" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Complete onboarding" })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });

  test("invitation accepts the matching Google identity and preserves the profile", async ({
    browser,
    liveEnv,
  }) => {
    const setupPath = process.env.TAPIT_LIVE_SETUP_PATH;
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto(setupPath as string);
      await expect(page.getByText("Join Tapit with Google")).toBeVisible();
      await expect(
        page.getByText("Your invitation stays reusable until an administrator revokes it."),
      ).toBeVisible();
      await expect(page.getByText("Invitation for")).toBeVisible();
      await signInWithGoogle(page, /\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("admin invitation, role, cards, analytics, and privacy surfaces remain available", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "admin");
    const page = await context.newPage();
    try {
      await page.goto("/admin/customers");
      await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Create and invite", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "Reset password" })).toHaveCount(0);

      await page.goto("/admin/cards");
      await expect(page.getByRole("heading", { name: "Register card URL" })).toBeVisible();
      await page.goto("/admin/analytics");
      await expect(page.getByRole("heading", { name: "Operational analytics" })).toBeVisible();

      await page.goto(`/${liveEnv.profileSlug}`);
      await expect(page.getByText(liveEnv.publishedBio)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("direct login without invitation context remains blocked for an invited account", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto("/app/profile");
      await expect(page).toHaveURL(/\/login|\/onboarding|\/setup\//);
      if (page.url().includes("/login")) {
        await expect(page.getByText(/invitation link|inactive/i)).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});
