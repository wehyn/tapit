import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

const screenshotPath = (name: string) => `test-results/soft-precision-site/${name}`;

async function captureScreenshot(
  page: Page,
  name: string,
  caret: "hide" | "initial" = "hide",
  fullPage = true,
) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (fullPage) {
    const revealTargets = await page.locator("[data-scroll-reveal]").all();
    for (const target of revealTargets) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toHaveAttribute("data-revealed", "true");
    }
    await expect
      .poll(() =>
        page
          .locator("[data-scroll-reveal]")
          .evaluateAll((elements) =>
            elements.every((element) => Number(getComputedStyle(element).opacity) >= 0.99),
          ),
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.screenshot({ fullPage, path: screenshotPath(name), caret });
}

async function waitForHeroProfileScreen(page: Page) {
  const screen = page.getByTestId("tapit-hero-phone-screen");
  await expect(screen).toBeVisible();
  await expect(screen.getByText("Mara Velasquez", { exact: true })).toBeVisible();
  await expect(screen).toContainText("Save contact");
}

test("capture the landing page at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A better introduction, in one tap." }),
  ).toBeVisible();
  await waitForHeroProfileScreen(page);
  await captureScreenshot(page, "landing-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A better introduction, in one tap." }),
  ).toBeVisible();
  await waitForHeroProfileScreen(page);
  await captureScreenshot(page, "landing-mobile.png");
});

test("capture a public profile at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await captureScreenshot(page, "public-profile-desktop.png");

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

test("capture card design at desktop and mobile sizes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/build-card");
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await captureScreenshot(page, "card-design-desktop.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/build-card");
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await captureScreenshot(page, "card-design-mobile.png");
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
