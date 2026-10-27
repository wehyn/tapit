import { v } from "convex/values";

import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  customerForAuthUser,
  isActiveCustomer,
  requireAdministrator,
  requireUser,
  sameScope,
} from "./admin";
import { inspectProfileStorage } from "./profileStorageReferences";
import schema from "./schema";

type DesignStorageContext = Pick<QueryCtx | MutationCtx, "db" | "storage">;
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_INTENT_TTL_MS = 60 * 60 * 1000;
const PROCESSING_INTENT_TTL_MS = 30 * 60 * 1000;

async function storageIsUnreferenced(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  allowedUploadId?: Id<"cardOrderDesignUploads">,
) {
  const [uploads, profileInspection] = await Promise.all([
    ctx.db
      .query("cardOrderDesignUploads")
      .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
      .take(2),
    inspectProfileStorage(ctx, storageId, { kind: "cardOrderDesignUpload" }),
  ]);
  return (
    !uploads.some((upload) => upload._id !== allowedUploadId) &&
    profileInspection.kind === "unreferenced"
  );
}

async function assertStorageWasNotCreatedBeforeIntent(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  intentCreatedAt: number,
) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (metadata === null || metadata._creationTime < intentCreatedAt) {
    throw new Error("This upload was not created for the current upload request.");
  }
}

export const createUploadIntent = internalMutation({
  args: { userId: v.id("users") },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args) => {
    const userId = args.userId;
    const customer = await customerForAuthUser(ctx, userId);
    if (customer === null || !isActiveCustomer(customer)) {
      throw new Error("Active account required.");
    }

    const now = Date.now();
    const previousIntents = await ctx.db
      .query("cardOrderDesignUploads")
      .withIndex("by_ownerId_and_status", (query) =>
        query.eq("ownerId", customer._id).eq("status", "pending"),
      )
      .take(2);
    if (previousIntents.some((intent) => now - intent.createdAt < PENDING_INTENT_TTL_MS)) {
      throw new Error("A card design upload is already being processed.");
    }
    for (const intent of previousIntents) await ctx.db.delete(intent._id);

    const processingIntent = await ctx.db
      .query("cardOrderDesignUploads")
      .withIndex("by_ownerId_and_status", (query) =>
        query.eq("ownerId", customer._id).eq("status", "processing"),
      )
      .first();
    if (
      processingIntent !== null &&
      now - (processingIntent.processingAt ?? processingIntent.createdAt) < PROCESSING_INTENT_TTL_MS
    ) {
      throw new Error("A card design upload is already being processed.");
    }
    if (processingIntent !== null)
      throw new Error("A previous card design upload is still being cleaned up.");

    const uploadId = await ctx.db.insert("cardOrderDesignUploads", {
      ownerId: customer._id,
      scope: customer.scope,
      status: "pending",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(PENDING_INTENT_TTL_MS, internal.cardOrderDesigns.cleanup, {
      uploadId,
    });
    return uploadId;
  },
});

export const prepareUpload = internalMutation({
  args: {
    uploadId: v.id("cardOrderDesignUploads"),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.uploadId);
    const customer = intent === null ? null : await ctx.db.get(intent.ownerId);
    if (
      customer === null ||
      !isActiveCustomer(customer) ||
      intent === null ||
      intent.status !== "pending" ||
      !sameScope(customer, intent)
    ) {
      throw new Error("Start a new card design upload.");
    }
    if (Date.now() - intent.createdAt >= PENDING_INTENT_TTL_MS) {
      throw new Error("This upload request expired. Start a new upload.");
    }
    await assertStorageWasNotCreatedBeforeIntent(ctx, args.storageId, intent.createdAt);
    if (!(await storageIsUnreferenced(ctx, args.storageId))) {
      throw new Error("This file is already in use.");
    }
    const fileName = args.fileName.trim().slice(0, 255);
    if (!fileName) throw new Error("The file name is required.");
    await ctx.db.patch(intent._id, {
      status: "processing",
      processingAt: Date.now(),
      storageId: args.storageId,
      fileName,
    });
    return intent._id;
  },
});

export const getProcessingUpload = internalQuery({
  args: { uploadId: v.id("cardOrderDesignUploads") },
  returns: v.union(v.null(), schema.doc("cardOrderDesignUploads")),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    return upload?.status === "processing" ? upload : null;
  },
});

