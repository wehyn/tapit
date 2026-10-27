import { expect, test } from "@playwright/test";
import { createDefaultDemoState } from "../src/lib/demo/fixtures";
import { serializeDemoState } from "../src/lib/demo/storage-codec";
import { signInAsAdmin } from "./support/demo-harness";

test("administrator manages referral codes and reviews selected code usage", async ({ page }) => {
  await signInAsAdmin(page);
  const initialState = serializeDemoState(createDefaultDemoState());
  await page.evaluate((serializedState) => {
    const state = JSON.parse(serializedState);
    const now = Date.now();
    state.cardOrderPaymentMethods = [{
      id: "usage-test-payment", provider: "Bank transfer", label: "Usage test bank",
      accountDetails: "Test account", instructions: "Transfer after ordering.", active: true,
      createdAt: now, updatedAt: now,
    }];
    state.cardOrderReferralCodes = [
      { id: "usage-active-code", code: "ACTIVE-HISTORY", referrerLabel: "Active referrer", active: true, createdAt: now, updatedAt: now },
      { id: "usage-inactive-code", code: "INACTIVE-HISTORY", referrerLabel: "Inactive referrer", active: false, createdAt: now, updatedAt: now },
    ];
    const order = (id: string, codeId: string, code: string, paymentStatus: string, fulfillmentStatus: string) => ({
      id, customerId: "customer-mara", quantity: 1,
      designSource: { kind: "url", url: "https://example.test/front.png" },
      deliveryName: "History Customer", deliveryPhone: "09171234567", deliveryAddress: "99 Private Delivery Lane",
      cardPriceCentavos: 59900, discountCentavos: 5990, paymentMethodId: "usage-test-payment",
      paymentSnapshot: { provider: "Bank transfer", label: "Usage test bank", accountDetails: "Test account", instructions: "Transfer after ordering." },
      referralCodeId: codeId, referralSnapshot: { code, referrerLabel: code === "ACTIVE-HISTORY" ? "Active referrer" : "Inactive referrer" },
      paymentStatus, fulfillmentStatus, commissionStatus: paymentStatus === "refunded" ? "void" : "pending",
      commissionCentavos: 5990, createdAt: now, updatedAt: now,
    });
    state.cardOrders = [
      order("usage-order-unpaid", "usage-active-code", "ACTIVE-HISTORY", "unpaid", "awaiting_payment"),
      order("usage-order-refunded", "usage-inactive-code", "INACTIVE-HISTORY", "refunded", "cancelled"),
    ];
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  }, initialState);
  await page.reload();

  await page.getByRole("link", { name: "Codes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Referral codes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^ACTIVE-HISTORY/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^INACTIVE-HISTORY/ })).toBeVisible();

  await page.getByLabel("Referral code").fill("  founding-ahron  ");
  await page.getByLabel("Referrer label").fill(" Ahron ");
  await page.getByRole("button", { name: "Create code" }).click();
  const created = page.getByRole("button", { name: /FOUNDING-AHRON.*10% off/ });
  await expect(created).toBeVisible();
  await created.locator("..").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Referrer label").fill("Ahron Updated");
  await page.getByRole("button", { name: "Save code" }).click();
  await expect(page.getByRole("button", { name: /FOUNDING-AHRON.*Ahron Updated/ })).toBeVisible();

  await page.getByLabel("Referral code").fill("ONE-TEN");
  await page.getByLabel("Referrer label").fill("Centavo test");
  await page.getByLabel("Fixed card price (₱, optional)").fill("1.10");
  await page.getByRole("button", { name: "Create code" }).click();
  const oneTen = page.getByRole("button", { name: /ONE-TEN.*₱1\.10/ });
  await expect(oneTen).toBeVisible();
  await oneTen.locator("..").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Editing cancelled.", { exact: true })).toBeVisible();

  await page.getByLabel("Referral code").fill("founding-ahron");
  await page.getByLabel("Referrer label").fill("Duplicate");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText("Referral code already exists.", { exact: true })).toBeVisible();

  const active = page.getByRole("button", { name: /^ACTIVE-HISTORY/ });
  const activeEntry = active.locator("..");
  await activeEntry.getByRole("button", { name: "Deactivate" }).click();
  await expect(active).toContainText("Inactive");
  await activeEntry.getByRole("button", { name: "Activate" }).click();
  await expect(active).toContainText("Active");

  await active.click();
  const activeUsage = page.getByRole("row", { name: /usage-order-unpaid/ });
  await expect(activeUsage).toBeVisible();
  await active.click();
  await expect(activeUsage).toBeVisible();
  await activeEntry.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Referrer label").fill("Active referrer updated");
  await page.getByRole("button", { name: "Save code" }).click();
  await expect(activeUsage).toBeVisible();
  await expect(page.getByRole("row", { name: /usage-order-refunded/ })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("99 Private Delivery Lane");
  await expect(page.getByRole("main")).not.toContainText("09171234567");

  await page.getByRole("button", { name: /^INACTIVE-HISTORY/ }).click();
  await expect(page.getByRole("row", { name: /usage-order-refunded/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /usage-order-unpaid/ })).toHaveCount(0);
});
