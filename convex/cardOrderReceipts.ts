import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { activeOrderAccount } from "./cardOrderSettings";
import { isActiveCustomer, requireAdministrator, sameScope } from "./admin";

const INTENT_TTL_MS = 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PROCESSING_TTL_MS = 30 * 60 * 1000;

function awaitingPayment(order: { paymentStatus: string; fulfillmentStatus: string }) {
  return order.paymentStatus === "unpaid" && order.fulfillmentStatus === "awaiting_payment";
}

async function deleteUnreferencedStorage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  allowedUploadId?: Id<"cardOrderReceiptUploads">,
) {
  const refs = await ctx.db
    .query("cardOrderReceiptUploads")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .take(2);
  if (refs.some((ref) => ref._id !== allowedUploadId)) return false;
  if (allowedUploadId !== undefined) {
    const orders = await ctx.db
      .query("cardOrders")
      .withIndex("by_receiptUploadId", (q) => q.eq("receiptUploadId", allowedUploadId))
      .take(1);
    if (orders.length > 0) return false;
  }
  await ctx.storage.delete(storageId);
  return true;
}

async function failProcessingUpload(
  ctx: MutationCtx,
  upload: {
    _id: Id<"cardOrderReceiptUploads">;
    status: string;
    storageId?: Id<"_storage">;
  },
) {
  if (upload.status !== "processing") return;
  const orders = await ctx.db
    .query("cardOrders")
    .withIndex("by_receiptUploadId", (q) => q.eq("receiptUploadId", upload._id))
    .take(1);
  if (orders.length > 0) return;
  if (
    upload.storageId !== undefined &&
    !(await deleteUnreferencedStorage(ctx, upload.storageId, upload._id))
  )
    return;
  await ctx.db.patch(upload._id, {
    status: "failed",
    storageId: undefined,
    processingAt: undefined,
    availableAt: Date.now(),
    declaredContentType: undefined,
  });
  await ctx.scheduler.runAfter(RETENTION_MS, internal.cardOrderReceipts.cleanup, {
    uploadId: upload._id,
  });
}

