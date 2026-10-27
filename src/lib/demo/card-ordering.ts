"use client";

import {
  calculateCommissionCentavos,
  calculateReferralDiscountForPriceCentavos,
  getCardPriceCentavos,
  isCardOrderLaunchEndDate,
  isValidReferralFixedPriceCentavos,
} from "../card-ordering";
import {
  withDemoCardOrderAssetReservation,
  withDemoCardOrderCommitLock,
} from "./card-order-assets";
import type {
  DemoCardOrder,
  DemoCardOrderDesignSource,
  DemoCardOrderPaymentMethod,
  DemoCardOrderReferralCode,
  DemoCardOrderReferralCodeUsage,
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
  backDesignSource: DemoCardOrderDesignSource;
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

function activeOrderAccount(state: DemoState) {
  const access = resolveDemoSessionAccess(state, getDemoSession());
  if (access.kind !== "active") throw new Error("An active account is required.");
  return access.account;
}

function currentOrderState() {
  const refreshed = refreshDemoAccessSnapshot();
  if (refreshed.kind !== "ready") throw new Error("Demo account storage is unavailable.");
  activeOrderAccount(refreshed.snapshot.state);
  return refreshed.snapshot.state;
}

async function updateDemoCardOrderAdminState(
  adminId: string,
  update: (state: DemoState) => DemoState,
): Promise<void> {
  await withDemoCardOrderCommitLock(async () => {
    const refreshedState = currentState("admin");
    if (activeAccount(refreshedState, "admin").id !== adminId) {
      throw new Error("Administrator session changed. Try again.");
    }
    updateDemoState((state) => {
      if (activeAccount(state, "admin").id !== adminId) {
        throw new Error("Administrator session changed. Try again.");
      }
      return update(state);
    });
  });
}

function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new Error(`${label} must contain 1–${max} characters.`);
  }
  return trimmed;
}

function validateDesignSource(source: DemoCardOrderDesignSource): DemoCardOrderDesignSource {
  if (source.kind === "url" && !("assetKey" in source)) {
    const url = source.url.trim();
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
    return { kind: "url", url };
  }
  if (
    source.kind === "upload" &&
    !("url" in source) &&
    typeof source.assetKey === "string" &&
    typeof source.fileName === "string" &&
    (source.contentType === "image/jpeg" || source.contentType === "image/png") &&
    Number.isSafeInteger(source.byteSize) &&
    source.byteSize >= 0
  ) {
    return { ...source };
  }
  throw new Error("Choose one design source.");
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
    referralCodes: state.cardOrderReferralCodes.map((code) => ({
      ...code,
      usageCount: state.cardOrders.filter((order) => order.referralCodeId === code.id).length,
    })),
  };
}

export function getDemoCardOrderReferralCodeUsage(
  codeId: string,
  paginationOpts: { numItems: number; cursor: string | null },
): {
  page: DemoCardOrderReferralCodeUsage[];
  isDone: boolean;
  continueCursor: string;
} {
  const state = currentState("admin");
  if (!state.cardOrderReferralCodes.some((code) => code.id === codeId)) {
    throw new Error("Referral code unavailable.");
  }
  const { numItems, cursor } = paginationOpts;
  if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 100) {
    throw new Error("Page size must be 1–100.");
  }
  const offset = cursor === null ? 0 : Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid pagination cursor.");

  const orders = state.cardOrders
    .filter((order) => order.referralCodeId === codeId)
    .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
  const page = orders.slice(offset, offset + numItems).map((order) => {
    const customer = state.customers.find((item) => item.id === order.customerId);
    const profile = customer?.profileId
      ? state.profiles.find((item) => item.id === customer.profileId)
      : undefined;
    const customerName = profile?.draft.name?.trim();
    return {
      date: order.createdAt,
      orderId: order.id,
      ...(customerName ? { customerName } : {}),
      ...(customer?.email ? { customerEmail: customer.email } : {}),
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      commissionStatus: order.commissionStatus,
    };
  });
  const nextOffset = offset + page.length;
  return {
    page,
    isDone: nextOffset >= orders.length,
    continueCursor: nextOffset >= orders.length ? "" : String(nextOffset),
  };
}

