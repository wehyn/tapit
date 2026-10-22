import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

const screenshotDirectory = resolve(
  process.env.TAPIT_REDESIGN_SCREENSHOT_DIR ?? "test-results/soft-precision-site",
);
const viewports = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

type RouteCapture = {
  name: string;
  path: string;
  heading: string;
  redirectTo?: string;
};

const publicRoutes: readonly RouteCapture[] = [
  { name: "landing", path: "/", heading: "Share with a tap. Follow up with ease." },
  { name: "login", path: "/login", heading: "Welcome back" },
  { name: "setup", path: "/setup/demo-setup-token", heading: "Choose a password" },
  {
    name: "onboarding",
    path: "/onboarding",
    heading: "Welcome back",
    redirectTo: "/login",
  },
  { name: "privacy", path: "/privacy", heading: "Tapit privacy notice" },
  { name: "terms", path: "/terms", heading: "Tapit terms of use" },
  { name: "not-found", path: "/no-such-page-for-capture", heading: "Profile not found" },
  { name: "public-profile", path: "/mara-velasquez", heading: "Mara Velasquez" },
  { name: "card-claim", path: "/c/claimable-card-demo", heading: "This card is ready to set up" },
  { name: "build-card", path: "/build-card", heading: "Bring your card to life" },
];

const customerRoutes: readonly RouteCapture[] = [
  { name: "profile", path: "/app/profile", heading: "Your profile" },
  { name: "links", path: "/app/links", heading: "Links" },
  { name: "customize", path: "/app/customize", heading: "Customize your profile" },
  { name: "card", path: "/app/card", heading: "Bring your card to life" },
  { name: "analytics", path: "/app/analytics", heading: "Profile analytics" },
  { name: "account", path: "/app/account", heading: "Account" },
];

const adminRoutes: readonly RouteCapture[] = [
  { name: "admin-customers", path: "/admin/customers", heading: "Customers" },
  { name: "admin-profiles", path: "/admin/profiles", heading: "Profiles" },
  { name: "admin-cards", path: "/admin/cards", heading: "Cards" },
  { name: "admin-analytics", path: "/admin/analytics", heading: "Analytics" },
  { name: "admin-audit", path: "/admin/audit-log", heading: "Audit log" },
  { name: "admin-settings", path: "/admin/settings", heading: "Settings" },
];

mkdirSync(screenshotDirectory, { recursive: true });

async function captureScreenshot(page: Page, name: string, fullPage = true) {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    caret: "hide",
    fullPage,
    path: resolve(screenshotDirectory, name),
  });
}

async function captureRouteAtWidths(page: Page, route: RouteCapture) {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(route.path);
    if (route.redirectTo)
      await expect(page).toHaveURL(new RegExp(`${route.redirectTo}(?:\\?.*)?$`));
    await expect(
      page.getByRole("heading", { name: route.heading, exact: true }).first(),
    ).toBeVisible();
    if (route.name === "landing") {
      const screen = page.getByTestId("tapit-hero-phone-screen");
      await expect(screen).toContainText("Save contact");
      await expect(screen.getByText("Mara Velasquez", { exact: true })).toBeVisible();
    }
    await captureScreenshot(page, `${route.name}-${viewport.width}.png`);
  }
}

test("capture public routes at desktop and mobile widths", async ({ page }) => {
  for (const route of publicRoutes) await captureRouteAtWidths(page, route);
});

test("capture customer workspace routes at desktop and mobile widths", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  for (const route of customerRoutes) await captureRouteAtWidths(page, route);
});

test("capture administrator routes at desktop and mobile widths", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  for (const route of adminRoutes) await captureRouteAtWidths(page, route);
});

test("capture the mobile More sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();

  const tabBar = page.getByRole("navigation", { name: "Mobile navigation" });
  await tabBar.getByRole("button", { name: "More", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await expect(sheet).toBeVisible();
  for (const label of ["Customize", "Card", "Account", "Help"]) {
    await expect(sheet.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(sheet.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await captureScreenshot(page, "more-sheet-390.png", false);
});
