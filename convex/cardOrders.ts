import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdministrator, sameScope } from "./admin";
import { activeOrderAccount, launchEndDate } from "./cardOrderSettings";
import { attachCardOrderDesignUpload } from "./cardOrderDesigns";
import {
  calculateCommissionCentavos,
  calculateReferralDiscountForPriceCentavos,
  getCardPriceCentavos,
} from "../src/lib/card-ordering";
import schema from "./schema";

const designSource = v.union(
  v.object({ kind: v.literal("upload"), uploadId: v.id("cardOrderDesignUploads") }),
  v.object({ kind: v.literal("url"), url: v.string() }),
);
const customerOrder = v.object({
  _id: v.id("cardOrders"),
  createdAt: v.number(),
  cardPriceCentavos: v.number(),
  discountCentavos: v.number(),
  shippingQuoteCentavos: v.optional(v.number()),
  paymentSnapshot: v.object({
    provider: v.string(),
    label: v.string(),
    accountDetails: v.string(),
    instructions: v.string(),
    qrUrl: v.union(v.string(), v.null()),
  }),
  paymentStatus: v.union(v.literal("unpaid"), v.literal("received"), v.literal("refunded")),
  fulfillmentStatus: v.union(
    v.literal("awaiting_shipping_quote"),
    v.literal("awaiting_payment"),
    v.literal("processing"),
    v.literal("delivered"),
    v.literal("cancelled"),
  ),
  receipt: v.union(
    v.null(),
    v.object({
      fileName: v.string(),
      contentType: v.union(
        v.literal("image/jpeg"),
        v.literal("image/png"),
        v.literal("application/pdf"),
      ),
      byteSize: v.number(),
      uploadedAt: v.number(),
    }),
  ),
});
const receiptMetadata = v.object({
  fileName: v.string(),
  contentType: v.union(
    v.literal("image/jpeg"),
    v.literal("image/png"),
    v.literal("application/pdf"),
  ),
  byteSize: v.number(),
  uploadedAt: v.number(),
});
const adminOrderProjection = schema
  .doc("cardOrders")
  .omit("receiptUploadId")
  .extend({
    receipt: v.union(v.null(), receiptMetadata),
  });

async function projectAdminOrder(ctx: QueryCtx, order: Doc<"cardOrders">) {
  const upload =
    order.receiptUploadId === undefined ? null : await ctx.db.get(order.receiptUploadId);
  const projected = { ...order };
  delete projected.receiptUploadId;
  return {
    ...projected,
    receipt:
      upload?.fileName &&
      upload.contentType &&
      upload.byteSize !== undefined &&
      upload.availableAt !== undefined
        ? {
            fileName: upload.fileName,
            contentType: upload.contentType,
            byteSize: upload.byteSize,
            uploadedAt: upload.availableAt,
          }
        : null,
  };
}

function deliveryText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new Error(`${label} must contain 1–${max} characters.`);
  return trimmed;
}

const cardPrice = v.object({ cardPriceCentavos: v.number(), discountCentavos: v.number() });