export const register = internalMutation({
  args: {
    uploadId: v.id("cardOrderDesignUploads"),
    contentType: v.union(v.literal("image/jpeg"), v.literal("image/png")),
    byteSize: v.number(),
  },
  returns: v.id("cardOrderDesignUploads"),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.uploadId);
    const customer = intent === null ? null : await ctx.db.get(intent.ownerId);
    if (
      customer === null ||
      !isActiveCustomer(customer) ||
      intent === null ||
      intent.status !== "processing" ||
      intent.ownerId !== customer._id ||
      !sameScope(customer, intent) ||
      intent.processingAt === undefined ||
      intent.storageId === undefined ||
      Date.now() - intent.processingAt >= PROCESSING_INTENT_TTL_MS
    ) {
      throw new Error("This upload request is no longer available.");
    }
    await assertStorageWasNotCreatedBeforeIntent(ctx, intent.storageId, intent.createdAt);
    if (!(await storageIsUnreferenced(ctx, intent.storageId, intent._id))) {
      throw new Error("This file is already in use.");
    }

    await ctx.db.patch(intent._id, {
      contentType: args.contentType,
      byteSize: args.byteSize,
      status: "available",
      processingAt: undefined,
      availableAt: Date.now(),
    });
    await ctx.scheduler.runAfter(DAY_MS, internal.cardOrderDesigns.cleanup, {
      uploadId: intent._id,
    });
    return intent._id;
  },
});

