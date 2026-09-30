import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

const screenshotPath = (name: string) => `test-results/warm-editorial-redesign/${name}`;

async function captureScreenshot(
  page: Page,
  name: string,
  caret: "hide" | "initial" = "hide",
  fullPage = true,
) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ fullPage, path: screenshotPath(name), caret });
}

async function waitForHeroProfileCard(page: Page) {
  const card = page.locator(
    'img[alt="Photographed Tapit profile card for Taylor Kim resting on pale stone."]:visible',
  );
  await expect(card).toBeVisible();
  await expect
    .poll(() => card.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

test("capture the landing page at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Share one profile. Update it anytime." }),
  ).toBeVisible();
  await waitForHeroProfileCard(page);
  await captureScreenshot(page, "landing-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Share one profile. Update it anytime." }),
  ).toBeVisible();
  await waitForHeroProfileCard(page);
  await captureScreenshot(page, "landing-mobile.png");
});

test("capture a public profile on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await captureScreenshot(page, "public-profile-mobile.png");
});

test("capture sign-in on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to Tapit" })).toBeVisible();
  await captureScreenshot(page, "login-mobile.png", "initial");
});

test("capture the customer profile editor at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
  await captureScreenshot(page, "customer-profile-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
  await captureScreenshot(page, "customer-profile-mobile.png");

  await page.setViewportSize({ width: 1487, height: 1058 });
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
  await captureScreenshot(page, "customer-profile-prototype-compare.png", "hide", false);
});

test("capture the administrator profile registry at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/profiles");
  await expect(page.getByRole("heading", { name: "Profile registry" })).toBeVisible();
  await captureScreenshot(page, "admin-profiles-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/profiles");
  await expect(page.getByRole("heading", { name: "Profile registry" })).toBeVisible();
  await captureScreenshot(page, "admin-profiles-mobile.png");
});
