import { expect, test, type Page } from "@playwright/test";
import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

async function clearDemoSession(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.removeItem("tapit:demo-session:v1"));
  await page.reload();
}

async function paymentQrCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = window.indexedDB.open("tapit-card-order-assets", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("originals", "readonly");
          const assets = transaction.objectStore("originals").getAll();
          assets.onerror = () => reject(assets.error);
          assets.onsuccess = () => {
            resolve(assets.result.filter((asset) => asset.kind === "payment-qr").length);
            database.close();
          };
        };
      }),
  );
}

test("payment QR replacement and removal preserve the order snapshot and text instructions", async ({
  page,
  context,
}) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Launch end date").fill("2027-01-01");
  await page.getByRole("button", { name: "Save date", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("QR test bank");
  await page.getByLabel("Account details", { exact: true }).fill("Account 123456");
  await page.getByLabel("Payment instructions", { exact: true }).fill("Transfer after ordering.");
  await page
    .getByLabel("Payment QR image")
    .setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();
  await expect(page.getByText("QR test bank", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add payment method", exact: true })).toBeVisible();

  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("Text only");
  await page.getByLabel("Account details", { exact: true }).fill("Text account 654321");
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Pay manually after placing your order.");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();

  await clearDemoSession(page);
  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  await page.getByRole("radio", { name: "Use a design link" }).check();
  await page.getByLabel("Front design URL").fill("https://example.test/front.png");
  await page.getByRole("button", { name: "back", exact: true }).click();
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

  await clearDemoSession(page);
  await signInAsAdmin(page);
  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "Card orders" })).toBeVisible();
  await page.goto("/admin/settings");
  const secondAdmin = await context.newPage();
  await secondAdmin.goto("/admin/settings");
  const method = page.getByText("QR test bank", { exact: true }).locator("../..");
  const secondMethod = secondAdmin.getByText("QR test bank", { exact: true }).locator("../..");
  await Promise.all([
    method.getByRole("button", { name: "Edit" }).click(),
    secondMethod.getByRole("button", { name: "Edit" }).click(),
  ]);
  await Promise.all([
    page
      .getByLabel("Payment QR image")
      .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png"),
    secondAdmin
      .getByLabel("Payment QR image")
      .setInputFiles("tests/fixtures/profile-images/transparent-logo.png"),
  ]);
  await Promise.all([
    page.getByRole("button", { name: "Save payment method", exact: true }).click(),
    secondAdmin.getByRole("button", { name: "Save payment method", exact: true }).click(),
  ]);
  await expect(page.getByText("Payment method updated.")).toBeVisible();
  await expect(secondAdmin.getByText("Payment method updated.")).toBeVisible();
  await secondAdmin.close();
  expect(await paymentQrCount(page)).toBe(2);
  await page
    .getByText("QR test bank", { exact: true })
    .locator("../..")
    .getByRole("button", { name: "Edit" })
    .click();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: /payment QR/i })
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);

  await clearDemoSession(page);
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

  await clearDemoSession(page);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  const replacementMethod = page.getByText("QR test bank", { exact: true }).locator("../..");
  await replacementMethod.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove payment QR" }).click();
  await expect(page.getByRole("img", { name: /payment QR/i })).toHaveCount(0);
  await expect(page.getByText("Account 123456", { exact: true })).toBeVisible();
  await expect(page.getByText("Transfer after ordering.", { exact: true })).toBeVisible();

  await clearDemoSession(page);
  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  const retainedOrderSection = page.getByRole("region", { name: "Your recent card orders" });
  const retainedOrderImage = retainedOrderSection.getByRole("img", { name: /payment QR/i });
  await expect(retainedOrderImage).toHaveCount(1);
  await expect(retainedOrderImage).toBeVisible();
  await expect
    .poll(() => retainedOrderImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(128);

  await page.goto("/app/account");
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await clearDemoSession(page);
  await signInAsAdmin(page);
  await page.goto("/admin/customers");
  const customer = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await customer.getByRole("button", { name: "Approve deletion" }).click();
  const approvalDialog = page.getByRole("dialog", { name: "Approve account deletion?" });
  await approvalDialog.getByRole("button", { name: "Approve deletion" }).click();
  await expect(
    page.getByText("Deletion approved. The account is closed", { exact: false }),
  ).toBeVisible();
  expect(await paymentQrCount(page)).toBe(0);
});
