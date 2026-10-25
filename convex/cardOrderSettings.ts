import { v } from "convex/values";
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
const paymentFields = v.object({
  provider: v.string(),
  label: v.string(),
  accountDetails: v.string(),
  instructions: v.string(),
});
const customerPayment = paymentFields.extend({ _id: v.id("cardOrderPaymentMethods") });

export async function activeOrderCustomer(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUser(ctx);
  const account = await customerForAuthUser(ctx, userId);
  if (account === null || account.role !== "customer" || !isActiveCustomer(account))
    throw new Error("Active customer account required.");
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
      }),
    ),
    referralCodes: v.array(
      v.object({
        _id: v.id("cardOrderReferralCodes"),
        code: v.string(),
        referrerLabel: v.string(),
        fixedPriceCentavos: v.optional(v.number()),
        active: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const [date, payments, referrals] = await Promise.all([
      launchEndDate(ctx, account),
      ctx.db
        .query("cardOrderPaymentMethods")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", account.scope))
        .take(500),
      ctx.db
        .query("cardOrderReferralCodes")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", account.scope))
        .take(500),
    ]);
    return {
      launchEndDate: date,
      paymentMethods: payments.map(
        ({ _id, provider, label, accountDetails, instructions, active }) => ({
          _id,
          provider,
          label,
          accountDetails,
          instructions,
          active,
        }),
      ),
      referralCodes: referrals.map(({ _id, code, referrerLabel, fixedPriceCentavos, active }) => ({
        _id,
        code,
        referrerLabel,
        ...(fixedPriceCentavos === undefined ? {} : { fixedPriceCentavos }),
        active,
      })),
    };
  },
});

export const customerSettings = query({
  args: {},
  returns: v.object({
    launchEndDate: v.union(v.string(), v.null()),
    paymentMethods: v.array(customerPayment),
  }),
  handler: async (ctx) => {
    const customer = await activeOrderCustomer(ctx);
    const [date, payments] = await Promise.all([
      launchEndDate(ctx, customer),
      ctx.db
        .query("cardOrderPaymentMethods")
        .withIndex("by_scope_and_active", (q) => q.eq("scope", customer.scope).eq("active", true))
        .take(100),
    ]);
    return {
      launchEndDate: date,
      paymentMethods: payments.map(({ _id, provider, label, accountDetails, instructions }) => ({
        _id,
        provider,
        label,
        accountDetails,
        instructions,
      })),
    };
  },
});

export const previewReferral = query({
  args: { code: v.string(), currentTime: v.number() },
  returns: v.object({ valid: v.boolean(), discountCentavos: v.number() }),
  handler: async (ctx, args) => {
    const customer = await activeOrderCustomer(ctx);
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
            active: true,
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
