import { expect, test } from "@playwright/test";
import { signInAsAdmin } from "./support/demo-harness";

test("administrator manages codes and reviews submitted-order usage without delivery details", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.evaluate(() => {
    const storageKey = "tapit:demo-state:v1";
    const state = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    const now = Date.now();
    state.cardOrderPaymentMethods = [
      {
        id: "usage-test-payment",
        provider: "Bank transfer",
        label: "Usage test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    state.cardOrderReferralCodes = [
      {
        id: "usage-active-code",
        code: "ACTIVE-HISTORY",
        referrerLabel: "Active referrer",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "usage-inactive-code",
        code: "INACTIVE-HISTORY",
        referrerLabel: "Inactive referrer",
        active: false,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const order = (id: string, codeId: string, code: string, paymentStatus: string, fulfillmentStatus: string) => ({
      id,
      customerId: "customer-mara",
      quantity: 1,
      designSource: { kind: "url", url: "https://example.test/front.png" },
      deliveryName: "History Customer",
      deliveryPhone: "09171234567",
      deliveryAddress: "99 Private Delivery Lane",
      cardPriceCentavos: 59900,
      discountCentavos: 5990,
      paymentMethodId: "usage-test-payment",
      paymentSnapshot: {
        provider: "Bank transfer",
        label: "Usage test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
      },
      referralCodeId: codeId,
      referralSnapshot: { code, referrerLabel: code === "ACTIVE-HISTORY" ? "Active referrer" : "Inactive referrer" },
      paymentStatus,
      fulfillmentStatus,
      commissionStatus: paymentStatus === "refunded" ? "void" : "pending",
      commissionCentavos: 5990,
      createdAt: now,
      updatedAt: now,
    });
    state.cardOrders = [
      order("usage-order-unpaid", "usage-active-code", "ACTIVE-HISTORY", "unpaid", "awaiting_payment"),
      order("usage-order-refunded", "usage-inactive-code", "INACTIVE-HISTORY", "refunded", "cancelled"),
    ];
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  });
  await page.reload();

  await page.getByRole("link", { name: "Codes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Referral codes" })).toBeVisible();
  await expect(page.getByText("ACTIVE-HISTORY", { exact: true })).toBeVisible();
  await expect(page.getByText("INACTIVE-HISTORY", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add code", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("  founding-ahron  ");
  await page.getByLabel("Referrer label", { exact: true }).fill(" Ahron ");
  await page.getByRole("button", { name: "Save code", exact: true }).click();
  await expect(page.getByText("FOUNDING-AHRON", { exact: true })).toBeVisible();
  await expect(page.getByText("10% off", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit FOUNDING-AHRON" }).click();
  await page.getByLabel("Referrer label", { exact: true }).fill("Ahron Updated");
  await page.getByRole("button", { name: "Save code", exact: true }).click();
  await expect(page.getByText("Ahron Updated", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add code", exact: true }).click();
  await page.getByLabel("Code", { exact: true }).fill("founding-ahron");
  await page.getByLabel("Referrer label", { exact: true }).fill("Duplicate");
  await page.getByRole("button", { name: "Save code", exact: true }).click();
  await expect(page.getByText("Referral code already exists.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const codeRow = (code: string) =>
    page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: code, exact: true }) });
  const activeRow = codeRow("ACTIVE-HISTORY");
  await expect(activeRow).toHaveCount(1);
  await activeRow.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(activeRow.getByText("Inactive", { exact: true })).toBeVisible();
  await activeRow.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(activeRow.getByText("Active", { exact: true })).toBeVisible();

  for (const code of ["ACTIVE-HISTORY", "INACTIVE-HISTORY"]) {
    const row = codeRow(code);
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: `View usage for ${code}`, exact: true }).click();
    const usage = page.getByRole("dialog", { name: `${code} usage` });
    await expect(usage.getByText("History Customer", { exact: true })).toBeVisible();
    await expect(usage.getByText(/usage-order-(unpaid|refunded)/)).toBeVisible();
    await expect(usage.getByText("99 Private Delivery Lane", { exact: true })).toHaveCount(0);
    await expect(usage.getByText("09171234567", { exact: true })).toHaveCount(0);
    await usage.getByRole("button", { name: "Close", exact: true }).click();
  }
});
