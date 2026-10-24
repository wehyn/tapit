"use client";

import {
  calculateCommissionCentavos,
  calculateReferralDiscountCentavos,
  getCardPriceCentavos,
  isCardOrderLaunchEndDate,
} from "../card-ordering";
import { readDemoCardOrderAsset } from "./card-order-assets";
import type {
  DemoCardOrder,
  DemoCardOrderDesignSource,
  DemoCardOrderPaymentMethod,
  DemoCardOrderReferralCode,
  DemoState,
} from "./fixtures";
import {
  getDemoSession,
  refreshDemoAccessSnapshot,
  resolveDemoSessionAccess,
  updateDemoState,
} from "./store";

type PlaceOrderInput = {
  paymentMethodId: string;
  referralCode?: string;
  designSource: DemoCardOrderDesignSource;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
};

function activeAccount(state: DemoState, role: "customer" | "admin") {
  const access = resolveDemoSessionAccess(state, getDemoSession());
  if (access.kind !== "active" || access.account.role !== role) {
    throw new Error(
      role === "admin" ? "Administrator access required." : "Active customer account required.",
    );
  }
  return access.account;
}

function currentState(role: "customer" | "admin") {
  const refreshed = refreshDemoAccessSnapshot();
  if (refreshed.kind !== "ready") throw new Error("Demo account storage is unavailable.");
  activeAccount(refreshed.snapshot.state, role);
  return refreshed.snapshot.state;
}

function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new Error(`${label} must contain 1–${max} characters.`);
  }
  return trimmed;
}

function audit(state: DemoState, action: string, target: string, before?: string, after?: string) {
  return [
    {
      id: crypto.randomUUID(),
      actor: "Administrator",
      action: `card_order.${action}`,
      target,
      occurredAt: new Date().toISOString(),
      before,
      after,
    },
    ...state.audits,
  ];
}

export function getDemoCardOrderAdminSettings() {
  const state = currentState("admin");
  return {
    launchEndDate: state.cardOrderLaunchEndDate,
    paymentMethods: state.cardOrderPaymentMethods,
    referralCodes: state.cardOrderReferralCodes,
  };
}

export function getDemoCardOrderCustomerSettings() {
  const state = currentState("customer");
  return {
    launchEndDate: state.cardOrderLaunchEndDate,
    paymentMethods: state.cardOrderPaymentMethods
      .filter((method) => method.active)
      .map(({ id, provider, label, accountDetails, instructions }) => ({
        id,
        provider,
        label,
        accountDetails,
        instructions,
      })),
  };
}

export function setDemoCardOrderLaunchEndDate(date: string | null): void {
  if (date !== null && !isCardOrderLaunchEndDate(date)) {
    throw new Error("Use a valid YYYY-MM-DD date.");
  }
  currentState("admin");
  updateDemoState((state) => {
    activeAccount(state, "admin");
    return {
      ...state,
      cardOrderLaunchEndDate: date,
      audits: audit(
        state,
        "launch_end_date_changed",
        "Card ordering",
        state.cardOrderLaunchEndDate ?? undefined,
        date ?? undefined,
      ),
    };
  });
}

