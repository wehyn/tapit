import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("public profile has no automated accessibility violations", async ({ page }) => {
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expectNoA11yViolations(page);
});

test("customer workspace has no automated accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto("/app/links");
  await expect(page.getByRole("button", { name: "Add link" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Profile details" })).toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("navigation", { name: "Your Tapit profile navigation" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/customers");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Tapit operations navigation" })).toBeVisible();
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await expectNoA11yViolations(page);
});