export const cleanup = internalMutation({
  args: { uploadId: v.id("cardOrderDesignUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (upload === null) return null;

    const now = Date.now();
    if (upload.status === "pending") {
      if (now - upload.createdAt >= PENDING_INTENT_TTL_MS) await ctx.db.delete(upload._id);
      return null;
    }
    if (upload.status === "processing") {
      const processingAt = upload.processingAt ?? upload.createdAt;
      const age = now - processingAt;
      if (age < PROCESSING_INTENT_TTL_MS) {
        await ctx.scheduler.runAfter(
          PROCESSING_INTENT_TTL_MS - age,
          internal.cardOrderDesigns.cleanup,
          { uploadId: upload._id },
        );
        return null;
      }

      const customer = await ctx.db.get(upload.ownerId);
      if (upload.storageId !== undefined && customer !== null && sameScope(customer, upload)) {
        const metadata = await ctx.db.system.get("_storage", upload.storageId);
        if (
          metadata !== null &&
          metadata._creationTime >= upload.createdAt &&
          (await storageIsUnreferenced(ctx, upload.storageId, upload._id))
        ) {
          const currentUpload = await ctx.db.get(upload._id);
          const currentOwner = await ctx.db.get(upload.ownerId);
          if (
            currentUpload !== null &&
            currentUpload.status === "processing" &&
            currentUpload.storageId === upload.storageId &&
            currentUpload.processingAt === upload.processingAt &&
            currentUpload.createdAt === upload.createdAt &&
            Date.now() - (currentUpload.processingAt ?? currentUpload.createdAt) >=
              PROCESSING_INTENT_TTL_MS &&
            currentOwner !== null &&
            currentOwner._id === upload.ownerId &&
            sameScope(currentOwner, currentUpload)
          ) {
            await ctx.storage.delete(currentUpload.storageId);
          }
        }
      }

      const currentIntent = await ctx.db.get(upload._id);
      if (
        currentIntent !== null &&
        currentIntent.status === "processing" &&
        currentIntent.ownerId === upload.ownerId &&
        currentIntent.createdAt === upload.createdAt &&
        currentIntent.processingAt === upload.processingAt &&
        Date.now() - (currentIntent.processingAt ?? currentIntent.createdAt) >=
          PROCESSING_INTENT_TTL_MS
      ) {
        await ctx.db.delete(currentIntent._id);
      }
      return null;
    }
    const customer = await ctx.db.get(upload.ownerId);
    if (customer === null || !sameScope(customer, upload)) return null;
    if (
      upload.status !== "available" ||
      now - (upload.availableAt ?? upload.createdAt) < DAY_MS ||
      upload.storageId === undefined
    ) {
      return null;
    }

    const metadata = await ctx.db.system.get("_storage", upload.storageId);
    if (metadata === null || metadata._creationTime < upload.createdAt) return null;
    if (!(await storageIsUnreferenced(ctx, upload.storageId, upload._id))) return null;

    const currentUpload = await ctx.db.get(upload._id);
    const currentOwner = await ctx.db.get(upload.ownerId);
    if (
      currentUpload === null ||
      currentUpload.status !== "available" ||
      currentUpload.storageId !== upload.storageId ||
      currentUpload.ownerId !== upload.ownerId ||
      currentUpload.availableAt !== upload.availableAt ||
      currentUpload.createdAt !== upload.createdAt ||
      currentOwner === null ||
      currentOwner._id !== upload.ownerId ||
      !sameScope(currentOwner, currentUpload)
    ) {
      return null;
    }

    await ctx.db.delete(currentUpload._id);
    await ctx.storage.delete(currentUpload.storageId);
    return null;
  },
});

export const cleanupFailedUpload = internalMutation({
  args: {
    uploadId: v.id("cardOrderDesignUploads"),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.uploadId);
    if (intent === null) {
      if (args.storageId !== undefined) {
        const metadata = await ctx.db.system.get("_storage", args.storageId);
        if (metadata !== null && (await storageIsUnreferenced(ctx, args.storageId))) {
          await ctx.storage.delete(args.storageId);
        }
      }
      return null;
    }
    if (
      intent.storageId !== undefined &&
      args.storageId !== undefined &&
      intent.storageId !== args.storageId
    ) {
      return null;
    }
    const storageId = intent.storageId ?? args.storageId;
    if (intent.status !== "processing" && intent.status !== "pending") return null;
    if (intent.status === "processing" && intent.processingAt === undefined) return null;
    const customer = await ctx.db.get(intent.ownerId);
    if (customer === null || !sameScope(customer, intent)) return null;

    const currentIntent = await ctx.db.get(intent._id);
    if (
      currentIntent === null ||
      (currentIntent.status !== "processing" && currentIntent.status !== "pending") ||
      currentIntent.ownerId !== intent.ownerId ||
      currentIntent.createdAt !== intent.createdAt ||
      currentIntent.processingAt !== intent.processingAt ||
      (currentIntent.storageId !== undefined && currentIntent.storageId !== storageId)
    ) {
      return null;
    }

    if (storageId !== undefined) {
      const metadata = await ctx.db.system.get("_storage", storageId);
      if (
        metadata !== null &&
        metadata._creationTime >= intent.createdAt &&
        (await storageIsUnreferenced(ctx, storageId, intent._id))
      ) {
        await ctx.storage.delete(storageId);
      }
    }
    await ctx.db.delete(currentIntent._id);
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
    upload.storageId === undefined ||
    upload.orderId !== undefined ||
    upload.ownerId !== customer._id ||
    order.customerId !== customer._id ||
    !(
      (order.designSource.kind === "upload" && order.designSource.uploadId === uploadId) ||
      (order.backDesignSource?.kind === "upload" && order.backDesignSource.uploadId === uploadId)
    ) ||
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
  side: "front" | "back" = "front",
) {
  const source = side === "front" ? order.designSource : order.backDesignSource;
  if (source === undefined) return undefined;
  if (
    source.kind !== "upload" ||
    order.customerId !== customer._id ||
    !sameScope(customer, order)
  ) {
    return undefined;
  }
  const upload = await ctx.db.get(source.uploadId);
  if (
    upload === null ||
    upload.status !== "attached" ||
    upload.orderId !== order._id ||
    upload.ownerId !== customer._id ||
    upload.storageId === undefined ||
    !sameScope(customer, upload) ||
    !sameScope(order, upload)
  ) {
    return undefined;
  }
  return (await ctx.storage.getUrl(upload.storageId)) ?? undefined;
}

export const customerDesignUrl = query({
  args: {
    orderId: v.id("cardOrders"),
    side: v.optional(v.union(v.literal("front"), v.literal("back"))),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const customer = await customerForAuthUser(ctx, userId);
    if (customer === null || !isActiveCustomer(customer)) {
      throw new Error("Active account required.");
    }
    const order = await ctx.db.get(args.orderId);
    if (order === null || order.customerId !== customer._id || !sameScope(customer, order)) {
      return null;
    }
    return (await orderDesignUrl(ctx, customer, order, args.side ?? "front")) ?? null;
  },
});

export const adminDesignUrl = query({
  args: {
    orderId: v.id("cardOrders"),
    side: v.optional(v.union(v.literal("front"), v.literal("back"))),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { account: administrator } = await requireAdministrator(ctx);
    const order = await ctx.db.get(args.orderId);
    if (order === null || !sameScope(administrator, order)) return null;
    const customer = await ctx.db.get(order.customerId);
    if (customer === null || !sameScope(administrator, customer) || !sameScope(customer, order)) {
      return null;
    }
    return (await orderDesignUrl(ctx, customer, order, args.side ?? "front")) ?? null;
  },
});
