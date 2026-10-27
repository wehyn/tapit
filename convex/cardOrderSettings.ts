import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  customerForAuthUser,
  isActiveCustomer,
  requireAdministrator,
  requireUser,
  sameScope,
} from "./admin";
import {
  isCardOrderLaunchEndDate,
  getCardPriceCentavos,
  calculateReferralDiscountForPriceCentavos,
  isValidReferralFixedPriceCentavos,
} from "../src/lib/card-ordering";

const LAUNCH_END_KEY = "cardOrderLaunchEndDate";
const REFERRAL_USAGE_BACKFILL_KEY = "cardOrderReferralUsageBackfillStarted";
const paymentFields = v.object({
  provider: v.string(),
  label: v.string(),
  accountDetails: v.string(),
  instructions: v.string(),
});
const customerPayment = paymentFields.extend({
  _id: v.id("cardOrderPaymentMethods"),
  qrUrl: v.union(v.string(), v.null()),
});

export async function activeOrderAccount(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUser(ctx);
  const account = await customerForAuthUser(ctx, userId);
  if (account === null || !isActiveCustomer(account)) throw new Error("Active account required.");
  return account;
}

export async function launchEndDate(ctx: QueryCtx | MutationCtx, account: Doc<"customers">) {
  const settings = await ctx.db
    .query("settings")
    .withIndex("by_scope_and_key", (q) => q.eq("scope", account.scope).eq("key", LAUNCH_END_KEY))
    .take(1);
  return settings[0]?.value ?? null;
}

function requiredText(value: string, label: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max)
    throw new Error(`${label} must contain 1–${max} characters.`);
  return trimmed;
}

async function paymentQrUrl(
  ctx: QueryCtx,
  scope: Doc<"cardOrderPaymentMethods">["scope"],
  uploadId: Doc<"cardOrderPaymentMethods">["qrUploadId"],
) {
  if (uploadId === undefined) return null;
  const upload = await ctx.db.get(uploadId);
  return upload?.storageId === undefined || upload.scope !== scope
    ? null
    : await ctx.storage.getUrl(upload.storageId);
}

export const adminSettings = query({
  args: {},
  returns: v.object({
    launchEndDate: v.union(v.string(), v.null()),
    paymentMethods: v.array(
      v.object({
        _id: v.id("cardOrderPaymentMethods"),
        provider: v.string(),
        label: v.string(),
        accountDetails: v.string(),
        instructions: v.string(),
        active: v.boolean(),
        qrUrl: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const [date, payments] = await Promise.all([
      launchEndDate(ctx, account),
      ctx.db
        .query("cardOrderPaymentMethods")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", account.scope))
        .take(500),
    ]);
    return {
      launchEndDate: date,
      paymentMethods: await Promise.all(
        payments.map(
          async ({ _id, provider, label, accountDetails, instructions, active, qrUploadId }) => ({
            _id,
            provider,
            label,
            accountDetails,
            instructions,
            active,
            qrUrl: await paymentQrUrl(ctx, account.scope, qrUploadId),
          }),
        ),
      ),
    };
  },
});

export const adminReferralCodes = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("cardOrderReferralCodes"),
      code: v.string(),
      referrerLabel: v.string(),
      fixedPriceCentavos: v.optional(v.number()),
      active: v.boolean(),
      usageCount: v.number(),
      usageLimit: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const codes = await ctx.db
      .query("cardOrderReferralCodes")
      .withIndex("by_scope_and_active", (q) => q.eq("scope", account.scope))
      .take(500);
    return codes.map(
      ({ _id, code, referrerLabel, fixedPriceCentavos, active, usageCount, usageLimit }) => ({
        _id,
        code,
        referrerLabel,
        fixedPriceCentavos,
        active,
        usageCount: usageCount ?? 0,
        usageLimit,
      }),
    );
  },
});

export const startReferralUsageBackfill = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) =>
        q.eq("scope", account.scope).eq("key", REFERRAL_USAGE_BACKFILL_KEY),
      )
      .first();
    if (existing !== null) return null;
    await ctx.db.insert("settings", {
      scope: account.scope,
      key: REFERRAL_USAGE_BACKFILL_KEY,
      value: "started",
      updatedAt: Date.now(),
      updatedByUserId: userId,
    });
    await ctx.scheduler.runAfter(0, internal.cardOrderReferralUsage.backfillUsageCounts, {
      cursor: null,
    });
    return null;
  },
});

const referralUsageItem = v.object({
  date: v.number(),
  orderId: v.id("cardOrders"),
  customerName: v.optional(v.string()),
  customerEmail: v.optional(v.string()),
  paymentStatus: v.union(v.literal("unpaid"), v.literal("received"), v.literal("refunded")),
  fulfillmentStatus: v.union(
    v.literal("awaiting_shipping_quote"),
    v.literal("awaiting_payment"),
    v.literal("processing"),
    v.literal("delivered"),
    v.literal("cancelled"),
  ),
  commissionStatus: v.union(
    v.literal("none"),
    v.literal("pending"),
    v.literal("eligible"),
    v.literal("paid"),
    v.literal("void"),
  ),
});

