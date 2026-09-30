import { expect, test, type Locator, type Page } from "@playwright/test";

const ORANGE_FOCUS = /#b86500|rgb\(\s*184,\s*101,\s*0|rgba\(\s*184,\s*101,\s*0/i;
const FORM_CONTROLS =
  'input:not([type="hidden"]):not([disabled]):visible, textarea:not([disabled]):visible, select:not([disabled]):visible, button:not([disabled]):visible, summary:visible';

type FocusStyles = {
  colors: string;
  hasVisibleIndicator: boolean;
  isFocusVisible: boolean;
  rootAccent: string;
  rootFocus: string;
};

async function readFocusStyles(surface: Locator): Promise<FocusStyles> {
  return surface.evaluate((element) => {
    const styles = getComputedStyle(element);
    const rootStyles = getComputedStyle(document.documentElement);
    const borderColors = [
      styles.borderTopColor,
      styles.borderRightColor,
      styles.borderBottomColor,
      styles.borderLeftColor,
    ];
    return {
      colors: [
        styles.outlineColor,
        ...borderColors,
        styles.boxShadow,
        styles.getPropertyValue("--tw-ring-color"),
      ].join(" "),
      hasVisibleIndicator:
        styles.boxShadow !== "none" ||
        (styles.outlineStyle !== "none" && styles.outlineWidth !== "0px"),
      isFocusVisible: element.matches(":focus-visible"),
      rootAccent: rootStyles.getPropertyValue("--tapit-accent").trim(),
      rootFocus: rootStyles.getPropertyValue("--tapit-focus").trim(),
    };
  });
}

async function expectNoOrangeFocus(page: Page, route: string) {
  const controls = page.locator("main").locator(FORM_CONTROLS);
  await expect(controls.first(), `${route} should expose form controls`).toBeVisible();
  const controlCount = await controls.count();
  expect(controlCount, `${route} should expose form controls`).toBeGreaterThan(0);
  for (let index = 0; index < (await controls.count()); index += 1) {
    const control = controls.nth(index);
    const description =
      (await control.getAttribute("aria-label")) ??
      (await control.getAttribute("id")) ??
      (await control.evaluate((element) => element.tagName.toLowerCase()));
    await control.focus();
    await expect(control, `${route} ${description}`).toBeFocused();
    const focusStyles = await readFocusStyles(control);
    if (focusStyles.isFocusVisible) {
      expect(focusStyles.hasVisibleIndicator, route + " " + description).toBe(true);
    }
    expect(focusStyles.colors, route + " " + description).not.toMatch(ORANGE_FOCUS);
  }
}

async function expectKeyboardVisibleFocus(page: Page) {
  const signInButton = page.getByRole("button", { name: "Sign in", exact: true });
  for (let count = 0; count < 12; count += 1) {
    await page.keyboard.press("Tab");
    if (await signInButton.evaluate((element) => document.activeElement === element)) break;
  }
  await expect(signInButton).toBeFocused();
  const focusStyles = await readFocusStyles(signInButton);
  expect(focusStyles.isFocusVisible, "keyboard sign-in button").toBe(true);
  expect(focusStyles.rootAccent.toLowerCase(), "Tapit accent token").toBe("#236d54");
  expect(focusStyles.rootFocus.toLowerCase(), "Tapit focus token").toBe(
    focusStyles.rootAccent.toLowerCase(),
  );
  expect(focusStyles.hasVisibleIndicator, "keyboard sign-in button").toBe(true);
  expect(focusStyles.colors, "keyboard sign-in button").not.toMatch(ORANGE_FOCUS);
}

test("form focus indicators stay within the Tapit green theme", async ({ page }) => {
  for (const route of [
    "/login",
    "/login?mode=signup",
    "/setup/demo-setup-token",
    "/c/claimable-card-demo",
  ]) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoOrangeFocus(page, route);
  }

  await page.goto("/login");
  await expect(page.locator("main").first()).toBeVisible();
  await expectKeyboardVisibleFocus(page);
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);

  for (const route of ["/app/profile", "/app/links", "/app/analytics", "/app/account"]) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    await expectNoOrangeFocus(page, route);
  }

  await page.goto("/app/links");
  const redirectToggle = page.getByRole("checkbox", {
    name: "Enable card tap and scan redirect",
  });
  await redirectToggle.focus();
  const redirectToggleSurface = redirectToggle.locator(
    "xpath=following-sibling::span[@aria-hidden='true']",
  );
  const redirectToggleFocus = await readFocusStyles(redirectToggleSurface);
  expect(redirectToggleFocus.hasVisibleIndicator, "redirect toggle").toBe(true);
  expect(redirectToggleFocus.colors, "redirect toggle").not.toMatch(ORANGE_FOCUS);

  const redirectInput = page.getByRole("textbox", { name: "HTTPS destination URL" });
  await redirectInput.focus();
  const redirectInputFocus = await readFocusStyles(redirectInput);
  expect(redirectInputFocus.hasVisibleIndicator, "redirect URL").toBe(true);
  expect(redirectInputFocus.colors, "redirect URL").not.toMatch(ORANGE_FOCUS);

  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);

  for (const route of [
    "/admin/customers",
    "/admin/profiles",
    "/admin/cards",
    "/admin/analytics",
    "/admin/audit-log",
    "/admin/settings",
  ]) {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    if (route === "/admin/cards") {
      await expect(page.locator("summary").first()).toBeVisible();
      await page.locator("summary").first().click();
    }
    await expectNoOrangeFocus(page, route);
  }
});
