import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  customerForAuthUser,
  isActiveCustomer,
  requireAdministrator,
  requireUser,
  sameScope,
} from "./admin";

const INTENT_TTL_MS = 60 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PROCESSING_TTL_MS = 30 * 60 * 1000;

export const assertAdministrator = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const account = await customerForAuthUser(ctx, userId);
    if (account === null || account.role !== "admin" || !isActiveCustomer(account))
      throw new Error("Administrator permission required.");
    return null;
  },
});

async function isReferenced(ctx: QueryCtx | MutationCtx, uploadId: Id<"cardOrderQrUploads">) {
  const [methods, orders, snapshots] = await Promise.all([
    ctx.db
      .query("cardOrderPaymentMethods")
      .withIndex("by_qrUploadId", (q) => q.eq("qrUploadId", uploadId))
      .take(1),
    ctx.db
      .query("cardOrders")
      .withIndex("by_qrUploadId", (q) => q.eq("qrUploadId", uploadId))
      .take(1),
    ctx.db
      .query("cardOrders")
      .withIndex("by_paymentSnapshot_qrUploadId", (q) =>
        q.eq("paymentSnapshot.qrUploadId", uploadId),
      )
      .take(1),
  ]);
  return methods.length > 0 || orders.length > 0 || snapshots.length > 0;
}

