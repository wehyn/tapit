import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

async function clearDemoSession(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => window.localStorage.removeItem("tapit:demo-session:v1"));
  await page.reload();
}

async function signInAsOtherCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

async function seedAbandonedReceipt(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("tapit-card-order-receipts", 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("receipts", { keyPath: "receiptKey" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("receipts", "readwrite");
          transaction.objectStore("receipts").add({
            receiptKey: "abandoned-receipt-test-key",
            ownerId: "customer-mara",
            orderId: "missing-order",
            fileName: "abandoned.pdf",
            contentType: "application/pdf",
            byteSize: 3,
            uploadedAt: Date.now(),
            blob: new Blob(["pdf"]),
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = transaction.onabort = () => reject(transaction.error);
        };
      }),
  );
}

async function storedReceiptCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("tapit-card-order-receipts", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("receipts", "readonly");
          const count = transaction.objectStore("receipts").count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function paymentQrCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("tapit-card-order-assets", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("originals", "readonly");
          const all = transaction.objectStore("originals").getAll();
          all.onsuccess = () =>
            resolve(all.result.filter((asset) => asset.kind === "payment-qr").length);
          all.onerror = () => reject(all.error);
          transaction.oncomplete = () => database.close();
        };
      }),
  );
}

async function failNextReceiptObjectStoreDelete(page: Page) {
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const originalDelete = prototype.delete;
    const patchedDelete: typeof prototype.delete = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof prototype.delete>
    ) {
      if (this.transaction.db.name === "tapit-card-order-receipts") {
        prototype.delete = originalDelete;
        const request = originalDelete.apply(this, args);
        this.transaction.abort();
        return request;
      }
      return originalDelete.apply(this, args);
    };
    prototype.delete = patchedDelete;
  });
}

async function failNextReceiptCursorDelete(page: Page) {
  await page.evaluate(() => {
    const prototype = IDBCursor.prototype;
    const originalDelete = prototype.delete;
    const patchedDelete: typeof prototype.delete = function (
      this: IDBCursor,
      ...args: Parameters<typeof prototype.delete>
    ) {
      if (
        this.source instanceof IDBObjectStore &&
        this.source.transaction.db.name === "tapit-card-order-receipts"
      ) {
        prototype.delete = originalDelete;
        const request = originalDelete.apply(this, args);
        const transaction = this.source.transaction;
        queueMicrotask(() => transaction.abort());
        return request;
      }
      return originalDelete.apply(this, args);
    };
    prototype.delete = patchedDelete;
  });
}

async function switchCustomerDuringReceiptWrite(page: Page) {
  await page.evaluate(() => {
    const prototype = IDBObjectStore.prototype;
    const originalAdd = prototype.add;
    const originalDelete = prototype.delete;
    prototype.delete = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof prototype.delete>
    ) {
      const request = originalDelete.apply(this, args);
      if (this.name === "receipts") {
        request.addEventListener(
          "success",
          () => sessionStorage.setItem("receipt-race-cleaned", "true"),
          { once: true },
        );
      }
      return request;
    };
    const patchedAdd: typeof prototype.add = function (
      this: IDBObjectStore,
      ...args: Parameters<typeof prototype.add>
    ) {
      const request = originalAdd.apply(this, args);
      if (this.name === "receipts") {
        request.addEventListener(
          "success",
          () => {
            localStorage.setItem(
              "tapit:demo-session:v1",
              JSON.stringify({ email: "owner@example.test", role: "customer" }),
            );
            prototype.add = originalAdd;
          },
          { once: true },
        );
      }
      return request;
    };
    prototype.add = patchedAdd;
  });
}

