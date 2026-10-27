import { expect, test } from "@playwright/test";
import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

test("payment QR replacement and removal preserve the order snapshot and text instructions", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("QR test bank");
  await page.getByLabel("Account details", { exact: true }).fill("Account 123456");
  await page.getByLabel("Payment instructions", { exact: true }).fill("Transfer after ordering.");
  await page
    .getByLabel("Payment method QR image")
    .setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();
  await expect(page.getByText("QR test bank", { exact: true })).toBeVisible();

  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("Text only");
  await page.getByLabel("Account details", { exact: true }).fill("Text account 654321");
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Pay manually after placing your order.");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();

  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  await page.getByRole("radio", { name: "Use a design link" }).check();
  await page.getByLabel("Front design URL").fill("https://example.test/front.png");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("radio", { name: "Use a design link" }).check();
  await page.getByLabel("Back design URL").fill("https://example.test/back.png");
  await page.getByLabel("Delivery name").fill("QR Snapshot Customer");
  await page.getByLabel("Phone number").fill("09170000000");
  await page.getByLabel("Delivery address").fill("1 Test Street");
  await page.getByLabel("Payment method").selectOption({ label: "QR test bank · Bank transfer" });
  const paymentSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "03 · Payment" }) });
  await expect(paymentSection.getByRole("img", { name: /payment QR/i })).toBeVisible();
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.getByText("Your card order has been saved.", { exact: false })).toBeVisible();
  const orderSection = page.getByRole("region", { name: "Your recent card orders" });
  const orderImage = orderSection.getByRole("img", { name: /payment QR/i });
  await expect(orderImage).toHaveCount(1);
  await expect(orderImage).toBeVisible();
  await expect
    .poll(() => orderImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(128);

  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  const method = page.getByText("QR test bank", { exact: true }).locator("../..");
  await method.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Payment method QR image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByRole("button", { name: "Save payment method", exact: true }).click();
  await expect
    .poll(() =>
      method
        .getByRole("img", { name: /payment QR/i })
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(640);

  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  const savedOrderSection = page.getByRole("region", { name: "Your recent card orders" });
  const savedOrderImage = savedOrderSection.getByRole("img", { name: /payment QR/i });
  await expect(savedOrderImage).toHaveCount(1);
  await expect(savedOrderImage).toBeVisible();
  await expect
    .poll(() => savedOrderImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(128);
  await page.getByLabel("Payment method").selectOption({ label: "Text only · Bank transfer" });
  await expect(page.getByText("Text account 654321", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Pay manually after placing your order.", { exact: true }),
  ).toBeVisible();
  await expect(paymentSection.getByRole("img", { name: /payment QR/i })).toHaveCount(0);

  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  const replacementMethod = page.getByText("QR test bank", { exact: true }).locator("../..");
  await replacementMethod.getByRole("button", { name: "Remove payment QR" }).click();
  await expect(replacementMethod.getByRole("img", { name: /payment QR/i })).toHaveCount(0);
  await expect(page.getByText("Account 123456", { exact: true })).toBeVisible();
  await expect(page.getByText("Transfer after ordering.", { exact: true })).toBeVisible();

  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  const retainedOrderSection = page.getByRole("region", { name: "Your recent card orders" });
  const retainedOrderImage = retainedOrderSection.getByRole("img", { name: /payment QR/i });
  await expect(retainedOrderImage).toHaveCount(1);
  await expect(retainedOrderImage).toBeVisible();
  await expect
    .poll(() => retainedOrderImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(128);
});
