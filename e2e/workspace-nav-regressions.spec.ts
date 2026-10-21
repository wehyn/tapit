import { expect, test } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

test("mobile More stays open and explains when a draft save blocks navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Draft that could not be saved.");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tapit:demo-state:v1") {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await sheet.getByRole("link", { name: "Card", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Your draft could not be saved. You are still on this page.",
  );
  await expect(page.getByLabel("Bio or role")).toHaveValue("Draft that could not be saved.");
});

test("mobile More closes at desktop width and releases keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const more = page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true });
  const sheetId = await more.getAttribute("aria-controls");
  expect(sheetId).not.toBeNull();
  const sheet = page.locator(`[id="${sheetId}"]`);
  await more.click();
  await sheet.getByRole("button", { name: "Sign out", exact: true }).focus();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.soft(sheet).toHaveCount(0);

  const sidebar = page.getByTestId("workspace-sidebar");
  await sidebar.getByRole("link", { name: "Profile", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(sidebar.getByRole("link", { name: "Links", exact: true })).toBeFocused();
});
