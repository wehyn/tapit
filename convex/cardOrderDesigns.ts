import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { customerForAuthUser, isActiveCustomer, requireUser, sameScope } from "./admin";

type DesignStorageContext = Pick<QueryCtx | MutationCtx, "db" | "storage">;
const DAY_MS = 24 * 60 * 60 * 1000;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const customer = await customerForAuthUser(ctx, userId);
    if (!isActiveCustomer(customer)) throw new Error("Active account required.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const activeCustomer = internalQuery({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => isActiveCustomer(await customerForAuthUser(ctx, args.userId)),
});

export const register = internalMutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png")),
    byteSize: v.number(),
  },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args) => {
    const customer = await customerForAuthUser(ctx, args.userId);
    if (customer === null || !isActiveCustomer(customer))
      throw new Error("Active account required.");
    const existing = await ctx.db
      .query("cardOrderDesignUploads")
      .withIndex("by_storageId", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing !== null) throw new Error("This upload has already been processed.");

    const uploadId = await ctx.db.insert("cardOrderDesignUploads", {
      ownerId: customer._id,
      scope: customer.scope,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      byteSize: args.byteSize,
      status: "available",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(DAY_MS, internal.cardOrderDesigns.cleanup, { uploadId });
    return uploadId;
  },
});

export const cleanup = internalMutation({
  args: { uploadId: v.id("cardOrderDesignUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null || upload.status !== "available") return null;
    await ctx.db.delete(upload._id);
    await ctx.storage.delete(upload.storageId);
    return null;
  },
});

/** Called in placeOrder's mutation so the order and upload attach commit atomically. */
export async function attachCardOrderDesignUpload(
  ctx: MutationCtx,
  uploadId: Id<"cardOrderDesignUploads">,
  customer: Doc<"customers">,
  orderId: Id<"cardOrders">,
) {
  const [upload, order] = await Promise.all([ctx.db.get(uploadId), ctx.db.get(orderId)]);
  if (
    !isActiveCustomer(customer) ||
    upload === null ||
    order === null ||
    upload.status !== "available" ||
    upload.orderId !== undefined ||
    upload.ownerId !== customer._id ||
    order.customerId !== customer._id ||
    order.designSource.kind !== "upload" ||
    order.designSource.uploadId !== upload._id ||
    !sameScope(customer, upload) ||
    !sameScope(customer, order)
  ) {
    throw new Error("The uploaded card design is unavailable.");
  }
  await ctx.db.patch(upload._id, { status: "attached", orderId });
}

async function orderDesignUrl(
  ctx: DesignStorageContext,
  customer: Doc<"customers">,
  order: Doc<"cardOrders">,
) {
  if (
    order.designSource.kind !== "upload" ||
    order.customerId !== customer._id ||
    !sameScope(customer, order)
  ) {
    return undefined;
  }
  const upload = await ctx.db.get(order.designSource.uploadId);
  if (
    upload === null ||
    upload.status !== "attached" ||
    upload.orderId !== order._id ||
    upload.ownerId !== customer._id ||
    !sameScope(customer, upload) ||
    !sameScope(order, upload)
  ) {
    return undefined;
  }
  return (await ctx.storage.getUrl(upload.storageId)) ?? undefined;
}

/** Resolves only the signed URL for this active customer's own order upload. */
export async function resolveCustomerCardOrderDesignUrl(
  ctx: DesignStorageContext,
  customer: Doc<"customers">,
  order: Doc<"cardOrders">,
) {
  if (!isActiveCustomer(customer) || customer.role !== "customer") return undefined;
  return await orderDesignUrl(ctx, customer, order);
}

/** Pass the account returned by requireAdministrator; scope and ownership are checked here too. */
export async function resolveAdminCardOrderDesignUrl(
  ctx: DesignStorageContext,
  administrator: Doc<"customers">,
  order: Doc<"cardOrders">,
) {
  if (
    !isActiveCustomer(administrator) ||
    administrator.role !== "admin" ||
    !sameScope(administrator, order)
  ) {
    return undefined;
  }
  const customer = await ctx.db.get(order.customerId);
  if (customer === null || !sameScope(administrator, customer) || !sameScope(customer, order)) {
    return undefined;
  }
  return await orderDesignUrl(ctx, customer, order);
}