export const createUploadIntent = mutation({
  args: { orderId: v.id("cardOrders") },
  returns: v.id("cardOrderReceiptUploads"),
  handler: async (ctx, { orderId }) => {
    const customer = await activeOrderAccount(ctx);
    const order = await ctx.db.get(orderId);
    if (
      order === null ||
      order.customerId !== customer._id ||
      !sameScope(customer, order) ||
      !awaitingPayment(order)
    )
      throw new Error("Order is not awaiting payment.");
    const now = Date.now();
    const uploadId = await ctx.db.insert("cardOrderReceiptUploads", {
      ownerId: customer._id,
      scope: customer.scope,
      orderId,
      status: "pending",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(INTENT_TTL_MS, internal.cardOrderReceipts.cleanup, { uploadId });
    return uploadId;
  },
});

export const attach = mutation({
  args: { orderId: v.id("cardOrders"), uploadId: v.id("cardOrderReceiptUploads") },
  returns: v.null(),
  handler: async (ctx, { orderId, uploadId }) => {
    const customer = await activeOrderAccount(ctx);
    const [order, upload] = await Promise.all([ctx.db.get(orderId), ctx.db.get(uploadId)]);
    if (
      order === null ||
      upload === null ||
      order.customerId !== customer._id ||
      upload.ownerId !== customer._id ||
      upload.orderId !== orderId ||
      !sameScope(customer, order) ||
      !sameScope(customer, upload) ||
      upload.status !== "available" ||
      upload.storageId === undefined ||
      upload.fileName === undefined ||
      upload.contentType === undefined ||
      upload.byteSize === undefined ||
      upload.availableAt === undefined ||
      !awaitingPayment(order) ||
      (await ctx.db.system.get("_storage", upload.storageId)) === null
    )
      throw new Error("Order is not awaiting payment.");

    const previousId = order.receiptUploadId;
    await ctx.db.patch(orderId, { receiptUploadId: uploadId, updatedAt: Date.now() });
    await ctx.db.patch(uploadId, { status: "attached" });
    if (previousId !== undefined && previousId !== uploadId) {
      const previous = await ctx.db.get(previousId);
      if (previous?.status === "attached") {
        await ctx.db.patch(previousId, { status: "replaced", availableAt: Date.now() });
        await ctx.scheduler.runAfter(RETENTION_MS, internal.cardOrderReceipts.cleanup, {
          uploadId: previousId,
        });
      }
    }
    return null;
  },
});

export const customerReceiptUrl = query({
  args: { orderId: v.id("cardOrders") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { orderId }) => {
    const customer = await activeOrderAccount(ctx);
    const order = await ctx.db.get(orderId);
    if (order === null || order.customerId !== customer._id || !sameScope(customer, order))
      throw new Error("Order unavailable.");
    const upload =
      order.receiptUploadId === undefined ? null : await ctx.db.get(order.receiptUploadId);
    if (upload === null || upload.storageId === undefined || !sameScope(customer, upload))
      return null;
    return await ctx.storage.getUrl(upload.storageId);
  },
});

export const adminOrderReceiptUrl = query({
  args: { orderId: v.id("cardOrders") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { orderId }) => {
    const { account } = await requireAdministrator(ctx);
    const order = await ctx.db.get(orderId);
    if (order === null || !sameScope(account, order)) throw new Error("Order unavailable.");
    const upload =
      order.receiptUploadId === undefined ? null : await ctx.db.get(order.receiptUploadId);
    if (upload === null || upload.storageId === undefined || !sameScope(account, upload))
      return null;
    return await ctx.storage.getUrl(upload.storageId);
  },
});

export const prepareUpload = internalMutation({
  args: {
    uploadId: v.id("cardOrderReceiptUploads"),
    userId: v.id("users"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    declaredContentType: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const upload = await ctx.db.get(args.uploadId);
    const order = upload === null ? null : await ctx.db.get(upload.orderId);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (
      customer === null ||
      !isActiveCustomer(customer) ||
      upload === null ||
      order === null ||
      upload.status !== "pending" ||
      upload.ownerId !== customer._id ||
      order.customerId !== customer._id ||
      !sameScope(customer, upload) ||
      !sameScope(customer, order) ||
      !awaitingPayment(order) ||
      Date.now() - upload.createdAt >= INTENT_TTL_MS ||
      metadata === null ||
      metadata._creationTime < upload.createdAt
    )
      throw new Error("This upload request is no longer available.");
    await ctx.db.patch(upload._id, {
      status: "processing",
      processingAt: Date.now(),
      storageId: args.storageId,
      fileName: args.fileName,
      declaredContentType: args.declaredContentType,
    });
    return null;
  },
});

export const checkUploadIntent = internalQuery({
  args: { uploadId: v.id("cardOrderReceiptUploads"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { uploadId, userId }) => {
    const customer = await ctx.db
      .query("customers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    const upload = await ctx.db.get(uploadId);
    const order = upload === null ? null : await ctx.db.get(upload.orderId);
    if (
      customer === null ||
      !isActiveCustomer(customer) ||
      upload === null ||
      order === null ||
      upload.status !== "pending" ||
      upload.ownerId !== customer._id ||
      order.customerId !== customer._id ||
      !sameScope(customer, upload) ||
      !sameScope(customer, order) ||
      !awaitingPayment(order) ||
      Date.now() - upload.createdAt >= INTENT_TTL_MS
    )
      throw new Error("This upload request is no longer available.");
    return null;
  },
});

export const getProcessingUpload = internalQuery({
  args: { uploadId: v.id("cardOrderReceiptUploads") },
  returns: v.union(
    v.null(),
    v.object({
      storageId: v.id("_storage"),
      fileName: v.string(),
      declaredContentType: v.string(),
      createdAt: v.number(),
      processingAt: v.number(),
    }),
  ),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    const order = upload === null ? null : await ctx.db.get(upload.orderId);
    return upload?.status === "processing" &&
      upload.storageId !== undefined &&
      upload.fileName !== undefined &&
      upload.declaredContentType !== undefined &&
      upload.processingAt !== undefined &&
      order !== null &&
      awaitingPayment(order)
      ? {
          storageId: upload.storageId,
          fileName: upload.fileName,
          declaredContentType: upload.declaredContentType,
          createdAt: upload.createdAt,
          processingAt: upload.processingAt,
        }
      : null;
  },
});

export const register = internalMutation({
  args: {
    uploadId: v.id("cardOrderReceiptUploads"),
    contentType: v.union(
      v.literal("image/jpeg"),
      v.literal("image/png"),
      v.literal("application/pdf"),
    ),
    byteSize: v.number(),
  },
  returns: v.id("cardOrderReceiptUploads"),
  handler: async (ctx, args): Promise<Id<"cardOrderReceiptUploads">> => {
    const upload = await ctx.db.get(args.uploadId);
    const order = upload === null ? null : await ctx.db.get(upload.orderId);
    if (
      upload === null ||
      order === null ||
      upload.status !== "processing" ||
      upload.storageId === undefined ||
      upload.processingAt === undefined ||
      Date.now() - upload.processingAt >= PROCESSING_TTL_MS ||
      !awaitingPayment(order)
    )
      throw new Error("Order is not awaiting payment.");
    await ctx.db.patch(upload._id, {
      status: "available",
      contentType: args.contentType,
      byteSize: args.byteSize,
      availableAt: Date.now(),
      processingAt: undefined,
      declaredContentType: undefined,
    });
    await ctx.scheduler.runAfter(RETENTION_MS, internal.cardOrderReceipts.cleanup, {
      uploadId: upload._id,
    });
    return upload._id;
  },
});

export const cleanupFailedUpload = internalMutation({
  args: {
    uploadId: v.id("cardOrderReceiptUploads"),
    storageId: v.optional(v.id("_storage")),
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, { uploadId, storageId: requestedStorageId, userId }) => {
    const upload = await ctx.db.get(uploadId);
    if (userId !== undefined) {
      if (requestedStorageId === undefined) return null;
      const customer = await ctx.db
        .query("customers")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (
        upload !== null &&
        customer !== null &&
        upload.ownerId === customer._id &&
        upload.status === "processing" &&
        upload.storageId === requestedStorageId
      ) {
        await failProcessingUpload(ctx, upload);
      } else {
        await deleteUnreferencedStorage(ctx, requestedStorageId);
      }
      return null;
    }
    if (upload === null) {
      return null;
    }
    await failProcessingUpload(ctx, upload);
    return null;
  },
});

export const cleanup = internalMutation({
  args: { uploadId: v.id("cardOrderReceiptUploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    if (
      upload?.status === "processing" &&
      Date.now() - (upload.processingAt ?? upload.createdAt) < PROCESSING_TTL_MS
    ) {
      await ctx.scheduler.runAfter(
        PROCESSING_TTL_MS - (Date.now() - (upload.processingAt ?? upload.createdAt)),
        internal.cardOrderReceipts.cleanup,
        { uploadId },
      );
      return null;
    }
    if (
      upload === null ||
      upload.status === "attached" ||
      (upload.status === "pending" && Date.now() - upload.createdAt < INTENT_TTL_MS) ||
      ((upload.status === "available" ||
        upload.status === "failed" ||
        upload.status === "replaced") &&
        Date.now() - (upload.availableAt ?? upload.createdAt) < RETENTION_MS)
    )
      return null;
    const [orders, stored] = await Promise.all([
      ctx.db
        .query("cardOrders")
        .withIndex("by_receiptUploadId", (q) => q.eq("receiptUploadId", uploadId))
        .take(1),
      upload.storageId === undefined
        ? Promise.resolve([])
        : ctx.db
            .query("cardOrderReceiptUploads")
            .withIndex("by_storageId", (q) => q.eq("storageId", upload.storageId))
            .take(2),
    ]);
    if (orders.length > 0) return null;
    if (upload.storageId !== undefined && stored.every((item) => item._id === uploadId))
      await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(uploadId);
    return null;
  },
});
