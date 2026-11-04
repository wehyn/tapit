import { expect, test } from "@playwright/test";
import { customerRow, customerRows, openCustomerDetails } from "./support/customer-rows";
import { signInAsAdmin } from "./support/demo-harness";

test("admin manages prepared and active customers in one list", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);

  const search = page.getByRole("searchbox", { name: "Search customers" });
  await expect(search).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(customerRow(page, "mara@example.test")).toContainText("Active");
  await expect(page.getByText("More actions")).toHaveCount(0);
  const existingActive = await openCustomerDetails(page, "mara@example.test");
  await expect(existingActive.getByRole("link", { name: "View profile" })).toBeVisible();
  await expect(existingActive.getByRole("link", { name: "View cards" })).toBeVisible();
  await expect(existingActive.getByRole("link", { name: "Open setup link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(existingActive).toBeHidden();
  await page.getByRole("button", { name: "Set up for someone" }).click();
  await page.getByLabel("Display name").fill("Kai Rivera");
  await page.getByLabel("Role or bio").fill("  Independent designer  ");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Email").fill("kai.contact@example.test");
  await page.getByLabel("Phone").fill("+15550100142");
  await page.getByLabel("Website").fill("https://kai-rivera.example");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Other", exact: true }).click();
  await page.getByLabel("Label").fill("  Portfolio  ");
  await page.getByLabel("URL").fill("https://example.test/kai");
  await page.getByRole("button", { name: "Continue to preview" }).click();
  const profilePreview = page.getByTestId("profile-preview-frame");
  await expect(profilePreview.getByRole("heading", { name: "Kai Rivera" })).toBeVisible();
  await expect(profilePreview.getByText("Independent designer", { exact: true })).toBeVisible();
  const emailAction = profilePreview.getByRole("link", { name: "Email", exact: true });
  await expect(emailAction).toBeVisible();
  await expect(emailAction).toHaveAttribute("href", "mailto:kai.contact@example.test");
  await expect(profilePreview.getByRole("link", { name: "Phone", exact: true })).toHaveAttribute(
    "href",
    "tel:+15550100142",
  );
  await expect(profilePreview.getByRole("link", { name: "Website", exact: true })).toHaveAttribute(
    "href",
    "https://kai-rivera.example",
  );
  await expect(profilePreview.getByText("tapit.app/kai-rivera", { exact: true })).toBeVisible();
  await expect(profilePreview.getByRole("region", { name: "Profile hero" })).toBeVisible();
  const brandLink = profilePreview.getByRole("link", { name: "Made with Tapit", exact: true });
  await expect(brandLink).toHaveAttribute("target", "_blank");
  const brandTabPromise = page.waitForEvent("popup");
  await brandLink.click();
  const brandTab = await brandTabPromise;
  await expect(brandTab).toHaveURL(/\/$/);
  await brandTab.close();
  await expect(page.getByRole("heading", { name: "Preview before you create" })).toBeVisible();
  await expect(profilePreview.getByRole("heading", { name: "Kai Rivera" })).toBeVisible();
  const previewLinks = profilePreview
    .getByRole("list", { name: "Profile links" })
    .getByRole("link");
  await expect(previewLinks).toHaveCount(1);
  await expect(previewLinks).toHaveText("Portfolio");
  await expect(previewLinks).toHaveAttribute("href", "https://example.test/kai");
  await expect(page.getByText("Not published", { exact: true })).toBeVisible();
  const hasImageBackground = await profilePreview.evaluate((frame) =>
    Array.from(frame.querySelectorAll<HTMLElement>("*")).some((element) =>
      getComputedStyle(element).backgroundImage.includes("url("),
    ),
  );
  expect(await profilePreview.locator("img").count()).toBe(0);
  expect(hasImageBackground).toBe(false);
  const createAccount = page.getByRole("button", { name: "Create account" });
  await expect(createAccount).toBeEnabled();
  const backButton = page.getByRole("button", { name: "Back", exact: true });
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(profilePreview).toBeVisible();
    await backButton.scrollIntoViewIfNeeded();
    await expect(backButton).toBeVisible();
    await createAccount.scrollIntoViewIfNeeded();
    await expect(createAccount).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await profilePreview.getByTestId("profile-preview-device").evaluate((screen) => {
    screen.scrollTop = 0;
  });
  await page.screenshot({
    path: "test-results/prepared-profile-preview.png",
    fullPage: true,
    style: "nextjs-portal { display: none !important; }",
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Account prepared" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();

  const kai = customerRows(page, "Kai Rivera");
  await expect(kai).toHaveCount(1);
  await expect(kai).toContainText("Waiting for user");
  await expect(kai).not.toContainText("Setup: Complete");
  const summary = await kai.innerText();
  const match = summary.match(/tapit\.com\/([a-z0-9-]+)/);
  expect(match?.[1]).toBeTruthy();
  await search.fill("Kai Rivera");
  await expect(customerRows(page, "Kai Rivera")).toHaveCount(1);
  await search.fill(match![1]!);
  await expect(customerRows(page, "Kai Rivera")).toHaveCount(1);
  await search.fill("");
  await page.getByRole("button", { name: "Waiting", exact: true }).click();
  await expect(customerRows(page, "Kai Rivera")).toHaveCount(1);
  await expect(customerRows(page, "mara@example.test")).toHaveCount(0);
  const kaiEdit = await openCustomerDetails(page, "Kai Rivera");
  await expect(kaiEdit).toContainText("Link expires in");
  await kaiEdit.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit prepared account" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  const kaiRegenerate = await openCustomerDetails(page, "Kai Rivera");
  await kaiRegenerate.getByRole("button", { name: "Regenerate link" }).click();
  await expect(page.getByRole("heading", { name: "New link ready" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();
  const kaiRevoke = await openCustomerDetails(page, "Kai Rivera");
  await kaiRevoke.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke link" }).click();
  await expect(
    page.getByText("Link revoked. The account is kept as an unclaimed draft."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await expect(customerRows(page, "Kai Rivera")).toContainText("Unclaimed draft");
  await expect(customerRows(page, "Kai Rivera")).not.toContainText("Setup: Complete");
  const kaiGenerate = await openCustomerDetails(page, "Kai Rivera");
  await expect(kaiGenerate).toContainText("No active link");
  await kaiGenerate.getByRole("button", { name: "Generate link" }).click();
  await expect(page.getByRole("heading", { name: "Link generated" })).toBeVisible();
  await page.getByRole("button", { name: "Back to customers" }).click();
  await page.getByRole("button", { name: "Waiting", exact: true }).click();
  const kaiRevokeAgain = await openCustomerDetails(page, "Kai Rivera");
  await kaiRevokeAgain.getByRole("button", { name: "Revoke", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke link" }).click();
  await expect(
    page.getByText("Link revoked. The account is kept as an unclaimed draft."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  const kaiDelete = await openCustomerDetails(page, "Kai Rivera");
  await kaiDelete.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByText("Draft deleted.")).toBeVisible();
  await expect(customerRows(page, "Kai Rivera")).toHaveCount(0);

  await page.getByRole("button", { name: "Active", exact: true }).click();
  const mara = customerRow(page, "mara@example.test");
  await search.fill("mara@example.test");
  await expect(customerRows(page, "mara@example.test")).toHaveCount(1);
  await search.fill("");
  await expect(mara).toContainText("customer");
  page.on("dialog", (dialog) => dialog.accept());
  const toDemo = await openCustomerDetails(page, "mara@example.test");
  await toDemo.getByRole("button", { name: "Promote to Demo" }).click();
  await expect(mara).toContainText("Demo");
  const toAdministrator = await openCustomerDetails(page, "mara@example.test");
  await toAdministrator.getByRole("button", { name: "Promote to Administrator" }).click();
  await expect(mara).toContainText("admin");
  const toCustomer = await openCustomerDetails(page, "mara@example.test");
  await toCustomer.getByRole("button", { name: "Demote to customer" }).click();
  await expect(mara).toContainText("customer");
  const toReplace = await openCustomerDetails(page, "mara@example.test");
  await toReplace.getByRole("button", { name: "Replace invitation" }).click();
  await expect(page.getByRole("link", { name: /\/setup\// })).toBeVisible();
  const toRevoke = await openCustomerDetails(page, "mara@example.test");
  await expect(toRevoke.getByRole("link", { name: "Open setup link" })).toBeVisible();
  await toRevoke.getByRole("button", { name: "Revoke invitation" }).click();
  const afterRevoke = await openCustomerDetails(page, "mara@example.test");
  await expect(afterRevoke.getByRole("button", { name: "Revoke invitation" })).toHaveCount(0);
  await page.keyboard.press("Escape");
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
