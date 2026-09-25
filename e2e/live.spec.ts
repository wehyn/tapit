import { contextForIdentity, expect, signInWithGoogle, test } from "./fixtures/live";
import type { Page } from "@playwright/test";

let setupPath = process.env.TAPIT_LIVE_SETUP_PATH;
let replacedSetupPath: string | undefined;
let customerProfileSlug: string | undefined;

function accountRow(page: Page, email: string) {
  return page.locator("article").filter({ hasText: email }).first();
}

async function extractSetupPath(page: Page) {
  const text = await page.getByText(/Reusable until revoked:/).innerText();
  const path = text.match(/\/setup\/[A-Za-z0-9_-]+/)?.[0];
  if (!path) throw new Error("The admin view did not show a replacement invitation link.");
  return path;
}

async function extractPrivateProfileSlug(page: Page) {
  const text = await page.getByRole("status").innerText();
  const slug = text.match(/\/([a-z0-9-]+)\.$/)?.[1];
  if (!slug) throw new Error("Onboarding did not display the private profile URL.");
  return slug;
}

test.describe("live Google OAuth journeys", () => {
  test.describe.configure({ mode: "serial" });

  test("the first allowlisted Google identity reaches the administrator workspace", async ({
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

  test("a new customer can delete and restart pending onboarding, create a private profile, and publish it", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "customer");
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await signInWithGoogle(page, /\/onboarding$/);

      await expect(page.getByRole("heading", { name: "Choose your display name" })).toBeVisible();
      const name = page.getByLabel("Display name");
      await expect(name).toBeEnabled();
      await expect(name).not.toHaveValue("");

      await page.getByRole("button", { name: "Delete pending account" }).click();
      await page.getByRole("button", { name: "Confirm delete account" }).click();
      await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

      await signInWithGoogle(page, /\/onboarding$/);
      await expect(page.getByRole("heading", { name: "Choose your display name" })).toBeVisible();
      await page.getByLabel("Display name").fill(liveEnv.profileSlug);
      await page.getByRole("button", { name: "Complete onboarding" }).click();
      await expect(page.getByRole("status")).toContainText("Your private profile is ready at /");
      const createdSlug = await extractPrivateProfileSlug(page);
      customerProfileSlug = createdSlug;
      await expect(page.getByRole("button", { name: "Continue to your profile" })).toBeVisible();
      await page.getByRole("button", { name: "Continue to your profile" }).click();
      await expect(page).toHaveURL(/\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();

      const publicContext = await browser.newContext({ baseURL: liveEnv.baseURL });
      try {
        const publicPage = await publicContext.newPage();
        await publicPage.goto(`/${createdSlug}`);
        await expect(publicPage.getByRole("heading", { name: "Profile not found" })).toBeVisible();
      } finally {
        await publicContext.close();
      }

      await page.getByLabel("Bio or role").fill(liveEnv.publishedBio);
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await expect(
        page.getByText("Draft saved. Visitors still see the last published version."),
      ).toBeVisible();
      await page.goto("/app/links");
      await page.getByRole("button", { name: "Add link" }).click();
      await page.getByPlaceholder("e.g. Portfolio").fill("Portfolio");
      await page.getByPlaceholder("https:// or mailto: or tel:").fill("https://example.com");
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(
        page.getByText("Profile published. Your active card paths now show this version."),
      ).toBeVisible();

      const verifiedPublicContext = await browser.newContext({ baseURL: liveEnv.baseURL });
      try {
        const verifiedPublicPage = await verifiedPublicContext.newPage();
        await verifiedPublicPage.goto(`/${createdSlug}`);
        await expect(verifiedPublicPage.getByText(liveEnv.publishedBio)).toBeVisible();
      } finally {
        await verifiedPublicContext.close();
      }
    } finally {
      await context.close();
    }
  });

  test("a returning active Google identity goes directly to its private profile", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "customer");
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await signInWithGoogle(page, /\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
      await expect(
        page.getByRole("button", { name: `Account menu for ${liveEnv.customerEmail}` }),
      ).toBeVisible();
      const profileSlug = await page.getByLabel("Stable profile slug").inputValue();
      expect(profileSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      customerProfileSlug = profileSlug;
      await expect(page.getByLabel("Bio or role")).toHaveValue(liveEnv.publishedBio);
    } finally {
      await context.close();
    }
  });

  test("an invited Google identity cannot enter by logging in without its invitation link", async ({
    browser,
    liveEnv,
  }) => {
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto("/app/profile");
      await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
      await signInWithGoogle(page);
      await expect(page).toHaveURL(/\/login\?reason=invitation-required/);
      await expect(
        page.getByText("Use your invitation link to continue with Google."),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a different verified Google identity cannot claim the invitation", async ({
    browser,
    liveEnv,
  }) => {
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "admin");
    const page = await context.newPage();
    try {
      await page.goto(setupPath as string);
      await expect(page.getByRole("heading", { name: "Join Tapit with Google" })).toBeVisible();
      await signInWithGoogle(page);
      await expect(
        page.getByText("This Google account does not match the invitation email."),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("the admin sees the generated profile details and replacing an invitation revokes its old link", async ({
    browser,
    liveEnv,
  }) => {
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "admin");
    const page = await context.newPage();
    try {
      await page.goto("/admin/customers");
      const row = accountRow(page, liveEnv.invitedEmail);
      await expect(row.getByText(/Profile: Live invited customer · \/[a-z0-9-]+/)).toBeVisible();

      const previousPath = setupPath;
      await row.getByRole("button", { name: "Replace invitation" }).click();
      await expect(page.getByText("The previous link is invalid immediately.")).toBeVisible();
      replacedSetupPath = await extractSetupPath(page);
      expect(replacedSetupPath).not.toBe(previousPath);
      setupPath = replacedSetupPath;

      const revokedContext = await browser.newContext({ baseURL: liveEnv.baseURL });
      try {
        const revokedPage = await revokedContext.newPage();
        await revokedPage.goto(previousPath as string);
        await expect(revokedPage.getByText("This invitation has been revoked.")).toBeVisible();
      } finally {
        await revokedContext.close();
      }
    } finally {
      await context.close();
    }
  });

  test("the matching Google identity accepts the invitation and keeps the pre-created profile", async ({
    browser,
    liveEnv,
  }) => {
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto(setupPath as string);
      await expect(page.getByText(liveEnv.invitedEmail)).toBeVisible();
      await expect(page.getByText("Live invited customer")).toBeVisible();
      await signInWithGoogle(page, /\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
      await expect(page.getByLabel("Name")).toHaveValue("Live invited customer");
      await expect(page.getByLabel("Stable profile slug")).not.toHaveValue("");
    } finally {
      await context.close();
    }
  });

  test("the accepted invitation remains reusable by the same Google identity until revoked", async ({
    browser,
    liveEnv,
  }) => {
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "invited");
    const page = await context.newPage();
    try {
      await page.goto(setupPath as string);
      await signInWithGoogle(page, /\/app\/profile$/);
      await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("admins can manage roles and still reach profile, card, and analytics workspaces", async ({
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

      const customer = accountRow(page, liveEnv.customerEmail);
      page.on("dialog", (dialog) => dialog.accept());
      await customer.getByRole("button", { name: "Promote to administrator" }).click();
      await expect(customer).toContainText("admin · active · active");
      await customer.getByRole("button", { name: "Demote to customer" }).click();
      await expect(customer).toContainText("customer · active · active");

      await page.goto("/admin/profiles");
      await expect(page.getByRole("heading", { name: "Profile management" })).toBeVisible();
      await page.goto("/admin/cards");
      await expect(page.getByRole("heading", { name: "Register card URL" })).toBeVisible();
      await page.goto("/admin/analytics");
      await expect(page.getByRole("heading", { name: "Operational analytics" })).toBeVisible();
      await page.goto(`/${customerProfileSlug ?? liveEnv.profileSlug}`);
      await expect(page.getByText(liveEnv.publishedBio)).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("an administrator can revoke the accepted invitation", async ({ browser, liveEnv }) => {
    test.skip(!setupPath, "The wrapper supplies a fresh invitation path in process memory.");
    const context = await contextForIdentity(browser, liveEnv, "admin");
    const page = await context.newPage();
    try {
      await page.goto("/admin/customers");
      const invited = accountRow(page, liveEnv.invitedEmail);
      await expect(invited.getByText("Invitation: accepted")).toBeVisible();
      page.on("dialog", (dialog) => dialog.accept());
      await invited.getByRole("button", { name: "Revoke invitation" }).click();

      const revokedContext = await browser.newContext({ baseURL: liveEnv.baseURL });
      try {
        const revokedPage = await revokedContext.newPage();
        await revokedPage.goto(setupPath as string);
        await expect(revokedPage.getByText("This invitation has been revoked.")).toBeVisible();
      } finally {
        await revokedContext.close();
      }
    } finally {
      await context.close();
    }
  });
});