export const adminReferralCodeUsage = query({
  args: { codeId: v.id("cardOrderReferralCodes"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(referralUsageItem),
  handler: async (ctx, args) => {
    const { account } = await requireAdministrator(ctx);
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    )
      throw new Error("Page size must be 1–100.");
    const code = await ctx.db.get(args.codeId);
    if (code === null || !sameScope(account, code)) throw new Error("Referral code unavailable.");
    const page = await ctx.db
      .query("cardOrders")
      .withIndex("by_scope_and_referralCodeId_and_createdAt", (q) =>
        q.eq("scope", account.scope).eq("referralCodeId", code._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const items = await Promise.all(
      page.page.map(async (order) => {
        const customer = await ctx.db.get(order.customerId);
        return {
          date: order.createdAt,
          orderId: order._id,
          ...(customer?.onboardingName === undefined
            ? {}
            : { customerName: customer.onboardingName }),
          ...(customer?.email === undefined ? {} : { customerEmail: customer.email }),
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          commissionStatus: order.commissionStatus,
        };
      }),
    );
    return { ...page, page: items };
  },
});

export const customerSettings = query({
  args: {},
  returns: v.object({
    launchEndDate: v.union(v.string(), v.null()),
    paymentMethods: v.array(customerPayment),
  }),
  handler: async (ctx) => {
    const customer = await activeOrderAccount(ctx);
    const [date, payments] = await Promise.all([
      launchEndDate(ctx, customer),
      ctx.db
        .query("cardOrderPaymentMethods")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", customer.scope).eq("active", true))
        .take(100),
    ]);
    return {
      launchEndDate: date,
      paymentMethods: await Promise.all(
        payments.map(
          async ({ _id, provider, label, accountDetails, instructions, qrUploadId }) => ({
            _id,
            provider,
            label,
            accountDetails,
            instructions,
            qrUrl: await paymentQrUrl(ctx, customer.scope, qrUploadId),
          }),
        ),
      ),
    };
  },
});

export const previewReferral = query({
  args: { code: v.string(), currentTime: v.number() },
  returns: v.object({ valid: v.boolean(), discountCentavos: v.number() }),
  handler: async (ctx, args) => {
    const customer = await activeOrderAccount(ctx);
    const code = args.code.trim().toUpperCase();
    const [date, referral, prior] = await Promise.all([
      launchEndDate(ctx, customer),
      ctx.db
        .query("cardOrderReferralCodes")
        .withIndex("by_scope_and_code", (q) => q.eq("scope", customer.scope).eq("code", code))
        .first(),
      ctx.db
        .query("cardOrders")
        .withIndex("by_scope_and_customerId_and_createdAt", (q) =>
          q.eq("scope", customer.scope).eq("customerId", customer._id),
        )
        .first(),
    ]);
    const valid =
      date !== null &&
      Number.isFinite(args.currentTime) &&
      referral?.active === true &&
      (referral.usageLimit === undefined || (referral.usageCount ?? 0) < referral.usageLimit) &&
      prior === null;
    return {
      valid,
      discountCentavos: valid
        ? calculateReferralDiscountForPriceCentavos(
            getCardPriceCentavos(date, args.currentTime),
            referral.fixedPriceCentavos,
          )
        : 0,
    };
  },
});

export const setLaunchEndDate = mutation({
  args: { date: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    if (args.date !== null && !isCardOrderLaunchEndDate(args.date))
      throw new Error("Use a valid YYYY-MM-DD date.");
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", account.scope).eq("key", LAUNCH_END_KEY))
      .first();
    const now = Date.now();
    if (args.date === null) {
      if (existing !== null) await ctx.db.delete(existing._id);
    } else if (existing === null) {
      await ctx.db.insert("settings", {
        scope: account.scope,
        key: LAUNCH_END_KEY,
        value: args.date,
        updatedAt: now,
        updatedByUserId: userId,
      });
    } else {
      await ctx.db.patch(existing._id, {
        value: args.date,
        updatedAt: now,
        updatedByUserId: userId,
      });
    }
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card_order.launch_end_date_changed",
      accountId: account._id,
      occurredAt: now,
      before: existing?.value,
      after: args.date ?? undefined,
    });
    return null;
  },
});

export const savePaymentMethod = mutation({
  args: { id: v.optional(v.id("cardOrderPaymentMethods")), ...paymentFields.fields },
  returns: v.id("cardOrderPaymentMethods"),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = args.id === undefined ? null : await ctx.db.get(args.id);
    if (args.id !== undefined && (existing === null || !sameScope(account, existing)))
      throw new Error("Payment method unavailable.");
    const fields = {
      provider: requiredText(args.provider, "Provider", 80),
      label: requiredText(args.label, "Label", 120),
      accountDetails: requiredText(args.accountDetails, "Account details", 500),
      instructions: requiredText(args.instructions, "Instructions", 1000),
    };
    const now = Date.now();
    const id =
      existing === null
        ? await ctx.db.insert("cardOrderPaymentMethods", {
            scope: account.scope,
            ...fields,
            active: true,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: userId,
          })
        : existing._id;
    if (existing !== null)
      await ctx.db.patch(id, { ...fields, updatedAt: now, updatedByUserId: userId });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card_order.payment_method_saved",
      accountId: account._id,
      occurredAt: now,
      before: existing === null ? undefined : JSON.stringify(existing),
      after: JSON.stringify({ id, ...fields }),
    });
    return id;
  },
});

