import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support/demo-harness";

test("admin manages prepared and active customers in one list", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  const search = page.getByRole("searchbox", { name: "Search customers" });
  await expect(search).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  const existingActive = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await expect(existingActive).toContainText("Active");
  await expect(existingActive.getByRole("link", { name: "View profile" })).toBeVisible();
  await expect(existingActive.getByRole("link", { name: "View cards" })).toBeVisible();
  await expect(existingActive.getByRole("link", { name: "Open setup link" })).toBeVisible();
  await page.getByRole("button", { name: "Set up for someone" }).click();
  await page.getByLabel("Display name").fill("Kai Rivera");
  await page.getByLabel("Role or bio").fill("Independent designer");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill("kai.contact@example.test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue to preview" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Account prepared" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();

  const kai = page.locator("article").filter({ hasText: "Kai Rivera" });
  await expect(kai).toHaveCount(1);
  await expect(kai).toContainText("Waiting for user");
  await expect(kai).not.toContainText("Setup: Complete");
  const summary = await kai.innerText();
  const match = summary.match(/tapit\.com\/([a-z0-9-]+)/);
  expect(match?.[1]).toBeTruthy();
  await search.fill("Kai Rivera");
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).toHaveCount(1);
  await search.fill(match![1]!);
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).toHaveCount(1);
  await search.fill("");
  await page.getByRole("button", { name: "Waiting" }).click();
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).toHaveCount(1);
  await expect(page.locator("article").filter({ hasText: "mara@example.test" })).toHaveCount(0);
  await kai.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit prepared account" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await kai.getByRole("button", { name: "Regenerate link" }).click();
  await expect(page.getByRole("heading", { name: "New link ready" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();
  await kai.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke link" }).click();
  await expect(
    page.getByText("Link revoked. The account is kept as an unclaimed draft."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drafts" }).click();
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).toContainText(
    "Unclaimed draft",
  );
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).not.toContainText(
    "Setup: Complete",
  );
  await page
    .locator("article")
    .filter({ hasText: "Kai Rivera" })
    .getByRole("button", { name: "Generate link" })
    .click();
  await expect(page.getByRole("heading", { name: "Link generated" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();
  await page.getByRole("button", { name: "Waiting" }).click();
  await page
    .locator("article")
    .filter({ hasText: "Kai Rivera" })
    .getByRole("button", { name: "Revoke" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke link" }).click();
  await expect(
    page.getByText("Link revoked. The account is kept as an unclaimed draft."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drafts" }).click();
  await page
    .locator("article")
    .filter({ hasText: "Kai Rivera" })
    .getByRole("button", { name: "Delete draft" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByText("Draft deleted.")).toBeVisible();
  await expect(page.locator("article").filter({ hasText: "Kai Rivera" })).toHaveCount(0);

  await page.getByRole("button", { name: "Active" }).click();
  const mara = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await search.fill("mara@example.test");
  await expect(page.locator("article").filter({ hasText: "mara@example.test" })).toHaveCount(1);
  await search.fill("");
  await expect(mara).toContainText("customer");
  await mara.getByText("More actions").click();
  page.on("dialog", (dialog) => dialog.accept());
  await mara.getByRole("button", { name: "Promote to Demo" }).click();
  await expect(mara).toContainText("Demo");
  await mara.getByRole("button", { name: "Promote to Administrator" }).click();
  await expect(mara).toContainText("admin");
  await mara.getByRole("button", { name: "Demote to customer" }).click();
  await expect(mara).toContainText("customer");
  await mara.getByRole("button", { name: "Replace invitation" }).click();
  await expect(page.getByRole("link", { name: /\/setup\// })).toBeVisible();
  await expect(mara.getByRole("link", { name: "Open setup link" })).toBeVisible();
  await mara.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(mara.getByRole("button", { name: "Revoke invitation" })).toHaveCount(0);
  await page.getByText("Invite an account by email").click();
  await page.getByLabel("Customer email").fill("legacy-invite@example.test");
  await page.getByLabel("Initial profile name").fill("Legacy Invite");
  await page.getByRole("button", { name: "Create and invite" }).click();
  await expect(
    page.getByText(/Customer account created for legacy-invite@example.test/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /\/setup\/demo-/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
