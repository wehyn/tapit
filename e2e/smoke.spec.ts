import { expect, test } from "@playwright/test";

import { createDefaultDemoState } from "../src/lib/demo/fixtures";
import { serializeDemoState } from "../src/lib/demo/storage-codec";
import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

test("homepage presents a Tapit profile and profile creation action at mobile and desktop sizes", async ({
  page,
}) => {
  const profileActions = page.getByRole("link", { name: "Create your profile", exact: true });
  const phone = page.getByRole("group", { name: "Tapit profile on an iPhone" });
  const screen = phone.getByTestId("tapit-hero-phone-screen");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const heroHeading = page.getByRole("heading", {
      name: "Share with a tap. Follow up with ease.",
    });
    await expect(heroHeading).toBeVisible();
    await expect(heroHeading).toHaveCSS("text-align", viewport.width >= 1024 ? "left" : "center");
    await expect(profileActions).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(profileActions.nth(index)).toHaveAttribute("href", "/login?mode=signup");
    }
    await expect(phone).toBeVisible();
    await expect(screen).toBeVisible();
    await expect(screen.getByText("Mara Velasquez", { exact: true })).toBeVisible();
    await expect(screen).toContainText("LinkedIn");
    await expect(screen).toContainText("Portfolio");
    await expect(screen.getByText("Save contact", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test("landing page keeps the approved section order and factual copy", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Share with a tap. Follow up with ease." }),
  ).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);
  const hero = page.locator("main section").first();
  await expect(hero).toContainText("Share with a tap.");
  await expect(hero.getByRole("group", { name: "Tapit profile on an iPhone" })).toBeVisible();
  const orderedSections = await page
    .locator("#how-it-works, #faq")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(orderedSections).toEqual(["how-it-works", "faq"]);

  for (const step of ["Shape your profile", "Choose what to share", "Tap or scan to connect"]) {
    await expect(page.locator("#how-it-works")).toContainText(step);
  }
  for (const feature of ["Save contact", "Featured link", "Simple analytics", "Your look"]) {
    await expect(page.getByText(feature, { exact: true }).last()).toBeVisible();
  }
  await expect(page.locator("#faq")).toContainText(/card ordering is coming soon/i);
  await expect(page.getByRole("link", { name: "Design a card", exact: true })).toHaveAttribute(
    "href",
    "/build-card",
  );
  await expect(page.locator("#pricing")).toHaveCount(0);
  await expect(page.locator("#testimonials")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /pricing|testimonials/i })).toHaveCount(0);
  await expect(page.locator("main footer")).toContainText("Privacy");
  await expect(page.locator("main footer")).toContainText("Terms");
});

test("homepage profile CTAs preserve customer and admin destinations and start guest profile creation", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/");

  const adminActions = page.getByRole("link", { name: "Dashboard", exact: true });
  await expect(adminActions).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(adminActions.nth(index)).toHaveAttribute("href", "/admin/customers");
  }
  await adminActions.nth(1).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);

  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/");

  const profileActions = page.getByRole("link", { name: "Go to your profile", exact: true });
  await expect(profileActions).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    await expect(profileActions.nth(index)).toHaveAttribute("href", "/app/profile");
  }

  await profileActions.nth(1).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Your profile", exact: true }),
  ).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Go to your profile", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Your profile", exact: true }),
  ).toBeVisible();

  await resetDemoHarness(page);
  await page.goto("/");
  const createProfileActions = page.getByRole("link", { name: "Create your profile", exact: true });
  await expect(createProfileActions).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(createProfileActions.nth(index)).toHaveAttribute("href", "/login?mode=signup");
  }
  await expect(createProfileActions.nth(1)).toHaveAttribute("aria-busy", "false");
  await createProfileActions.nth(1).click();
  await expect(page).toHaveURL(/\/login\?mode=signup$/);
  await expect(page.getByRole("heading", { name: "Create your Tapit profile" })).toBeVisible();
  await expect(page.getByLabel("Display name")).toBeVisible();
});

test("homepage routes a stale inactive demo session to account recovery", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);

  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "tapit:demo-session:v1",
      JSON.stringify({ email: "mara@example.test", role: "customer" }),
    );
  });
  await page.reload();

  const recoveryActions = page.locator('a[href="/login?reason=account-inactive"]');
  await expect(recoveryActions).toHaveCount(3);
  await recoveryActions.nth(1).click();

  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await expect(page.getByText(/Your account is inactive\./)).toBeVisible();
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
});

test("customer workspace routes a restricted demo session to account recovery", async ({
  page,
}) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);

  await page.evaluate(() => {
    window.localStorage.setItem(
      "tapit:demo-session:v1",
      JSON.stringify({ email: "mara@example.test", role: "customer" }),
    );
  });
  await page.goto("/app/profile");

  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await expect(page.getByText(/Your account is inactive\./)).toBeVisible();
});

test("local sign-in routes a customer without an owned profile to account recovery", async ({
  page,
}) => {
  await resetDemoHarness(page);
  const state = createDefaultDemoState();
  const customer = state.customers.find((candidate) => candidate.email === "mara@example.test");
  if (!customer?.profileId)
    throw new Error("The demo customer must own a profile before the fixture changes.");
  state.profiles = state.profiles.filter((profile) => profile.id !== customer.profileId);
  await page.evaluate((serializedState) => {
    window.localStorage.setItem("tapit:demo-state:v1", serializedState);
  }, serializeDemoState(state));
  await page.reload();

  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await expect(page.getByText(/Your account is inactive\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("premium landing stays within supported viewport widths", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Share with a tap. Follow up with ease." }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: "Create your profile", exact: true }).first();
    await expect(cta).toBeVisible();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(width);

    if (width < 1024) {
      const menu = page.getByRole("button", { name: "Open menu" });
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
});

test("sticky public navigation stays at the top while scrolling", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header").first();
  await expect(header).toHaveCSS("position", "sticky");
  await page.evaluate(() => window.scrollTo(0, 1200));
  await expect
    .poll(async () => (await header.boundingBox())?.y ?? Number.POSITIVE_INFINITY)
    .toBe(0);
});

test("mobile navigation opens and closes with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: /menu/ });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();

  await page.keyboard.press("Enter");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "FAQ", exact: true })
    .click();
  await expect(page).toHaveURL(/#faq$/);
});

test("landing content remains visible when JavaScript is disabled", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });

  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Share with a tap. Follow up with ease." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create your profile", exact: true }).first(),
    ).toHaveAttribute("href", "/login?mode=signup");
    await expect(page.locator("#how-it-works")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("visitors can reach the privacy notice and terms from the public homepage", async ({
  page,
}) => {
  await page.goto("/");

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  const privacyHeading = page.getByRole("heading", { name: "Tapit privacy notice" });
  await expect(privacyHeading).toBeVisible();
  await expect(privacyHeading).toHaveCSS("font-family", /system-ui|sans-serif|Arial/i);
  await expect(page.locator("article")).toHaveCSS("max-width", "768px");

  await page.getByRole("link", { name: "Back to Tapit" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Tapit privacy notice" })).toBeVisible();
  await expect(page.getByText("Wayne Garcia operates Tapit from the Philippines.")).toBeVisible();

  await page.getByRole("link", { name: "Back to Tapit" }).click();
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Tapit terms of use" })).toBeVisible();

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const routes: Array<[string, string]> = [
      ["/privacy", "Tapit privacy notice"],
      ["/terms", "Tapit terms of use"],
    ];
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
    }
  }
});
