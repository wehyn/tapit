import { expect, test } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

test("homepage presents a Tapit profile on an iPhone and profile action at mobile and desktop sizes", async ({
  page,
}) => {
  const profileActions = page.getByRole("link", { name: "Go to your profile", exact: true });
  const phone = page.getByRole("group", { name: "Tapit profile on an iPhone" });
  const screen = phone.getByTestId("tapit-hero-phone-screen");

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "A better introduction, in one tap." }),
    ).toBeVisible();
    await expect(profileActions).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(profileActions.nth(index)).toHaveAttribute("href", "/app/profile");
    }
    if (viewport.width >= 1280) {
      await expect(page.getByText("Illustrative example", { exact: true })).toBeVisible();
    }
    await expect(phone).toBeVisible();
    await expect(screen).toBeVisible();
    await expect(screen.getByText("Mara Velasquez", { exact: true })).toBeVisible();
    await expect(screen).toContainText("LinkedIn");
    await expect(screen).toContainText("Portfolio");
    await expect(screen.getByText("Save contact", { exact: true })).toBeVisible();
    await expect(screen.getByText("Powered by Tapit", { exact: true })).toBeVisible();
    await expect(
      screen.getByRole("img", { name: "Illustrative Tapit NFC card and profile preview" }),
    ).toHaveCount(0);
    await expect(phone.getByTestId("tapit-iphone-hardware")).toBeVisible();
    const phoneBox = await phone.boundingBox();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.height / phoneBox!.width).toBeGreaterThan(2.0);
    expect(phoneBox!.height / phoneBox!.width).toBeLessThan(2.3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
  }
});

test("landing page keeps the approved section order and factual copy", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "A better introduction, in one tap." }),
  ).toBeVisible();
  await expect(page.locator("main h1")).toHaveCount(1);
  const hero = page.locator("main > section").first();
  await expect(hero).toContainText("A better introduction, in one tap.");
  await expect(hero.getByRole("group", { name: "Tapit profile on an iPhone" })).toBeVisible();
  await expect(hero.locator("[data-scroll-reveal]")).toHaveCount(0);
  await expect(hero.getByRole("heading", { level: 1 })).toHaveCSS("text-align", "center");
  const orderedSections = await page
    .locator("#product-proof, #product, #showcase, #benefits, #how-it-works, #faq")
    .evaluateAll((sections) => sections.map((section) => section.id));
  expect(orderedSections).toEqual([
    "product-proof",
    "product",
    "showcase",
    "benefits",
    "how-it-works",
    "faq",
  ]);

  const proofBand = page.locator("#product-proof");
  for (const fact of ["NFC tap", "QR fallback", "No app required", "Update details anytime"]) {
    await expect(proofBand).toContainText(fact);
  }
  const features = page.locator("#product");
  for (const feature of ["Social links", "Work and portfolio", "Contact details", "Save contact"]) {
    await expect(features).toContainText(feature);
  }
  await expect(page.getByText("Illustrative example", { exact: true })).toBeVisible();
  await expect(page.locator("#faq")).toContainText(/card ordering is coming soon/i);
  await expect(page.getByRole("link", { name: "Explore card designs" })).toHaveAttribute(
    "href",
    "/build-card",
  );
  await expect(page.getByRole("link", { name: "Design a card", exact: true })).toHaveAttribute(
    "href",
    "/build-card",
  );
  await expect(page.locator("#pricing")).toHaveCount(0);
  await expect(page.locator("#testimonials")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /pricing|testimonials/i })).toHaveCount(0);
  await expect(page.locator("main > footer")).toContainText("Privacy");
  await expect(page.locator("main > footer")).toContainText("Terms");
});

test("homepage profile CTAs open the customer profile", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/");

  const profileActions = page.getByRole("link", { name: "Go to your profile", exact: true });
  await expect(profileActions).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    await expect(profileActions.nth(index)).toHaveAttribute("href", "/app/profile");
  }

  await profileActions.nth(1).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByText("Profile identity")).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Go to your profile", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByText("Profile identity")).toBeVisible();

  await resetDemoHarness(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Go to your profile", exact: true }).nth(1).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprofile$/);
});

test("premium landing stays within supported viewport widths", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "A better introduction, in one tap." }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: "Go to your profile", exact: true }).first();
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

test("landing scroll reveals activate when targets enter the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const benefits = page.locator("#benefits [data-scroll-reveal]").first();
  await expect(benefits).toBeAttached();
  await expect
    .poll(() => benefits.evaluate((section) => getComputedStyle(section).opacity))
    .toBe("0");

  await benefits.scrollIntoViewIfNeeded();
  await expect
    .poll(() => benefits.evaluate((section) => getComputedStyle(section).opacity))
    .toBe("1");
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
      page.getByRole("heading", { name: "A better introduction, in one tap." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to your profile", exact: true }).first(),
    ).toHaveAttribute("href", "/app/profile");
    await expect(page.locator("#product-proof")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("reduced motion keeps reveal content visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A better introduction, in one tap." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to your profile", exact: true }).first(),
  ).toBeVisible();

  const benefitStyles = await page.locator("#benefits").evaluate((section) => {
    const styles = getComputedStyle(section);
    return {
      animationName: styles.animationName,
      opacity: styles.opacity,
      transform: styles.transform,
    };
  });
  expect(benefitStyles).toEqual({ animationName: "none", opacity: "1", transform: "none" });
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