export const placeOrder = mutation({
  args: {
    paymentMethodId: v.id("cardOrderPaymentMethods"),
    referralCode: v.optional(v.string()),
    designSource,
    backDesignSource: designSource,
    deliveryName: v.string(),
    deliveryPhone: v.string(),
    deliveryAddress: v.string(),
    // Comparison precondition only: the card amount after referral discount that
    // the customer reviewed. It never populates a stored monetary field.
    expectedAmountCentavos: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal("created"), orderId: v.id("cardOrders") }),
    v.object({ kind: v.literal("price_changed"), price: cardPrice }),
  ),
  handler: async (ctx, args) => {
    const customer = await activeOrderAccount(ctx);
    if (!Number.isSafeInteger(args.expectedAmountCentavos) || args.expectedAmountCentavos < 0)
      throw new Error("Expected card amount must be non-negative integer centavos.");
    const now = Date.now();
    const [date, activePayment, selectedPayment, prior] = await Promise.all([
      launchEndDate(ctx, customer),
      ctx.db
        .query("cardOrderPaymentMethods")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", customer.scope).eq("active", true))
        .first(),
      ctx.db.get(args.paymentMethodId),
      ctx.db
        .query("cardOrders")
        .withIndex("by_scope_and_customerId_and_createdAt", (q) =>
          q.eq("scope", customer.scope).eq("customerId", customer._id),
        )
        .first(),
    ]);
    if (date === null || activePayment === null)
      throw new Error("Card ordering is not configured.");
    if (
      selectedPayment === null ||
      !selectedPayment.active ||
      !sameScope(customer, selectedPayment)
    )
      throw new Error("Payment method unavailable.");
    const deliveryName = deliveryText(args.deliveryName, "Delivery name", 120);
    const deliveryPhone = deliveryText(args.deliveryPhone, "Delivery phone", 40);
    const deliveryAddress = deliveryText(args.deliveryAddress, "Delivery address", 1000);
    const validateDesignSource = async (source: typeof args.designSource) => {
      if (source.kind === "url") {
        const url = source.url.trim();
        if (url.length < 1 || url.length > 2048)
          throw new Error("Design URL must contain 1–2048 characters.");
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error("Design URL must use HTTPS.");
        }
        if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password)
          throw new Error("Design URL must use HTTPS without credentials.");
        return { kind: "url" as const, url };
      }

      const upload = await ctx.db.get(source.uploadId);
      if (
        upload === null ||
        upload.ownerId !== customer._id ||
        !sameScope(customer, upload) ||
        upload.status !== "available" ||
        upload.storageId === undefined ||
        upload.orderId !== undefined
      )
        throw new Error("The uploaded card design is unavailable.");
      return { kind: "upload" as const, uploadId: upload._id };
    };
    if (
      args.designSource.kind === "upload" &&
      args.backDesignSource.kind === "upload" &&
      args.designSource.uploadId === args.backDesignSource.uploadId
    ) {
      throw new Error("Front and back must use different uploaded files.");
    }
    const [designSourceValue, backDesignSourceValue] = await Promise.all([
      validateDesignSource(args.designSource),
      validateDesignSource(args.backDesignSource),
    ]);
    const normalizedCode = args.referralCode?.trim().toUpperCase();
    const referral = normalizedCode
      ? await ctx.db
          .query("cardOrderReferralCodes")
          .withIndex("by_scope_and_code", (q) =>
            q.eq("scope", customer.scope).eq("code", normalizedCode),
          )
          .first()
      : null;
    if (normalizedCode && (referral === null || !referral.active || prior !== null))
      throw new Error("Referral code is unavailable for this order.");
    const cardPriceCentavos = getCardPriceCentavos(date, now);
    const discountCentavos =
      referral === null
        ? 0
        : calculateReferralDiscountForPriceCentavos(cardPriceCentavos, referral.fixedPriceCentavos);
    // Checked before the first write: a changed amount creates nothing, so the
    // customer must review the authoritative price and submit again.
    if (cardPriceCentavos - discountCentavos !== args.expectedAmountCentavos)
      return {
        kind: "price_changed" as const,
        price: { cardPriceCentavos, discountCentavos },
      };
    const commissionCentavos =
      referral === null ? 0 : calculateCommissionCentavos(cardPriceCentavos);
    const orderId = await ctx.db.insert("cardOrders", {
      scope: customer.scope,
      customerId: customer._id,
      quantity: 1,
      designSource: designSourceValue,
      backDesignSource: backDesignSourceValue,
      deliveryName,
      deliveryPhone,
      deliveryAddress,
      cardPriceCentavos,
      discountCentavos,
      paymentMethodId: selectedPayment._id,
      qrUploadId: selectedPayment.qrUploadId,
      paymentSnapshot: {
        provider: selectedPayment.provider,
        label: selectedPayment.label,
        accountDetails: selectedPayment.accountDetails,
        instructions: selectedPayment.instructions,
        ...(selectedPayment.qrUploadId === undefined
          ? {}
          : { qrUploadId: selectedPayment.qrUploadId }),
      },
      referralCodeId: referral?._id,
      referralSnapshot:
        referral === null
          ? undefined
          : { code: referral.code, referrerLabel: referral.referrerLabel },
      paymentStatus: "unpaid",
      fulfillmentStatus: "awaiting_shipping_quote",
      commissionStatus: referral === null ? "none" : "pending",
      commissionCentavos,
      ...(referral === null ? {} : { usageCounted: true }),
      createdAt: now,
      updatedAt: now,
    });
    if (referral !== null)
      await ctx.db.patch(referral._id, { usageCount: (referral.usageCount ?? 0) + 1 });
    if (designSourceValue.kind === "upload")
      await attachCardOrderDesignUpload(ctx, designSourceValue.uploadId, customer, orderId);
    if (backDesignSourceValue.kind === "upload")
      await attachCardOrderDesignUpload(ctx, backDesignSourceValue.uploadId, customer, orderId);
    return { kind: "created" as const, orderId };
  },
});

