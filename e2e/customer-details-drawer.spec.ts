import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { customerRow, openCustomerDetails } from "./support/customer-rows";
import { signInAsAdmin } from "./support/demo-harness";

const MARA = { name: "Mara Velasquez", email: "mara@example.test" };

function rowTrigger(page: Page, { email, name }: typeof MARA) {
  return customerRow(page, email).getByRole("button", { name });
}

test("clicking anywhere on a user row opens that user's details", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByText("More actions")).toHaveCount(0);

  for (const user of [MARA, { name: "Claimed profile", email: "owner@example.test" }]) {
    const row = customerRow(page, user.email);
    const box = await row.boundingBox();
    await row.click({ position: { x: box!.width - 24, y: box!.height / 2 } });
    const details = page.getByRole("dialog", { name: user.name });
    await expect(details).toBeVisible();
    await expect(details).toContainText(user.email);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
  }
});

test("user row opens with Enter or Space and the dialog is named and keeps focus", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const trigger = rowTrigger(page, MARA);
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(
    customerRow(page, MARA.email).locator("a, button, input, select, textarea"),
  ).toHaveCount(1);

  await trigger.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("dialog", { name: MARA.name });
  await expect(details).toBeVisible();
  await expect(details).toHaveAttribute("aria-modal", "true");
  await expect(details).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(details.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(details.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    await expect(details.locator(":focus")).toHaveCount(1);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();

  await page.keyboard.press("Space");
  await expect(details).toBeVisible();
});

test("details dismiss with Escape, the close button and the backdrop", async ({ page }) => {
  await signInAsAdmin(page);
  const trigger = rowTrigger(page, MARA);
  const details = page.getByRole("dialog", { name: MARA.name });

  await trigger.click();
  await expect(details).toBeVisible();
  await details.getByRole("heading", { name: MARA.name }).click();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(details).toBeVisible();
  const box = await details.boundingBox();
  await page.mouse.move(box!.x + 40, box!.y + 40);
  await page.mouse.down();
  await page.mouse.move(20, 300);
  await page.mouse.up();
  await expect(details).toBeVisible();

  await page.mouse.click(40, 300);
  await expect(details).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("View profile and View cards navigate and leave no dialog behind", async ({ page }) => {
  await signInAsAdmin(page);

  for (const [link, path] of [
    ["View profile", /\/admin\/profiles$/],
    ["View cards", /\/admin\/cards$/],
  ] as const) {
    const details = await openCustomerDetails(page, MARA.email);
    await details.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(path);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/customers$/);
    await expect(page.getByRole("list", { name: "Customer accounts" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

test("a drawer action hands over to the confirm dialog and focus returns to the row", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const details = await openCustomerDetails(page, MARA.email);
  await details.getByRole("button", { name: "Grant owner access" }).click();

  const confirm = page.getByRole("dialog", { name: "Grant owner access?" });
  await expect(confirm).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rowTrigger(page, MARA)).toBeFocused();
});

test("user rows stay compact at phone width and details fill the screen", async ({ page }) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/customers");

  const row = customerRow(page, MARA.email);
  await expect(row).toBeVisible();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await expect(row.getByText("Cards:")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const details = await openCustomerDetails(page, MARA.email);
  const box = await details.boundingBox();
  expect(box?.width).toBe(390);
  await expect(details.getByRole("link", { name: "View profile" })).toBeVisible();
  await details.getByRole("button", { name: "Close", exact: true }).click();
  await expect(details).toBeHidden();
  await expect(rowTrigger(page, MARA)).toBeFocused();
});