export const deactivatePaymentMethod = mutation({
  args: { id: v.id("cardOrderPaymentMethods") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing === null || !sameScope(account, existing))
      throw new Error("Payment method unavailable.");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now, updatedByUserId: userId });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card_order.payment_method_deactivated",
      accountId: account._id,
      occurredAt: now,
      before: JSON.stringify(existing),
      after: JSON.stringify({ ...existing, active: false }),
    });
    return null;
  },
});

export const saveReferralCode = mutation({
  args: {
    id: v.optional(v.id("cardOrderReferralCodes")),
    code: v.string(),
    referrerLabel: v.string(),
    fixedPriceCentavos: v.optional(v.number()),
    active: v.boolean(),
    usageLimit: v.optional(v.number()),
  },
  returns: v.id("cardOrderReferralCodes"),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = args.id === undefined ? null : await ctx.db.get(args.id);
    if (args.id !== undefined && (existing === null || !sameScope(account, existing)))
      throw new Error("Referral code unavailable.");
    const code = requiredText(args.code, "Referral code", 40).toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code))
      throw new Error("Referral code may contain letters, numbers, hyphens, and underscores only.");
    const referrerLabel = requiredText(args.referrerLabel, "Referrer label", 120);
    if (
      args.fixedPriceCentavos !== undefined &&
      !isValidReferralFixedPriceCentavos(args.fixedPriceCentavos)
    )
      throw new Error("Fixed price must be a positive whole-centavo amount no greater than ₱599.");
    if (
      args.usageLimit !== undefined &&
      (!Number.isSafeInteger(args.usageLimit) || args.usageLimit <= 0)
    )
      throw new Error("Usage limit must be a positive safe integer.");
    const collision = await ctx.db
      .query("cardOrderReferralCodes")
      .withIndex("by_scope_and_code", (q) => q.eq("scope", account.scope).eq("code", code))
      .first();
    if (collision !== null && collision._id !== existing?._id)
      throw new Error("Referral code already exists.");
    const now = Date.now();
    const id =
      existing === null
        ? await ctx.db.insert("cardOrderReferralCodes", {
            scope: account.scope,
            code,
            referrerLabel,
            fixedPriceCentavos: args.fixedPriceCentavos,
            active: args.active,
            usageLimit: args.usageLimit,
            createdAt: now,
            updatedAt: now,
            updatedByUserId: userId,
          })
        : existing._id;
    if (existing !== null)
      await ctx.db.patch(id, {
        code,
        referrerLabel,
        fixedPriceCentavos: args.fixedPriceCentavos,
        active: args.active,
        usageLimit: args.usageLimit,
        updatedAt: now,
        updatedByUserId: userId,
      });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card_order.referral_code_saved",
      accountId: account._id,
      occurredAt: now,
      before: existing === null ? undefined : JSON.stringify(existing),
      after: JSON.stringify({
        id,
        code,
        referrerLabel,
        fixedPriceCentavos: args.fixedPriceCentavos,
        active: args.active,
        usageLimit: args.usageLimit,
      }),
    });
    return id;
  },
});

export const deactivateReferralCode = mutation({
  args: { id: v.id("cardOrderReferralCodes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing === null || !sameScope(account, existing))
      throw new Error("Referral code unavailable.");
    const now = Date.now();
    await ctx.db.patch(args.id, { active: false, updatedAt: now, updatedByUserId: userId });
    await ctx.db.insert("auditLogs", {
      scope: account.scope,
      actorUserId: userId,
      actorLabel: "Administrator",
      action: "card_order.referral_code_deactivated",
      accountId: account._id,
      occurredAt: now,
      before: JSON.stringify(existing),
      after: JSON.stringify({ ...existing, active: false }),
    });
    return null;
  },
});

export const activateReferralCode = mutation({
  args: { id: v.id("cardOrderReferralCodes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, account } = await requireAdministrator(ctx);
    const existing = await ctx.db.get(args.id);
    if (existing === null || !sameScope(account, existing))
      throw new Error("Referral code unavailable.");
    if (!existing.active) {
      const now = Date.now();
      await ctx.db.patch(args.id, { active: true, updatedAt: now, updatedByUserId: userId });
      await ctx.db.insert("auditLogs", {
        scope: account.scope,
        actorUserId: userId,
        actorLabel: "Administrator",
        action: "card_order.referral_code_activated",
        accountId: account._id,
        occurredAt: now,
        before: JSON.stringify(existing),
        after: JSON.stringify({ ...existing, active: true }),
      });
    }
    return null;
  },
});
