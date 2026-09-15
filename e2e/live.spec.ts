import { test, expect } from "./fixtures/live";

test.describe("live Convex vertical slice", () => {
  test.describe.configure({ mode: "serial" });

  test("customer draft stays private until publish, then survives sign-out", async ({
    page,
    browser,
    liveEnv,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /demo profile/i })).toHaveCount(0);

    await page.goto("/app/profile");
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

    await page.getByLabel("Email").fill(liveEnv.customerEmail);
    await page.getByLabel("Password", { exact: true }).fill(liveEnv.customerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();

    await page.getByRole("button", { name: "night", exact: true }).click();
    const draftBio = `Live E2E draft ${Date.now()}`;
    await page.getByLabel("Bio or role").fill(draftBio);
    await page.locator("#profile-image").setInputFiles("public/images/tapit-demo-mara-avatar.png");
    const profileIdentity = page.getByRole("heading", { name: "Profile identity" }).locator("..");
    await expect(profileIdentity.getByRole("img", { name: /profile$/ })).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

    const visitorContext = await browser.newContext({ baseURL: liveEnv.baseURL });
    const visitor = await visitorContext.newPage();
    try {
      await visitor.goto(`/${liveEnv.profileSlug}`);
      await expect(visitor.getByText(liveEnv.publishedBio)).toBeVisible();
      await expect(visitor.getByText(draftBio)).toHaveCount(0);
      await expect(visitor.locator('img[alt$="profile"]')).toHaveCount(0);
      await expect(visitor.locator("main")).toHaveClass(/bg-tapit-paper/);

      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByText("Profile published")).toBeVisible();

      await visitor.reload();
      await expect(visitor.getByText(draftBio)).toBeVisible();
      await expect(visitor.locator('img[alt$="profile"]')).toBeVisible();
      await expect(visitor.locator("main")).toHaveClass(/bg-\[#17211f\]/);
    } finally {
      await visitorContext.close();
    }

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
    await page.goto("/app/profile");
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

    await page.getByLabel("Email").fill(liveEnv.customerEmail);
    await page.getByLabel("Password", { exact: true }).fill(liveEnv.customerPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "paper", exact: true }).click();
    await page.getByLabel("Bio or role").fill(liveEnv.publishedBio);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Profile published")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  });

  test("administrator can manage cards and open live analytics", async ({ page, liveEnv }) => {
    const { adminEmail, adminPassword } = liveEnv;
    await page.goto("/login");
    await page.getByLabel("Email").fill(adminEmail as string);
    await page.getByLabel("Password", { exact: true }).fill(adminPassword as string);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);
    await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();

    await page.goto("/admin/cards");
    await expect(page.getByRole("heading", { name: "Register card URL" })).toBeVisible();
    const token = `live-ui-${Date.now()}`;
    const replacementToken = `${token}-replacement`;
    await page.getByLabel("Pre-encoded card URL").fill(`https://tapit.test/c/${token}`);
    await page.getByRole("button", { name: "Register card" }).click();
    await expect(
      page.getByText(`Card ${token} registered and ready for assignment.`),
    ).toBeVisible();

    const card = page.locator("article").filter({ hasText: token }).first();
    await card.getByRole("button", { name: "Assign" }).click();
    await expect(page.getByText(`Card ${token} assigned.`)).toBeVisible();
    await card
      .getByLabel(`Replacement URL for ${token}`)
      .fill(`https://tapit.test/c/${replacementToken}`);
    await card.getByRole("button", { name: "Replace" }).click();
    await expect(page.getByText(`Card ${token} replaced.`)).toBeVisible();

    const replacement = page.locator("article").filter({ hasText: replacementToken }).first();
    await replacement.getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(`Card ${replacementToken} deactivated.`)).toBeVisible();

    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "Operational analytics" })).toBeVisible();
    await expect(page.getByText("Profile views", { exact: true })).toBeVisible();
  });

  test("invitation setup creates a customer session and consumes the token", async ({
    page,
    browser,
    liveEnv,
  }) => {
    const { setupToken, setupPassword, setupEmail } = liveEnv;

    await page.goto(`/setup/${setupToken as string}`);
    await expect(page.getByText(`Account email: ${setupEmail as string}`)).toBeVisible();
    await page.getByLabel("Password", { exact: true }).fill(setupPassword as string);
    await page.getByLabel("Confirm password", { exact: true }).fill(setupPassword as string);
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();

    const replayContext = await browser.newContext({ baseURL: liveEnv.baseURL });
    try {
      const replayPage = await replayContext.newPage();
      await replayPage.goto(`/setup/${setupToken as string}`);
      await expect(
        replayPage.getByText("This setup link is invalid, expired, or already used."),
      ).toBeVisible();
    } finally {
      await replayContext.close();
    }
  });

  test("administrator edits, publishes, suspends, and restores the seeded profile", async ({
    page,
    browser,
    liveEnv,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(liveEnv.adminEmail);
    await page.getByLabel("Password", { exact: true }).fill(liveEnv.adminPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/customers$/);
    await page.goto("/admin/profiles");
    await expect(page.getByRole("heading", { name: /profile management/i })).toBeVisible();
    await page.getByLabel("Search profiles").fill(liveEnv.profileSlug);

    const newBio = `Live E2E admin ${Date.now()}`;
    await page.getByLabel("Bio or role").fill(newBio);
    await page.getByRole("button", { name: "Save admin draft" }).click();
    await expect(page.getByText("Administrative draft changes saved.")).toBeVisible();

    const visitor = await browser.newContext({ baseURL: liveEnv.baseURL });
    const visitorPage = await visitor.newPage();
    try {
      await visitorPage.goto(`/${liveEnv.profileSlug}`);
      await expect(visitorPage.getByText(liveEnv.publishedBio)).toBeVisible();
      await expect(visitorPage.getByText(newBio)).toHaveCount(0);

      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByText("Profile published.")).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByText(newBio)).toBeVisible();

      await page.getByRole("button", { name: "Unpublish", exact: true }).click();
      await page.getByRole("button", { name: "Unpublish profile", exact: true }).click();
      await expect(page.getByText("Profile status changed to unpublished.")).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByRole("heading", { name: "Profile not found" })).toBeVisible();

      await page.getByRole("button", { name: "Restore profile", exact: true }).click();
      await expect(page.getByText("Profile status changed to published.")).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByText(newBio)).toBeVisible();

      await page.getByRole("button", { name: "Suspend", exact: true }).click();
      await page.getByRole("button", { name: "Suspend profile", exact: true }).click();
      await expect(page.getByText("Profile status changed to suspended.")).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByRole("heading", { name: "Profile not found" })).toBeVisible();

      await page.getByRole("button", { name: "Restore profile", exact: true }).click();
      await expect(page.getByText("Profile status changed to published.")).toBeVisible();
      await visitorPage.reload();
      await expect(visitorPage.getByText(newBio)).toBeVisible();
    } finally {
      await visitor.close();
    }
  });
});