export function saveDemoCardOrderPaymentMethod(input: {
  id?: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
}): string {
  currentState("admin");
  const fields = {
    provider: requiredText(input.provider, "Provider", 80),
    label: requiredText(input.label, "Label", 120),
    accountDetails: requiredText(input.accountDetails, "Account details", 500),
    instructions: requiredText(input.instructions, "Instructions", 1000),
  };
  const id = input.id ?? crypto.randomUUID();
  updateDemoState((state) => {
    activeAccount(state, "admin");
    const existing = state.cardOrderPaymentMethods.find((method) => method.id === id);
    if (input.id && !existing) throw new Error("Payment method unavailable.");
    const now = Date.now();
    const saved: DemoCardOrderPaymentMethod = {
      ...fields,
      id,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return {
      ...state,
      cardOrderPaymentMethods: existing
        ? state.cardOrderPaymentMethods.map((method) => (method.id === id ? saved : method))
        : [...state.cardOrderPaymentMethods, saved],
      audits: audit(
        state,
        "payment_method_saved",
        id,
        existing && JSON.stringify(existing),
        JSON.stringify(saved),
      ),
    };
  });
  return id;
}

export function deactivateDemoCardOrderPaymentMethod(id: string): void {
  currentState("admin");
  updateDemoState((state) => {
    activeAccount(state, "admin");
    const existing = state.cardOrderPaymentMethods.find((method) => method.id === id);
    if (!existing) throw new Error("Payment method unavailable.");
    return {
      ...state,
      cardOrderPaymentMethods: state.cardOrderPaymentMethods.map((method) =>
        method.id === id ? { ...method, active: false, updatedAt: Date.now() } : method,
      ),
      audits: audit(state, "payment_method_deactivated", id, JSON.stringify(existing), "inactive"),
    };
  });
}

export function saveDemoCardOrderReferralCode(input: {
  id?: string;
  code: string;
  referrerLabel: string;
}): string {
  currentState("admin");
  const code = requiredText(input.code, "Referral code", 40).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("Referral code may contain letters, numbers, hyphens, and underscores only.");
  }
  const referrerLabel = requiredText(input.referrerLabel, "Referrer label", 120);
  const id = input.id ?? crypto.randomUUID();
  updateDemoState((state) => {
    activeAccount(state, "admin");
    const existing = state.cardOrderReferralCodes.find((referral) => referral.id === id);
    if (input.id && !existing) throw new Error("Referral code unavailable.");
    if (
      state.cardOrderReferralCodes.some((referral) => referral.code === code && referral.id !== id)
    ) {
      throw new Error("Referral code already exists.");
    }
    const now = Date.now();
    const saved: DemoCardOrderReferralCode = {
      id,
      code,
      referrerLabel,
      active: existing?.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return {
      ...state,
      cardOrderReferralCodes: existing
        ? state.cardOrderReferralCodes.map((referral) => (referral.id === id ? saved : referral))
        : [...state.cardOrderReferralCodes, saved],
      audits: audit(
        state,
        "referral_code_saved",
        id,
        existing && JSON.stringify(existing),
        JSON.stringify(saved),
      ),
    };
  });
  return id;
}

export function deactivateDemoCardOrderReferralCode(id: string): void {
  currentState("admin");
  updateDemoState((state) => {
    activeAccount(state, "admin");
    const existing = state.cardOrderReferralCodes.find((referral) => referral.id === id);
    if (!existing) throw new Error("Referral code unavailable.");
    return {
      ...state,
      cardOrderReferralCodes: state.cardOrderReferralCodes.map((referral) =>
        referral.id === id ? { ...referral, active: false, updatedAt: Date.now() } : referral,
      ),
      audits: audit(state, "referral_code_deactivated", id, JSON.stringify(existing), "inactive"),
    };
  });
}

export function previewDemoCardOrderReferral(code: string, currentTime: number) {
  const state = currentState("customer");
  const customer = activeAccount(state, "customer");
  const referral = state.cardOrderReferralCodes.find(
    (item) => item.code === code.trim().toUpperCase(),
  );
  const valid =
    state.cardOrderLaunchEndDate !== null &&
    Number.isFinite(currentTime) &&
    referral?.active === true &&
    !state.cardOrders.some((order) => order.customerId === customer.id);
  return {
    valid,
    discountCentavos: valid
      ? calculateReferralDiscountCentavos(
          getCardPriceCentavos(state.cardOrderLaunchEndDate, currentTime),
        )
      : 0,
  };
}

export async function placeDemoCardOrder(input: PlaceOrderInput): Promise<string> {
  const state = currentState("customer");
  const customer = activeAccount(state, "customer");
  if (
    (input.designSource.kind === "upload" && "url" in input.designSource) ||
    (input.designSource.kind === "url" && "assetKey" in input.designSource)
  ) {
    throw new Error("Choose one design source.");
  }
  if (input.designSource.kind === "upload") {
    const asset = await readDemoCardOrderAsset(input.designSource.assetKey);
    if (
      !asset ||
      asset.ownerId !== customer.id ||
      asset.fileName !== input.designSource.fileName ||
      asset.contentType !== input.designSource.contentType ||
      asset.byteSize !== input.designSource.byteSize
    ) {
      throw new Error("The uploaded card design is unavailable.");
    }
  }
  const id = crypto.randomUUID();
  updateDemoState((current) => {
    const owner = activeAccount(current, "customer");
    if (owner.id !== customer.id) throw new Error("Customer session changed. Try again.");
    if (
      current.cardOrderLaunchEndDate === null ||
      !current.cardOrderPaymentMethods.some((method) => method.active)
    ) {
      throw new Error("Card ordering is not configured.");
    }
    const payment = current.cardOrderPaymentMethods.find(
      (method) => method.id === input.paymentMethodId && method.active,
    );
    if (!payment) throw new Error("Payment method unavailable.");
    const deliveryName = requiredText(input.deliveryName, "Delivery name", 120);
    const deliveryPhone = requiredText(input.deliveryPhone, "Delivery phone", 40);
    const deliveryAddress = requiredText(input.deliveryAddress, "Delivery address", 1000);
    let designSource: DemoCardOrderDesignSource;
    if (input.designSource.kind === "url") {
      const url = input.designSource.url.trim();
      if (url.length < 1 || url.length > 2_048) {
        throw new Error("Design URL must contain 1–2048 characters.");
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new Error("Design URL must use HTTPS.");
      }
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
        throw new Error("Design URL must use HTTPS without credentials.");
      }
      designSource = { kind: "url", url };
    } else if (input.designSource.kind === "upload") {
      const assetKey = input.designSource.assetKey;
      if (
        current.cardOrders.some(
          (order) =>
            order.designSource.kind === "upload" && order.designSource.assetKey === assetKey,
        )
      ) {
        throw new Error("The uploaded card design is unavailable.");
      }
      designSource = {
        kind: "upload",
        assetKey,
        fileName: input.designSource.fileName,
        contentType: input.designSource.contentType,
        byteSize: input.designSource.byteSize,
      };
    } else {
      throw new Error("Choose one design source.");
    }
    const normalizedCode = input.referralCode?.trim().toUpperCase();
    const referral = normalizedCode
      ? current.cardOrderReferralCodes.find((item) => item.code === normalizedCode)
      : undefined;
    if (
      normalizedCode &&
      (!referral?.active || current.cardOrders.some((order) => order.customerId === owner.id))
    ) {
      throw new Error("Referral code is unavailable for this order.");
    }
    const now = Date.now();
    const cardPriceCentavos = getCardPriceCentavos(current.cardOrderLaunchEndDate, now);
    const order: DemoCardOrder = {
      id,
      customerId: owner.id,
      quantity: 1,
      designSource,
      deliveryName,
      deliveryPhone,
      deliveryAddress,
      cardPriceCentavos,
      discountCentavos: referral ? calculateReferralDiscountCentavos(cardPriceCentavos) : 0,
      paymentMethodId: payment.id,
      paymentSnapshot: {
        provider: payment.provider,
        label: payment.label,
        accountDetails: payment.accountDetails,
        instructions: payment.instructions,
      },
      referralCodeId: referral?.id,
      referralSnapshot: referral
        ? { code: referral.code, referrerLabel: referral.referrerLabel }
        : undefined,
      paymentStatus: "unpaid",
      fulfillmentStatus: "awaiting_shipping_quote",
      commissionStatus: referral ? "pending" : "none",
      commissionCentavos: referral ? calculateCommissionCentavos(cardPriceCentavos) : 0,
      createdAt: now,
      updatedAt: now,
    };
    return { ...current, cardOrders: [...current.cardOrders, order] };
  });
  return id;
}

