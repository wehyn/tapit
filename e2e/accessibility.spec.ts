import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("public profile has no automated accessibility violations", async ({ page }) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/mara-velasquez");
    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expectNoA11yViolations(page);
  }
});

test("published profile disclosure is keyboard accessible", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByRole("radio", { name: "About", exact: true }).check();
  await page.getByLabel("About copy").fill("Keyboard-friendly studio details.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expectNoA11yViolations(page);
  const disclosure = page.locator("summary").filter({ hasText: "About" });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await disclosure.focus();
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#profile-section-about")).toBeVisible();
  await expect(page.getByText("Keyboard-friendly studio details.")).toBeVisible();
  await expect(disclosure).toBeFocused();
  await expectNoA11yViolations(page);
});

test("customer workspace has no automated accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/app/links");
  await expect(page.getByRole("heading", { name: "Your links" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("customer signup has no automated accessibility violations", async ({ page }) => {
  await page.goto("/login?mode=signup");
  await expect(page.getByRole("heading", { name: "Create your Tapit profile" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
  await expectNoA11yViolations(page);
});

test("administrator workspace has no automated accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
  await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
  await expectNoA11yViolations(page);
});