export const myOrders = query({
  args: {},
  returns: v.array(customerOrder),
  handler: async (ctx) => {
    const customer = await activeOrderAccount(ctx);
    const orders = await ctx.db
      .query("cardOrders")
      .withIndex("by_scope_and_customerId_and_createdAt", (q) =>
        q.eq("scope", customer.scope).eq("customerId", customer._id),
      )
      .order("desc")
      .take(20);
    return await Promise.all(
      orders.map(
        async ({
          _id,
          createdAt,
          cardPriceCentavos,
          discountCentavos,
          shippingQuoteCentavos,
          paymentSnapshot,
          qrUploadId: orderQrUploadId,
          paymentStatus,
          fulfillmentStatus,
          receiptUploadId,
        }) => {
          const qrUploadId = paymentSnapshot.qrUploadId ?? orderQrUploadId;
          const [qrUpload, receiptUpload] = await Promise.all([
            qrUploadId === undefined ? null : ctx.db.get(qrUploadId),
            receiptUploadId === undefined ? null : ctx.db.get(receiptUploadId),
          ]);
          return {
            _id,
            createdAt,
            cardPriceCentavos,
            discountCentavos,
            shippingQuoteCentavos,
            paymentSnapshot: {
              provider: paymentSnapshot.provider,
              label: paymentSnapshot.label,
              accountDetails: paymentSnapshot.accountDetails,
              instructions: paymentSnapshot.instructions,
              qrUrl:
                qrUpload?.storageId === undefined || !sameScope(customer, qrUpload)
                  ? null
                  : await ctx.storage.getUrl(qrUpload.storageId),
            },
            paymentStatus,
            fulfillmentStatus,
            receipt:
              receiptUpload?.fileName &&
              receiptUpload.contentType &&
              receiptUpload.byteSize !== undefined &&
              receiptUpload.availableAt !== undefined
                ? {
                    fileName: receiptUpload.fileName,
                    contentType: receiptUpload.contentType,
                    byteSize: receiptUpload.byteSize,
                    uploadedAt: receiptUpload.availableAt,
                  }
                : null,
          };
        },
      ),
    );
  },
});

export const adminOrders = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(adminOrderProjection),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    )
      throw new Error("Page size must be 1–100.");
    const page = await ctx.db
      .query("cardOrders")
      .withIndex("by_scope_and_createdAt", (q) => q.eq("scope", account.scope))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map((order) => projectAdminOrder(ctx, order))),
    };
  },
});

export const adminOrderById = query({
  args: { orderId: v.id("cardOrders") },
  returns: adminOrderProjection,
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    const order = await ctx.db.get(args.orderId);
    if (order === null || !sameScope(account, order)) throw new Error("Order unavailable.");
    return await projectAdminOrder(ctx, order);
  },
});

async function adminOrder(ctx: MutationCtx, orderId: Id<"cardOrders">) {
  const { userId, account } = await requireAdministrator(ctx);
  const order = await ctx.db.get(orderId);
  if (order === null || !sameScope(account, order)) throw new Error("Order unavailable.");
  if (order.referralCodeId !== undefined && order.usageCounted !== true) {
    const referral = await ctx.db.get(order.referralCodeId);
    if (referral !== null)
      await ctx.db.patch(referral._id, { usageCount: (referral.usageCount ?? 0) + 1 });
    await ctx.db.patch(order._id, { usageCounted: true });
    return { userId, account, order: { ...order, usageCounted: true } };
  }
  return { userId, account, order };
}