export function getDemoCardOrderCustomerSettings() {
  const state = currentOrderState();
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

export async function setDemoCardOrderLaunchEndDate(date: string | null): Promise<void> {
  if (date !== null && !isCardOrderLaunchEndDate(date)) {
    throw new Error("Use a valid YYYY-MM-DD date.");
  }
  const adminId = activeAccount(currentState("admin"), "admin").id;
  await updateDemoCardOrderAdminState(adminId, (state) => {
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

export async function saveDemoCardOrderPaymentMethod(input: {
  id?: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
}): Promise<string> {
  const adminId = activeAccount(currentState("admin"), "admin").id;
  const fields = {
    provider: requiredText(input.provider, "Provider", 80),
    label: requiredText(input.label, "Label", 120),
    accountDetails: requiredText(input.accountDetails, "Account details", 500),
    instructions: requiredText(input.instructions, "Instructions", 1000),
  };
  const id = input.id ?? crypto.randomUUID();
  await updateDemoCardOrderAdminState(adminId, (state) => {
    const existing = state.cardOrderPaymentMethods.find((method) => method.id === id);
    if (input.id && !existing) throw new Error("Payment method unavailable.");
    const now = Date.now();
    const saved: DemoCardOrderPaymentMethod = {
      ...fields,
      id,
      active: existing?.active ?? true,
      qrAssetKey: existing?.qrAssetKey,
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

export async function deactivateDemoCardOrderPaymentMethod(id: string): Promise<void> {
  const adminId = activeAccount(currentState("admin"), "admin").id;
  await updateDemoCardOrderAdminState(adminId, (state) => {
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

export async function saveDemoCardOrderReferralCode(input: {
  id?: string;
  code: string;
  referrerLabel: string;
  fixedPriceCentavos?: number;
  active: boolean;
}): Promise<string> {
  const adminId = activeAccount(currentState("admin"), "admin").id;
  const code = requiredText(input.code, "Referral code", 40).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    throw new Error("Referral code may contain letters, numbers, hyphens, and underscores only.");
  }
  const referrerLabel = requiredText(input.referrerLabel, "Referrer label", 120);
  if (
    input.fixedPriceCentavos !== undefined &&
    !isValidReferralFixedPriceCentavos(input.fixedPriceCentavos)
  ) {
    throw new Error("Fixed price must be a positive whole-centavo amount no greater than ₱599.");
  }
  const id = input.id ?? crypto.randomUUID();
  await updateDemoCardOrderAdminState(adminId, (state) => {
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
      fixedPriceCentavos: input.fixedPriceCentavos,
      active: input.active,
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

export async function setDemoCardOrderReferralCodeActive(
  id: string,
  active: boolean,
): Promise<void> {
  const adminId = activeAccount(currentState("admin"), "admin").id;
  await updateDemoCardOrderAdminState(adminId, (state) => {
    const existing = state.cardOrderReferralCodes.find((referral) => referral.id === id);
    if (!existing) throw new Error("Referral code unavailable.");
    if (existing.active === active) return state;
    const action = active ? "activated" : "deactivated";
    return {
      ...state,
      cardOrderReferralCodes: state.cardOrderReferralCodes.map((referral) =>
        referral.id === id ? { ...referral, active, updatedAt: Date.now() } : referral,
      ),
      audits: audit(
        state,
        `referral_code_${action}`,
        id,
        JSON.stringify(existing),
        active ? "active" : "inactive",
      ),
    };
  });
}

export async function deactivateDemoCardOrderReferralCode(id: string): Promise<void> {
  return setDemoCardOrderReferralCodeActive(id, false);
}

export function previewDemoCardOrderReferral(code: string, currentTime: number) {
  const state = currentOrderState();
  const customer = activeOrderAccount(state);
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
      ? calculateReferralDiscountForPriceCentavos(
          getCardPriceCentavos(state.cardOrderLaunchEndDate, currentTime),
          referral.fixedPriceCentavos,
        )
      : 0,
  };
}

export async function placeDemoCardOrder(input: PlaceOrderInput): Promise<string> {
  const state = currentOrderState();
  const customer = activeOrderAccount(state);
  const frontSource = validateDesignSource(input.designSource);
  const backSource = validateDesignSource(input.backDesignSource);
  const uploads = [frontSource, backSource].filter(
    (source): source is Extract<DemoCardOrderDesignSource, { kind: "upload" }> =>
      source.kind === "upload",
  );
  if (new Set(uploads.map(({ assetKey }) => assetKey)).size !== uploads.length) {
    throw new Error("The same artwork cannot be used for both sides.");
  }
  const id = crypto.randomUUID();
  const updateOrder = (current: DemoState) => {
    const owner = activeOrderAccount(current);
    if (owner.id !== customer.id) throw new Error("Account session changed. Try again.");
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
    for (const upload of uploads) {
      if (
        current.cardOrders.some((order) =>
          [order.designSource, order.backDesignSource].some(
            (source) => source?.kind === "upload" && source.assetKey === upload.assetKey,
          ),
        )
      ) {
        throw new Error("The uploaded card design is unavailable.");
      }
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
      designSource: frontSource,
      backDesignSource: backSource,
      deliveryName,
      deliveryPhone,
      deliveryAddress,
      cardPriceCentavos,
      discountCentavos: referral
        ? calculateReferralDiscountForPriceCentavos(cardPriceCentavos, referral.fixedPriceCentavos)
        : 0,
      paymentMethodId: payment.id,
      paymentSnapshot: {
        provider: payment.provider,
        label: payment.label,
        accountDetails: payment.accountDetails,
        instructions: payment.instructions,
        qrAssetKey: payment.qrAssetKey,
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
  };
  const persistOrder = () =>
    withDemoCardOrderCommitLock(async () => {
      const refreshedState = currentOrderState();
      if (activeOrderAccount(refreshedState).id !== customer.id) {
        throw new Error("Account session changed. Try again.");
      }
      updateDemoState(updateOrder);
      return id;
    });
  return uploads.length > 0
    ? withDemoCardOrderAssetReservation(uploads, id, customer.id, persistOrder)
    : persistOrder();
}

export function getMyDemoCardOrders() {
  const state = currentOrderState();
  const owner = activeOrderAccount(state);
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
        receipt,
      }) => ({
        id,
        createdAt,
        cardPriceCentavos,
        discountCentavos,
        shippingQuoteCentavos,
        paymentSnapshot,
        paymentStatus,
        fulfillmentStatus,
        receipt: receipt ?? null,
      }),
    );
}

export function getAdminDemoCardOrders() {
  return [...currentState("admin").cardOrders].sort((a, b) => b.createdAt - a.createdAt);
}

function orderAuditSnapshot(order: DemoCardOrder): string {
  return JSON.stringify({
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    commissionStatus: order.commissionStatus,
    shippingQuoteCentavos: order.shippingQuoteCentavos,
  });
}

async function changeOrder(
  orderId: string,
  action: string,
  transition: (order: DemoCardOrder) => Partial<DemoCardOrder>,
): Promise<void> {
  const adminId = activeAccount(currentState("admin"), "admin").id;
  await updateDemoCardOrderAdminState(adminId, (state) => {
    const order = state.cardOrders.find((candidate) => candidate.id === orderId);
    if (!order) throw new Error("Order unavailable.");
    const changes = transition(order);
    const updatedOrder = { ...order, ...changes };
    return {
      ...state,
      cardOrders: state.cardOrders.map((candidate) =>
        candidate.id === orderId ? { ...updatedOrder, updatedAt: Date.now() } : candidate,
      ),
      audits: audit(
        state,
        action,
        orderId,
        orderAuditSnapshot(order),
        orderAuditSnapshot(updatedOrder),
      ),
    };
  });
}

export function quoteDemoCardOrderShipping(
  orderId: string,
  shippingQuoteCentavos: number,
): Promise<void> {
  return changeOrder(orderId, "shipping_quoted", (order) => {
    if (order.fulfillmentStatus !== "awaiting_shipping_quote" || order.paymentStatus !== "unpaid") {
      throw new Error("Order is not awaiting a shipping quote.");
    }
    if (!Number.isSafeInteger(shippingQuoteCentavos) || shippingQuoteCentavos < 0) {
      throw new Error("Shipping quote must be non-negative integer centavos.");
    }
    return { shippingQuoteCentavos, fulfillmentStatus: "awaiting_payment" };
  });
}

export function markDemoCardOrderPaymentReceived(orderId: string): Promise<void> {
  return changeOrder(orderId, "payment_received", (order) => {
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

export function markDemoCardOrderDelivered(orderId: string): Promise<void> {
  return changeOrder(orderId, "delivered", (order) => {
    if (order.fulfillmentStatus !== "processing" || order.paymentStatus !== "received") {
      throw new Error("Paid processing order required.");
    }
    return { fulfillmentStatus: "delivered" };
  });
}

function stoppedCommission(order: DemoCardOrder): DemoCardOrder["commissionStatus"] {
  return order.commissionStatus === "paid" ? "paid" : order.referralCodeId ? "void" : "none";
}

export function cancelDemoCardOrder(orderId: string): Promise<void> {
  return changeOrder(orderId, "cancelled", (order) => {
    if (
      order.paymentStatus !== "unpaid" ||
      !["awaiting_shipping_quote", "awaiting_payment"].includes(order.fulfillmentStatus)
    ) {
      throw new Error("Only an unpaid open order can be cancelled.");
    }
    return { fulfillmentStatus: "cancelled", commissionStatus: stoppedCommission(order) };
  });
}

export function refundDemoCardOrder(orderId: string): Promise<void> {
  return changeOrder(orderId, "refunded", (order) => {
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

export function markDemoCardOrderCommissionEligible(orderId: string): Promise<void> {
  return changeOrder(orderId, "commission_eligible", (order) => {
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

export function recordDemoCardOrderCommissionPayout(
  orderId: string,
  reference: string,
): Promise<void> {
  return changeOrder(orderId, "commission_paid", (order) => {
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
