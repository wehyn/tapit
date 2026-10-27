import { expect, test } from "@playwright/test";
import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

test("payment QR replacement and removal preserve the order snapshot and text instructions", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("QR test bank");
  await page.getByLabel("Account details", { exact: true }).fill("Account 123456");
  await page.getByLabel("Payment instructions", { exact: true }).fill("Transfer after ordering.");
  await page.getByLabel("Payment method QR image").setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();
  await expect(page.getByText("QR test bank", { exact: true })).toBeVisible();

  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  await page.getByLabel("Front design URL").fill("https://example.test/front.png");
  await page.getByLabel("Back design URL").fill("https://example.test/back.png");
  await page.getByLabel("Delivery name").fill("QR Snapshot Customer");
  await page.getByLabel("Phone number").fill("09170000000");
  await page.getByLabel("Delivery address").fill("1 Test Street");
  await page.getByLabel("Payment method").selectOption({ label: "QR test bank · Bank transfer" });
  await expect(page.getByRole("img", { name: /payment QR/i })).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Order (placed|submitted)/i })).toBeVisible();
  const orderImage = page.getByRole("img", { name: /payment QR/i });
  await expect(orderImage).toBeVisible();
  const originalSource = await orderImage.getAttribute("src");

  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  const method = page.getByText("QR test bank", { exact: true }).locator("..");
  await method.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Payment method QR image").setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByRole("button", { name: "Save payment method", exact: true }).click();
  await expect(page.getByText("QR test bank", { exact: true })).toBeVisible();
  await method.getByRole("button", { name: "Remove payment QR" }).click();
  await expect(page.getByText("Account 123456", { exact: true })).toBeVisible();
  await expect(page.getByText("Transfer after ordering.", { exact: true })).toBeVisible();

  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  await expect(page.getByRole("img", { name: /payment QR/i })).toHaveAttribute("src", originalSource!);
});