async function updateOrder(
  ctx: MutationCtx,
  access: Awaited<ReturnType<typeof adminOrder>>,
  action: string,
  changes: Partial<Doc<"cardOrders">>,
) {
  const now = Date.now();
  await ctx.db.patch(access.order._id, { ...changes, updatedAt: now });
  await ctx.db.insert("auditLogs", {
    scope: access.account.scope,
    actorUserId: access.userId,
    actorLabel: "Administrator",
    action: `card_order.${action}`,
    accountId: access.order.customerId,
    occurredAt: now,
    before: JSON.stringify({
      orderId: access.order._id,
      paymentStatus: access.order.paymentStatus,
      fulfillmentStatus: access.order.fulfillmentStatus,
      commissionStatus: access.order.commissionStatus,
      shippingQuoteCentavos: access.order.shippingQuoteCentavos,
    }),
    after: JSON.stringify({ orderId: access.order._id, ...changes }),
  });
}

export const quoteShipping = mutation({
  args: { orderId: v.id("cardOrders"), shippingQuoteCentavos: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.fulfillmentStatus !== "awaiting_shipping_quote" ||
      access.order.paymentStatus !== "unpaid"
    )
      throw new Error("Order is not awaiting a shipping quote.");
    if (!Number.isSafeInteger(args.shippingQuoteCentavos) || args.shippingQuoteCentavos < 0)
      throw new Error("Shipping quote must be non-negative integer centavos.");
    await updateOrder(ctx, access, "shipping_quoted", {
      shippingQuoteCentavos: args.shippingQuoteCentavos,
      fulfillmentStatus: "awaiting_payment",
    });
    return null;
  },
});

export const markPaymentReceived = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.fulfillmentStatus !== "awaiting_payment" ||
      access.order.paymentStatus !== "unpaid" ||
      access.order.shippingQuoteCentavos === undefined
    )
      throw new Error("Order is not awaiting payment.");
    await updateOrder(ctx, access, "payment_received", {
      paymentStatus: "received",
      fulfillmentStatus: "processing",
    });
    return null;
  },
});

export const markDelivered = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.fulfillmentStatus !== "processing" ||
      access.order.paymentStatus !== "received"
    )
      throw new Error("Paid processing order required.");
    await updateOrder(ctx, access, "delivered", { fulfillmentStatus: "delivered" });
    return null;
  },
});

export const cancelOrder = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.paymentStatus !== "unpaid" ||
      !["awaiting_shipping_quote", "awaiting_payment"].includes(access.order.fulfillmentStatus)
    )
      throw new Error("Only an unpaid open order can be cancelled.");
    await updateOrder(ctx, access, "cancelled", {
      fulfillmentStatus: "cancelled",
      commissionStatus:
        access.order.commissionStatus === "paid"
          ? "paid"
          : access.order.referralCodeId === undefined
            ? "none"
            : "void",
    });
    return null;
  },
});

export const refundOrder = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.paymentStatus !== "received" ||
      !["processing", "delivered"].includes(access.order.fulfillmentStatus)
    )
      throw new Error("Only a paid order can be refunded.");
    await updateOrder(ctx, access, "refunded", {
      paymentStatus: "refunded",
      fulfillmentStatus: access.order.fulfillmentStatus === "delivered" ? "delivered" : "cancelled",
      commissionStatus:
        access.order.commissionStatus === "paid"
          ? "paid"
          : access.order.referralCodeId === undefined
            ? "none"
            : "void",
    });
    return null;
  },
});

export const markCommissionEligible = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.fulfillmentStatus !== "delivered" ||
      access.order.paymentStatus !== "received" ||
      access.order.commissionStatus !== "pending"
    )
      throw new Error("Delivered referral order required.");
    await updateOrder(ctx, access, "commission_eligible", { commissionStatus: "eligible" });
    return null;
  },
});

export const recordCommissionPayout = mutation({
  args: { orderId: v.id("cardOrders"), payoutReference: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await adminOrder(ctx, args.orderId);
    if (
      access.order.commissionStatus !== "eligible" ||
      access.order.fulfillmentStatus !== "delivered" ||
      access.order.paymentStatus !== "received"
    )
      throw new Error("Eligible delivered order required.");
    const payoutReference = deliveryText(args.payoutReference, "Payout reference", 200);
    await updateOrder(ctx, access, "commission_paid", {
      commissionStatus: "paid",
      payoutReference,
    });
    return null;
  },
});