export function getMyDemoCardOrders() {
  const state = currentState("customer");
  const owner = activeAccount(state, "customer");
  return state.cardOrders
    .filter((order) => order.customerId === owner.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(
      ({
        id,
        createdAt,
        cardPriceCentavos,
        discountCentavos,
        shippingQuoteCentavos,
        paymentSnapshot,
        paymentStatus,
        fulfillmentStatus,
      }) => ({
        id,
        createdAt,
        cardPriceCentavos,
        discountCentavos,
        shippingQuoteCentavos,
        paymentSnapshot,
        paymentStatus,
        fulfillmentStatus,
      }),
    );
}

export function getAdminDemoCardOrders() {
  return [...currentState("admin").cardOrders].sort((a, b) => b.createdAt - a.createdAt);
}

function changeOrder(
  orderId: string,
  action: string,
  transition: (order: DemoCardOrder) => Partial<DemoCardOrder>,
) {
  currentState("admin");
  updateDemoState((state) => {
    activeAccount(state, "admin");
    const order = state.cardOrders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error("Order unavailable.");
    const changes = transition(order);
    return {
      ...state,
      cardOrders: state.cardOrders.map((candidate) =>
        candidate.id === orderId ? { ...candidate, ...changes, updatedAt: Date.now() } : candidate,
      ),
      audits: audit(state, action, orderId, JSON.stringify(order), JSON.stringify(changes)),
    };
  });
}

export function quoteDemoCardOrderShipping(orderId: string, shippingQuoteCentavos: number) {
  changeOrder(orderId, "shipping_quoted", (order) => {
    if (order.fulfillmentStatus !== "awaiting_shipping_quote" || order.paymentStatus !== "unpaid") {
      throw new Error("Order is not awaiting a shipping quote.");
    }
    if (!Number.isSafeInteger(shippingQuoteCentavos) || shippingQuoteCentavos < 0) {
      throw new Error("Shipping quote must be non-negative integer centavos.");
    }
    return { shippingQuoteCentavos, fulfillmentStatus: "awaiting_payment" };
  });
}

export function markDemoCardOrderPaymentReceived(orderId: string) {
  changeOrder(orderId, "payment_received", (order) => {
    if (
      order.fulfillmentStatus !== "awaiting_payment" ||
      order.paymentStatus !== "unpaid" ||
      order.shippingQuoteCentavos === undefined
    ) {
      throw new Error("Order is not awaiting payment.");
    }
    return { paymentStatus: "received", fulfillmentStatus: "processing" };
  });
}

export function markDemoCardOrderDelivered(orderId: string) {
  changeOrder(orderId, "delivered", (order) => {
    if (order.fulfillmentStatus !== "processing" || order.paymentStatus !== "received") {
      throw new Error("Paid processing order required.");
    }
    return { fulfillmentStatus: "delivered" };
  });
}

function stoppedCommission(order: DemoCardOrder): DemoCardOrder["commissionStatus"] {
  return order.commissionStatus === "paid" ? "paid" : order.referralCodeId ? "void" : "none";
}

export function cancelDemoCardOrder(orderId: string) {
  changeOrder(orderId, "cancelled", (order) => {
    if (
      order.paymentStatus !== "unpaid" ||
      !["awaiting_shipping_quote", "awaiting_payment"].includes(order.fulfillmentStatus)
    ) {
      throw new Error("Only an unpaid open order can be cancelled.");
    }
    return { fulfillmentStatus: "cancelled", commissionStatus: stoppedCommission(order) };
  });
}

export function refundDemoCardOrder(orderId: string) {
  changeOrder(orderId, "refunded", (order) => {
    if (
      order.paymentStatus !== "received" ||
      !["processing", "delivered"].includes(order.fulfillmentStatus)
    ) {
      throw new Error("Only a paid order can be refunded.");
    }
    return {
      paymentStatus: "refunded",
      fulfillmentStatus: order.fulfillmentStatus === "delivered" ? "delivered" : "cancelled",
      commissionStatus: stoppedCommission(order),
    };
  });
}

export function markDemoCardOrderCommissionEligible(orderId: string) {
  changeOrder(orderId, "commission_eligible", (order) => {
    if (
      order.fulfillmentStatus !== "delivered" ||
      order.paymentStatus !== "received" ||
      order.commissionStatus !== "pending"
    ) {
      throw new Error("Delivered referral order required.");
    }
    return { commissionStatus: "eligible" };
  });
}

export function recordDemoCardOrderCommissionPayout(orderId: string, reference: string) {
  changeOrder(orderId, "commission_paid", (order) => {
    if (
      order.commissionStatus !== "eligible" ||
      order.fulfillmentStatus !== "delivered" ||
      order.paymentStatus !== "received"
    ) {
      throw new Error("Eligible delivered order required.");
    }
    return {
      commissionStatus: "paid",
      payoutReference: requiredText(reference, "Payout reference", 200),
    };
  });
}
