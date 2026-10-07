import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("public homepage has no automated accessibility violations", async ({ page }) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("main h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width < 1024) {
      await page.getByRole("button", { name: "Open menu" }).click();
    }
    await expect(
      page.getByRole("navigation", {
        name: width < 1024 ? "Mobile navigation" : "Primary navigation",
      }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  }
});

test("public profile has no automated accessibility violations", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
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
  await page.goto("/app/customize");
  await page.getByRole("radio", { name: "Warm Studio", exact: true }).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.goto("/app/profile");
  await page.getByRole("radio", { name: "About", exact: true }).check();
  await page.getByLabel("About copy").fill("Keyboard-friendly studio details.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Add link" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expectNoA11yViolations(page);

  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
    const publicUrlText = page
      .getByRole("link", { name: "Open public profile /mara-velasquez" })
      .locator("code");
    const publicUrlLayout = await publicUrlText.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(
      publicUrlLayout.scrollWidth,
      `The public profile URL should remain readable at ${width}px.`,
    ).toBeLessThanOrEqual(publicUrlLayout.clientWidth + 1);
    const layout = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: element.className,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
          };
        })
        .filter((element) => element.right > viewportWidth + 1 || element.left < -1)
        .sort((left, right) => right.right - left.right)
        .slice(0, 12);
      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        offenders,
      };
    });
    expect(layout.documentWidth, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(width);
    if (width < 1024) {
      const opener = page.getByRole("button", { name: "Open navigation" });
      await opener.click();
      await expect(
        page.getByRole("navigation", { name: "Your Tapit profile navigation" }),
      ).toBeVisible();
      await expectNoA11yViolations(page);
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
    }
    await expectNoA11yViolations(page);
  }
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

  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/customers");
    await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width < 1024) {
      const opener = page.getByRole("button", { name: "Open navigation" });
      await opener.click();
      await expect(
        page.getByRole("navigation", { name: "Tapit operations navigation" }),
      ).toBeVisible();
      await expectNoA11yViolations(page);
      await page.keyboard.press("Escape");
      await expect(opener).toBeFocused();
    }
    await expectNoA11yViolations(page);
  }
});

test("customer and administrator workspace index routes keep their redirect targets", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/customers$/);
  await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
});