export const createUploadIntent = internalMutation({
  args: { userId: v.id("users") },
  returns: v.id("cardOrderQrUploads"),
  handler: async (ctx, { userId }) => {
    const account = await customerForAuthUser(ctx, userId);
    if (account === null || account.role !== "admin" || !isActiveCustomer(account))
      throw new Error("Administrator permission required.");
    const now = Date.now();
    const uploadId = await ctx.db.insert("cardOrderQrUploads", {
      ownerId: account._id,
      actorUserId: userId,
      scope: account.scope,
      status: "pending",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(INTENT_TTL_MS, internal.cardOrderPaymentQr.cleanup, { uploadId });
    return uploadId;
  },
});

export const prepareUpload = internalMutation({
  args: { uploadId: v.id("cardOrderQrUploads"), storageId: v.id("_storage"), fileName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    const owner = upload === null ? null : await ctx.db.get(upload.ownerId);
    if (
      upload === null ||
      owner === null ||
      upload.status !== "pending" ||
      owner.role !== "admin" ||
      !isActiveCustomer(owner) ||
      !sameScope(owner, upload) ||
      Date.now() - upload.createdAt >= INTENT_TTL_MS
    )
      throw new Error("This upload request is no longer available.");
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null || metadata._creationTime < upload.createdAt)
      throw new Error("This file was not created for this upload request.");
    await ctx.db.patch(upload._id, {
      status: "processing",
      processingAt: Date.now(),
      storageId: args.storageId,
      fileName: args.fileName.trim().slice(0, 255),
    });
    return null;
  },
});

export const getProcessingUpload = internalQuery({
  args: { uploadId: v.id("cardOrderQrUploads") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("cardOrderQrUploads"),
      storageId: v.optional(v.id("_storage")),
      fileName: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    return upload?.status === "processing"
      ? {
          _id: upload._id,
          ...(upload.storageId === undefined ? {} : { storageId: upload.storageId }),
          ...(upload.fileName === undefined ? {} : { fileName: upload.fileName }),
        }
      : null;
  },
});

export const register = internalMutation({
  args: {
    uploadId: v.id("cardOrderQrUploads"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png")),
    byteSize: v.number(),
  },
  returns: v.id("cardOrderQrUploads"),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (
      upload === null ||
      upload.status !== "processing" ||
      upload.storageId === undefined ||
      upload.processingAt === undefined ||
      Date.now() - upload.processingAt >= PROCESSING_TTL_MS
    )
      throw new Error("This upload request is no longer available.");
    await ctx.db.patch(upload._id, {
      status: "available",
      contentType: args.contentType,
      byteSize: args.byteSize,
      processingAt: undefined,
      availableAt: Date.now(),
    });
    await ctx.scheduler.runAfter(RETENTION_MS, internal.cardOrderPaymentQr.cleanup, {
      uploadId: upload._id,
    });
    return upload._id;
  },
});

export const cleanupFailedUpload = internalMutation({
  args: { uploadId: v.id("cardOrderQrUploads"), storageId: v.optional(v.id("_storage")) },
  returns: v.null(),
  handler: async (ctx, { uploadId, storageId: requestedStorageId }) => {
    const upload = await ctx.db.get(uploadId);
    if (upload === null) {
      if (requestedStorageId !== undefined) {
        const refs = await ctx.db
          .query("cardOrderQrUploads")
          .withIndex("by_storageId", (q) => q.eq("storageId", requestedStorageId))
          .take(1);
        if (refs.length === 0) await ctx.storage.delete(requestedStorageId);
      }
      return null;
    }
    if (
      upload === null ||
      upload.status === "attached" ||
      (upload.status !== "pending" && upload.status !== "processing")
    )
      return null;
    if (
      upload.storageId !== undefined &&
      requestedStorageId !== undefined &&
      upload.storageId !== requestedStorageId
    )
      return null;
    const storageId = upload.storageId ?? requestedStorageId;
    if (storageId !== undefined && !(await isReferenced(ctx, uploadId))) {
      const [metadata, refs] = await Promise.all([
        ctx.db.system.get("_storage", storageId),
        ctx.db
          .query("cardOrderQrUploads")
          .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
          .take(2),
      ]);
      if (
        metadata !== null &&
        metadata._creationTime >= upload.createdAt &&
        refs.every((ref) => ref._id === uploadId)
      )
        await ctx.storage.delete(storageId);
    }
    await ctx.db.delete(uploadId);
    return null;
  },
});

export const cleanup = internalMutation({
  args: { uploadId: v.id("cardOrderQrUploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const upload = await ctx.db.get(uploadId);
    if (
      upload === null ||
      upload.status === "attached" ||
      (upload.status === "pending" && Date.now() - upload.createdAt < INTENT_TTL_MS) ||
      (upload.status === "processing" &&
        Date.now() - (upload.processingAt ?? upload.createdAt) < PROCESSING_TTL_MS) ||
      (upload.status === "available" &&
        Date.now() - (upload.availableAt ?? upload.createdAt) < RETENTION_MS)
    )
      return null;
    if (await isReferenced(ctx, uploadId)) return null;
    if (upload.storageId !== undefined) await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(uploadId);
    return null;
  },
});

export const setPaymentMethodQr = mutation({
  args: {
    methodId: v.id("cardOrderPaymentMethods"),
    uploadId: v.union(v.id("cardOrderQrUploads"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { methodId, uploadId }) => {
    const { account } = await requireAdministrator(ctx);
    const method = await ctx.db.get(methodId);
    if (method === null || !sameScope(account, method))
      throw new Error("Payment method unavailable.");
    let next: Doc<"cardOrderQrUploads"> | null = null;
    if (uploadId !== null) {
      next = await ctx.db.get(uploadId);
      if (
        next === null ||
        next.status !== "available" ||
        next.contentType === undefined ||
        next.storageId === undefined ||
        next.ownerId !== account._id ||
        !sameScope(account, next)
      )
        throw new Error("QR upload unavailable.");
    }
    const previousId = method.qrUploadId;
    if (previousId === uploadId) return null;
    await ctx.db.patch(methodId, { qrUploadId: uploadId ?? undefined, updatedAt: Date.now() });
    if (next !== null) await ctx.db.patch(next._id, { status: "attached", attachedAt: Date.now() });
    if (previousId !== undefined) {
      const previous = await ctx.db.get(previousId);
      if (previous !== null)
        await ctx.db.patch(previousId, {
          status: "available",
          availableAt: Date.now(),
          attachedAt: undefined,
        });
      await ctx.scheduler.runAfter(RETENTION_MS, internal.cardOrderPaymentQr.cleanup, {
        uploadId: previousId,
      });
    }
    return null;
  },
});

export const customerPaymentQrUrl = query({
  args: {
    paymentMethodId: v.optional(v.id("cardOrderPaymentMethods")),
    orderId: v.optional(v.id("cardOrders")),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const account = await customerForAuthUser(ctx, userId);
    if (account === null || account.role !== "customer" || !isActiveCustomer(account))
      throw new Error("Payment method unavailable.");
    let uploadId: Id<"cardOrderQrUploads"> | undefined;
    if (args.paymentMethodId !== undefined && args.orderId === undefined) {
      const method = await ctx.db.get(args.paymentMethodId);
      if (method !== null && method.active && sameScope(account, method))
        uploadId = method.qrUploadId;
    } else if (args.orderId !== undefined && args.paymentMethodId === undefined) {
      const order = await ctx.db.get(args.orderId);
      if (order !== null && order.customerId === account._id && sameScope(account, order))
        uploadId = order.paymentSnapshot.qrUploadId ?? order.qrUploadId;
    }
    if (uploadId === undefined) {
      if (args.paymentMethodId !== undefined || args.orderId !== undefined)
        throw new Error("Payment method unavailable.");
      return null;
    }
    const upload = await ctx.db.get(uploadId);
    if (upload === null || upload.storageId === undefined || !sameScope(account, upload))
      throw new Error("Payment method unavailable.");
    return await ctx.storage.getUrl(upload.storageId);
  },
});
