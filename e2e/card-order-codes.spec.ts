import { expect, test } from "@playwright/test";
import { createDefaultDemoState } from "../src/lib/demo/fixtures";
import { serializeDemoState } from "../src/lib/demo/storage-codec";
import { signInAsAdmin } from "./support/demo-harness";

test("administrator manages offers, exact aliases, and safe code usage history", async ({
  page,
}, testInfo) => {
  await signInAsAdmin(page);
  const initialState = serializeDemoState(createDefaultDemoState());
  await page.evaluate((serializedState) => {
    const state = JSON.parse(serializedState);
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
    state.cardOrderOffers = [
      {
        id: "offer-founding-test",
        code: "FOUNDING",
        scope: "demo",
        fixedPriceCentavos: 29900,
        usageCount: 5,
        usageLimit: 25,
        createdAt: now,
        updatedAt: now,
      },
    ];
    state.cardOrderReferralCodes = [
      {
        id: "alias-founding",
        code: "FOUNDING",
        offerId: "offer-founding-test",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "alias-founding-ahron",
        code: "FOUNDING-AHRON",
        offerId: "offer-founding-test",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const order = (id: string, codeId: string, code: string, paymentStatus: string) => ({
      id,
      customerId: "customer-mara",
      quantity: 1,
      designSource: { kind: "url", url: "https://example.test/front.png" },
      deliveryName: "History Customer",
      deliveryPhone: "09171234567",
      deliveryAddress: "99 Private Delivery Lane",
      cardPriceCentavos: 29900,
      discountCentavos: 0,
      paymentMethodId: "usage-test-payment",
      paymentSnapshot: {
        provider: "Bank transfer",
        label: "Usage test bank",
        accountDetails: "Test account",
        instructions: "Transfer after ordering.",
      },
      referralCodeId: codeId,
      offerId: "offer-founding-test",
      referralSnapshot: { code, referrerLabel: code === "FOUNDING" ? "" : "Ahron" },
      paymentStatus,
      fulfillmentStatus: paymentStatus === "refunded" ? "cancelled" : "awaiting_payment",
      commissionStatus: paymentStatus === "refunded" ? "void" : "pending",
      commissionCentavos: 0,
      createdAt: now,
      updatedAt: now,
    });
    state.cardOrders = [
      order("usage-order-unpaid", "alias-founding", "FOUNDING", "unpaid"),
      order("usage-order-refunded", "alias-founding-ahron", "FOUNDING-AHRON", "refunded"),
    ];
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  }, initialState);
  await page.reload();

  await page.getByRole("link", { name: "Codes", exact: true }).click();
  await expect(
    page.getByText("Manage codes and review their order usage.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Referral codes" })).toHaveCount(0);
  await expect(
    page.getByText(
      "Codes are unique across active and inactive records. Fixed prices must be no more than ₱599.",
    ),
  ).toHaveCount(0);
  const foundingOffer = page
    .getByRole("heading", { name: "FOUNDING", exact: true })
    .locator("..")
    .locator("..");
  await expect(foundingOffer).toContainText("₱299.00");
  await expect(foundingOffer).toContainText("5 of 25 uses · 20 remaining");
  await expect(foundingOffer).toContainText("Codes: FOUNDING, FOUNDING-AHRON");
  await expect(
    page.getByRole("button", { name: /^FOUNDING→ FOUNDING · Offer only · Active$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^FOUNDING-AHRON→ FOUNDING · Ahron · Active$/ }),
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("codes-offers.png"), fullPage: true });
  await testInfo.attach("codes-offers", {
    path: testInfo.outputPath("codes-offers.png"),
    contentType: "image/png",
  });

  await page.getByLabel("Offer code").fill("launch");
  await page.getByLabel("Fixed card price (₱)").fill("599");
  await page.getByLabel("Usage limit (orders, optional)").fill("10");
  await page.getByRole("button", { name: "Save offer" }).click();
  const launchOffer = page
    .getByRole("heading", { name: "LAUNCH", exact: true })
    .locator("..")
    .locator("..");
  await expect(launchOffer).toContainText("₱599.00");
  await expect(launchOffer).toContainText("0 of 10 uses · 10 remaining");
  await expect(launchOffer).toContainText("Codes: None");

  await page.getByLabel("Referral code").fill("LAUNCH-AHRON");
  await page.getByLabel("Offer (optional)").selectOption({ label: "LAUNCH" });
  await page.getByLabel("Referrer key (optional)").fill("AHRON");
  await page.getByLabel("Referrer label (optional)").fill("Ahron");
  await page.getByRole("button", { name: "Create code" }).click();
  const launchAlias = page.getByRole("button", {
    name: /^LAUNCH-AHRON→ LAUNCH · Ahron · Active$/,
  });
  await expect(launchAlias).toBeVisible();
  await expect(launchOffer).toContainText("Codes: LAUNCH-AHRON");

  await launchAlias.locator("..").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Referrer label (optional)").fill("Ahron Launch");
  await page.getByRole("button", { name: "Save code" }).click();
  await expect(
    page.getByRole("button", { name: /^LAUNCH-AHRON→ LAUNCH · Ahron Launch · Active$/ }),
  ).toBeVisible();
  await expect(launchOffer).toContainText("Codes: LAUNCH-AHRON");

  await page
    .getByRole("button", { name: /^LAUNCH-AHRON→ LAUNCH · Ahron Launch · Active$/ })
    .locator("..")
    .getByRole("button", { name: "Edit" })
    .click();
  await page.getByLabel("Offer (optional)").selectOption("");
  await page.getByRole("button", { name: "Save code" }).click();
  await expect(
    page.getByRole("button", { name: /^LAUNCH-AHRONAhron Launch · Active$/ }),
  ).toBeVisible();
  await expect(launchOffer).toContainText("Codes: None");

  const foundingAlias = page.getByRole("button", {
    name: /^FOUNDING-AHRON→ FOUNDING · Ahron · Active$/,
  });
  await foundingAlias.click();
  const refundedUsage = page.getByRole("row", { name: /usage-order-refunded/ });
  await expect(refundedUsage).toBeVisible();
  await expect(page.getByRole("row", { name: /usage-order-unpaid/ })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("99 Private Delivery Lane");
  await expect(page.getByRole("main")).not.toContainText("09171234567");
  await expect(
    page.getByText("Order identifiers and status only; delivery details are not shown.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^FOUNDING→ FOUNDING · Offer only · Active$/ }).click();
  const unpaidUsage = page.getByRole("row", { name: /usage-order-unpaid/ });
  await expect(unpaidUsage).toBeVisible();
  await unpaidUsage.getByRole("link", { name: "usage-order-unpaid" }).click();
  await expect(page).toHaveURL(/\/admin\/orders\?orderId=usage-order-unpaid$/);
  await expect(page.getByRole("heading", { name: "Order usage-order-unpaid" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("FOUNDING");
  await expect(page.getByRole("main")).not.toContainText("Offer only");
  await expect(page.getByRole("button", { name: "Load older orders" })).toHaveCount(0);
  await page.getByRole("link", { name: "Codes", exact: true }).click();
  await page.getByRole("button", { name: /^FOUNDING→ FOUNDING · Offer only · Active$/ }).click();
  await expect(unpaidUsage).toBeVisible();
  await expect(page.getByRole("row", { name: /usage-order-refunded/ })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("99 Private Delivery Lane");
  await expect(page.getByRole("main")).not.toContainText("09171234567");
});

test("customers share an offer cap across exact aliases and keep launch offers independent", async ({
  page,
}, testInfo) => {
  await signInAsAdmin(page);
  const initialState = serializeDemoState(createDefaultDemoState());
  await page.evaluate((serializedState) => {
    const state = JSON.parse(serializedState);
    const now = Date.now();
    state.cardOrderOffers = [
      {
        id: "offer-founding-checkout",
        code: "FOUNDING",
        scope: "demo",
        fixedPriceCentavos: 29900,
        usageCount: 0,
        usageLimit: 25,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "offer-launch-checkout",
        code: "LAUNCH",
        scope: "demo",
        fixedPriceCentavos: 59900,
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];
    state.cardOrderReferralCodes = [
      {
        id: "alias-founding-checkout",
        code: "FOUNDING",
        offerId: "offer-founding-checkout",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "alias-founding-ahron-checkout",
        code: "FOUNDING-AHRON",
        offerId: "offer-founding-checkout",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "alias-launch-checkout",
        code: "LAUNCH",
        offerId: "offer-launch-checkout",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "alias-launch-ahron-checkout",
        code: "LAUNCH-AHRON",
        offerId: "offer-launch-checkout",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "referrer-ahron-checkout",
        code: "AHRON",
        referrerCode: "AHRON",
        referrerLabel: "Ahron",
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    state.cardOrders = Array.from({ length: 24 }, (_, index) => ({
      id: `prior-founding-${index + 1}`,
      customerId: "customer-history-only",
      quantity: 1,
      designSource: { kind: "url", url: "https://example.test/front.png" },
      deliveryName: "Fictional Prior Customer",
      deliveryPhone: "09170000000",
      deliveryAddress: "1 Demo Lane",
      cardPriceCentavos: 29900,
      discountCentavos: 2990,
      paymentMethodId: "checkout-test-payment",
      paymentSnapshot: {
        provider: "Bank transfer",
        label: "Checkout test bank",
        accountDetails: "Demo account",
        instructions: "Transfer after ordering.",
      },
      referralCodeId: "referrer-ahron-checkout",
      referralSnapshot: {
        code: "AHRON",
        referrerLabel: "Ahron",
      },
      offerId: "offer-founding-checkout",
      offerSnapshot: { code: "FOUNDING", fixedPriceCentavos: 29900 },
      paymentStatus: "unpaid",
      fulfillmentStatus: "awaiting_payment",
      commissionStatus: "pending",
      commissionCentavos: 0,
      createdAt: now - (24 - index) * 1000,
      updatedAt: now,
    }));
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  }, initialState);
  await page.reload();
  await page.goto("/admin/settings");
  await page.getByLabel("Provider", { exact: true }).fill("Bank transfer");
  await page.getByLabel("Method label", { exact: true }).fill("Checkout test bank");
  await page.getByLabel("Account details", { exact: true }).fill("Demo account");
  await page.getByLabel("Payment instructions", { exact: true }).fill("Transfer after ordering.");
  await page.getByRole("button", { name: "Add payment method", exact: true }).click();

  const fillCheckout = async (email: string, promoCode: string, referralCode?: string) => {
    await page.goto("/login");
    await page.evaluate(() => window.localStorage.removeItem("tapit:demo-session:v1"));
    await page.reload();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.goto("/app/card/order-card");
    await page.getByRole("radio", { name: "Use a design link" }).check();
    await page.getByLabel("Front design URL").fill("https://example.test/front.png");
    await page.getByRole("button", { name: "back", exact: true }).click();
    await page.getByRole("radio", { name: "Use a design link" }).check();
    await page.getByLabel("Back design URL").fill("https://example.test/back.png");
    await page.getByLabel("Delivery name").fill("Checkout Demo Customer");
    await page.getByLabel("Phone number").fill("09170000001");
    await page.getByLabel("Delivery address").fill("2 Demo Lane");
    await page
      .getByLabel("Payment method")
      .selectOption({ label: "Checkout test bank · Bank transfer" });
    await page.getByLabel("Promo code (optional)").fill(promoCode);
    if (referralCode) {
      await page.getByRole("switch", { name: "Have a referral code?" }).click();
      await page.getByRole("textbox", { name: "Referral code", exact: true }).fill(referralCode);
    }
  };

  await fillCheckout("mara@example.test", "FOUNDING", "AHRON");
  const preview = page.getByText("Price preview", { exact: true }).locator("../..");
  await expect(preview).toContainText("₱299.00");
  await expect(preview).toContainText("−₱29.90");
  const checkoutPreviewPath = testInfo.outputPath("checkout-offer-referral.png");
  await preview.screenshot({ path: checkoutPreviewPath });
  await testInfo.attach("checkout-offer-referral", {
    path: checkoutPreviewPath,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Place order", exact: true }).click();
  await expect(page.getByText("Your card order has been saved.", { exact: false })).toBeVisible();
  const savedOrder = await page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    return state.cardOrders.find(
      (order: { customerId: string }) => order.customerId === "customer-mara",
    );
  });
  expect(savedOrder).toMatchObject({
    cardPriceCentavos: 29900,
    discountCentavos: 2990,
    offerSnapshot: { code: "FOUNDING", fixedPriceCentavos: 29900 },
    referralSnapshot: { code: "AHRON", referrerLabel: "Ahron" },
  });
  const finalOfferCount = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("tapit:demo-state:v1")!).cardOrderOffers.find(
        (offer: { code: string }) => offer.code === "FOUNDING",
      ).usageCount,
  );
  expect(finalOfferCount).toBe(25);

  await fillCheckout("owner@example.test", "FOUNDING");
  await expect(page.getByText("Not available", { exact: true })).toBeVisible();
  await page.getByLabel("Promo code (optional)").fill("");
  await page.getByRole("switch", { name: "Have a referral code?" }).click();
  await page.getByRole("textbox", { name: "Referral code", exact: true }).fill("AHRON");
  const referralPreview = page.getByText("Price preview", { exact: true }).locator("../..");
  await expect(referralPreview).toContainText("−₱79.90");
  await expect(referralPreview).not.toContainText("Not available");
});