test("card order receipts stay private and never mark payment received", async ({ page }) => {
  test.setTimeout(90_000);
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("Launch end date").fill("2099-12-31");
  await page.getByRole("button", { name: "Save date", exact: true }).click();
  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("Receipt test bank");
  await page.getByLabel("Account details", { exact: true }).fill("Account 123456");
  await page
    .getByLabel("Payment instructions", { exact: true })
    .fill("Pay after shipping is quoted.");
  await page
    .getByLabel("Payment QR image")
    .setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();
  await expect(page.getByText("Payment method added.")).toBeVisible();
  await expect.poll(() => paymentQrCount(page)).toBe(1);

  await clearDemoSession(page);
  await signInAsCustomer(page);
  await seedAbandonedReceipt(page);
  await page.goto("/app/card/order-card");
  await expect.poll(() => storedReceiptCount(page)).toBe(0);
  await page.getByRole("radio", { name: "Use a design link" }).check();
  await page.getByLabel("Front design URL").fill("https://example.test/front.png");
  await page.getByRole("button", { name: "back", exact: true }).click();
  await page.getByRole("radio", { name: "Use a design link" }).check();
  await page.getByLabel("Back design URL").fill("https://example.test/back.png");
  await page.getByLabel("Delivery name").fill("Receipt Privacy Customer");
  await page.getByLabel("Phone number").fill("09170000000");
  await page.getByLabel("Delivery address").fill("1 Test Street");
  await page
    .getByLabel("Payment method")
    .selectOption({ label: "Receipt test bank · Bank transfer" });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.getByText("Your card order has been saved.", { exact: false })).toBeVisible();
  expect(
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("tapit:demo-state:v1") ?? "{}");
      return state.cardOrders.some(
        (order: { deliveryName: string; paymentSnapshot?: { qrAssetKey?: string } }) =>
          order.deliveryName === "Receipt Privacy Customer" &&
          Boolean(order.paymentSnapshot?.qrAssetKey),
      );
    }),
  ).toBe(true);

  await clearDemoSession(page);
  await signInAsAdmin(page);
  await page.goto("/admin/orders");
  const matchingOrder = page.locator("article").filter({ hasText: "Receipt Privacy Customer" });
  await expect(matchingOrder).toBeVisible();
  await matchingOrder.getByLabel("Shipping quote (pesos)").fill("125.00");
  await matchingOrder.getByRole("button", { name: "Quote shipping", exact: true }).click();
  await expect(matchingOrder).toContainText(/awaiting payment/i);

  await clearDemoSession(page);
  await signInAsCustomer(page);
  await page.goto("/app/card/order-card");
  const customerOrder = page.getByRole("region", { name: "Your recent card orders" });
  await expect(customerOrder).toContainText("Receipt test bank · Unpaid");
  const receiptInput = customerOrder.locator('input[type="file"]');
  await receiptInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByRole("button", { name: "Upload receipt", exact: true }).click();
  await expect(
    customerOrder.getByText("Receipt attached: opaque-landscape.png", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect.poll(() => storedReceiptCount(page)).toBe(1);
  await expect(
    customerOrder.getByText("Receipt attached: opaque-landscape.png", { exact: true }),
  ).toBeVisible();
  await expect(customerOrder).toContainText("Receipt test bank · Unpaid");
  await receiptInput.setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("no"),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: /file|type|format|receipt/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace receipt", exact: true })).toBeVisible();
  await expect(
    customerOrder.getByText("Receipt attached: opaque-landscape.png", { exact: true }),
  ).toBeVisible();
  await receiptInput.setInputFiles({
    name: "oversized.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024),
  });
  await expect(
    page.getByRole("alert").filter({ hasText: /5\s?MB|5 MiB|too large|under/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace receipt", exact: true })).toBeVisible();
  await expect(
    customerOrder.getByText("Receipt attached: opaque-landscape.png", { exact: true }),
  ).toBeVisible();

  await switchCustomerDuringReceiptWrite(page);
  await receiptInput.setInputFiles({
    name: "replacement-receipt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nreceipt\n%%EOF"),
  });
  await page.getByRole("button", { name: "Replace receipt", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("receipt-race-cleaned")))
    .toBe("true");
  await expect.poll(() => storedReceiptCount(page)).toBe(1);
  await page.evaluate(() =>
    localStorage.setItem(
      "tapit:demo-session:v1",
      JSON.stringify({ email: "mara@example.test", role: "customer" }),
    ),
  );
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Your recent card orders" })
      .getByText("Receipt attached: opaque-landscape.png", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => storedReceiptCount(page)).toBe(1);

  await page
    .getByRole("region", { name: "Your recent card orders" })
    .locator('input[type="file"]')
    .setInputFiles({
      name: "replacement-receipt.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nreceipt\n%%EOF"),
    });
  await failNextReceiptObjectStoreDelete(page);
  await page.getByRole("button", { name: "Replace receipt", exact: true }).click();
  await expect(customerOrder.getByText("Receipt uploaded successfully.")).toBeVisible();
  await expect(customerOrder.getByText(/replacement-receipt\.pdf/)).toBeVisible();
  await expect(customerOrder.getByText(/opaque-landscape\.png/)).toHaveCount(0);
  await expect(customerOrder).toContainText("Receipt test bank · Unpaid");
  await expect.poll(() => storedReceiptCount(page)).toBe(2);
  await page.reload();
  await expect.poll(() => storedReceiptCount(page)).toBe(1);
  await expect(
    page
      .getByRole("region", { name: "Your recent card orders" })
      .getByText(/replacement-receipt\.pdf/),
  ).toBeVisible();

  await clearDemoSession(page);
  await signInAsOtherCustomer(page);
  await page.goto("/app/card/order-card");
  await expect(page.getByText(/replacement-receipt\.pdf/)).toHaveCount(0);
  await expect(page.getByText(/opaque-landscape\.png/)).toHaveCount(0);

  await clearDemoSession(page);
  await signInAsAdmin(page);
  await page.goto("/admin/orders");
  const adminOrder = page.locator("article").filter({ hasText: "Receipt Privacy Customer" });
  await expect(adminOrder).toBeVisible();
  await expect(adminOrder).toContainText("replacement-receipt.pdf");
  const receiptLink = adminOrder.getByRole("link", { name: /replacement-receipt\.pdf/i });
  await expect(receiptLink).toHaveAttribute("href", /.+/);
  const downloadPromise = page.waitForEvent("download");
  await receiptLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("replacement-receipt.pdf");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  expect((await readFile(downloadPath!)).subarray(0, 5).toString()).toBe("%PDF-");
  await expect(adminOrder).toContainText(/Payment: unpaid/i);
  await expect(adminOrder.getByRole("button", { name: "Mark paid", exact: true })).toBeVisible();

  await page.goto("/admin/settings");
  const configuredMethod = page.getByText("Receipt test bank", { exact: true }).locator("../..");
  await configuredMethod.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove payment QR" }).click();
  await expect(page.getByRole("img", { name: /payment QR/i })).toHaveCount(0);
  await clearDemoSession(page);
  await signInAsCustomer(page);
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
  await failNextReceiptCursorDelete(page);
  await approvalDialog.getByRole("button", { name: "Approve deletion" }).click();
  await expect(page.getByText(/Deletion approval could not be completed|aborted/i)).toBeVisible();
  await expect(customer.getByRole("button", { name: "Approve deletion" })).toBeVisible();
  await expect.poll(() => storedReceiptCount(page)).toBe(1);
  await approvalDialog.getByRole("button", { name: "Approve deletion" }).click();
  await expect(
    page.getByText("Deletion approved. The account is closed", { exact: false }),
  ).toBeVisible();
  await expect.poll(() => storedReceiptCount(page)).toBe(0);
  await expect.poll(() => paymentQrCount(page)).toBe(0);
});
