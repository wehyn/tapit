import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireAdministrator, sameScope } from "./admin";

const BACKFILL_KEY = "customerSetupStateBackfill";
const CUSTOMER_PAGE_SIZE = 1;
const INVITATION_PAGE_SIZE = 100;
const STALE_AFTER_MS = 5 * 60 * 1000;

const customerBatchArgs = {
  scope: v.optional(v.literal("demo")),
  cursor: v.union(v.string(), v.null()),
};

const invitationBatchArgs = {
  scope: v.optional(v.literal("demo")),
  customerId: v.id("customers"),
  cursorAfterCustomer: v.union(v.string(), v.null()),
  isLastCustomer: v.boolean(),
  invitationCursor: v.union(v.string(), v.null()),
  hasPreparedSetup: v.boolean(),
  latestLiveInvitationId: v.optional(v.id("invitations")),
  latestLiveExpiresAt: v.optional(v.number()),
  hasCustomerSnapshot: v.optional(v.boolean()),
  snapshotSetupState: v.optional(
    v.union(v.null(), v.literal("waiting"), v.literal("draft"), v.literal("active")),
  ),
  snapshotSetupExpiryInvitationId: v.optional(v.id("invitations")),
  snapshotSetupExpiresAt: v.optional(v.number()),
};

export const status = query({
  args: {},
  returns: v.object({
    state: v.union(
      v.literal("not_started"),
      v.literal("running"),
      v.literal("stalled"),
      v.literal("ready"),
    ),
  }),
  handler: async (ctx) => {
    const { account } = await requireAdministrator(ctx);
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", account.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value === "completed") return { state: "ready" as const };
    if (marker?.value === "running") return { state: "running" as const };
    if (marker?.value === "stalled") return { state: "stalled" as const };
    return { state: "not_started" as const };
  },
});

export const start = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { userId, account } = await requireAdministrator(ctx);
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", account.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value === "completed" || marker?.value === "running") return null;

    const now = Date.now();
    if (marker === null) {
      await ctx.db.insert("settings", {
        ...(account.scope === undefined ? {} : { scope: account.scope }),
        key: BACKFILL_KEY,
        value: "running",
        updatedAt: now,
        updatedByUserId: userId,
      });
    } else {
      await ctx.db.patch(marker._id, { value: "running", updatedAt: now, updatedByUserId: userId });
    }
    await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
      ...(account.scope === undefined ? {} : { scope: account.scope }),
      cursor: null,
    });
    await ctx.scheduler.runAfter(STALE_AFTER_MS, internal.customerSetupStateBackfill.markStalled, {
      ...(account.scope === undefined ? {} : { scope: account.scope }),
      expectedUpdatedAt: now,
    });
    return null;
  },
});

export const markStalled = internalMutation({
  args: {
    scope: v.optional(v.literal("demo")),
    expectedUpdatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value !== "running") return null;

    const now = Date.now();
    if (marker.updatedAt !== args.expectedUpdatedAt) {
      const delay = Math.max(0, marker.updatedAt + STALE_AFTER_MS - now);
      await ctx.scheduler.runAfter(delay, internal.customerSetupStateBackfill.markStalled, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        expectedUpdatedAt: marker.updatedAt,
      });
      return null;
    }
    if (now - marker.updatedAt < STALE_AFTER_MS) {
      await ctx.scheduler.runAfter(
        marker.updatedAt + STALE_AFTER_MS - now,
        internal.customerSetupStateBackfill.markStalled,
        args,
      );
      return null;
    }
    await ctx.db.patch(marker._id, { value: "stalled", updatedAt: now });
    return null;
  },
});

export const runBatch = internalMutation({
  args: customerBatchArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value !== "running") return null;

    const customerPage = await ctx.db
      .query("customers")
      .withIndex("by_scope", (q) => q.eq("scope", args.scope))
      .paginate({ cursor: args.cursor, numItems: CUSTOMER_PAGE_SIZE });
    const customer = customerPage.page[0];
    const now = Date.now();
    if (customer === undefined) {
      await ctx.db.patch(marker._id, { value: "completed", updatedAt: now });
      return null;
    }

    await ctx.db.patch(marker._id, { updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.processInvitationBatch, {
      ...(args.scope === undefined ? {} : { scope: args.scope }),
      customerId: customer._id,
      cursorAfterCustomer: customerPage.continueCursor,
      isLastCustomer: customerPage.isDone,
      invitationCursor: null,
      hasPreparedSetup: false,
      hasCustomerSnapshot: true,
      ...(customer.setupState === undefined ? {} : { snapshotSetupState: customer.setupState }),
      ...(customer.setupExpiryInvitationId === undefined
        ? {}
        : { snapshotSetupExpiryInvitationId: customer.setupExpiryInvitationId }),
      ...(customer.setupExpiresAt === undefined
        ? {}
        : { snapshotSetupExpiresAt: customer.setupExpiresAt }),
    });
    return null;
  },
});

export const processInvitationBatch = internalMutation({
  args: invitationBatchArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const marker = await ctx.db
      .query("settings")
      .withIndex("by_scope_and_key", (q) => q.eq("scope", args.scope).eq("key", BACKFILL_KEY))
      .first();
    if (marker?.value !== "running") return null;

    const customer = await ctx.db.get(args.customerId);
    const now = Date.now();
    if (customer === null) {
      await ctx.db.patch(marker._id, { updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        cursor: args.cursorAfterCustomer,
      });
      return null;
    }
    const snapshotSetupState =
      args.hasCustomerSnapshot === true ? args.snapshotSetupState : customer.setupState;
    const snapshotSetupExpiryInvitationId =
      args.hasCustomerSnapshot === true
        ? args.snapshotSetupExpiryInvitationId
        : customer.setupExpiryInvitationId;
    const snapshotSetupExpiresAt =
      args.hasCustomerSnapshot === true ? args.snapshotSetupExpiresAt : customer.setupExpiresAt;

    const finishCustomer = async (
      setupState: "active" | "waiting" | "draft" | null,
      setupExpiryInvitationId?: Id<"invitations">,
      setupExpiresAt?: number,
    ) => {
      await ctx.db.patch(customer._id, {
        setupState,
        setupExpiryInvitationId,
        setupExpiresAt,
      });
      if (args.isLastCustomer) {
        await ctx.db.patch(marker._id, { value: "completed", updatedAt: now });
      } else {
        await ctx.db.patch(marker._id, { updatedAt: now });
        await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
          ...(args.scope === undefined ? {} : { scope: args.scope }),
          cursor: args.cursorAfterCustomer,
        });
      }
    };

    if (customer.demoResetInProgress === true) {
      await finishCustomer(null);
      return null;
    }
    if (customer.userId !== undefined && customer.status === "active") {
      await finishCustomer("active");
      return null;
    }

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_customerId_and_kind", (q) =>
        q.eq("customerId", customer._id).eq("kind", "prepared_setup"),
      )
      .paginate({ cursor: args.invitationCursor, numItems: INVITATION_PAGE_SIZE });
    let hasPreparedSetup = args.hasPreparedSetup;
    let latestLiveInvitationId = args.latestLiveInvitationId;
    let latestLiveExpiresAt = args.latestLiveExpiresAt;
    for (const invitation of invitations.page) {
      if (!sameScope(customer, invitation)) continue;
      hasPreparedSetup = true;
      const live =
        invitation.usedAt === undefined &&
        invitation.acceptedAt === undefined &&
        invitation.invalidatedAt === undefined &&
        invitation.expiresAt !== undefined &&
        invitation.expiresAt > now;
      if (
        live &&
        (latestLiveExpiresAt === undefined || invitation.expiresAt! > latestLiveExpiresAt)
      ) {
        latestLiveInvitationId = invitation._id;
        latestLiveExpiresAt = invitation.expiresAt;
      }
    }

    if (!invitations.isDone) {
      await ctx.db.patch(marker._id, { updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.processInvitationBatch, {
        ...args,
        invitationCursor: invitations.continueCursor,
        hasPreparedSetup,
        ...(latestLiveInvitationId === undefined ? {} : { latestLiveInvitationId }),
        ...(latestLiveExpiresAt === undefined ? {} : { latestLiveExpiresAt }),
        hasCustomerSnapshot: true,
        ...(snapshotSetupState === undefined ? {} : { snapshotSetupState }),
        ...(snapshotSetupExpiryInvitationId === undefined
          ? {}
          : { snapshotSetupExpiryInvitationId }),
        ...(snapshotSetupExpiresAt === undefined ? {} : { snapshotSetupExpiresAt }),
      });
      return null;
    }

    const currentCustomer = await ctx.db.get(customer._id);
    if (currentCustomer === null) {
      await ctx.db.patch(marker._id, { updatedAt: now });
      await ctx.scheduler.runAfter(0, internal.customerSetupStateBackfill.runBatch, {
        ...(args.scope === undefined ? {} : { scope: args.scope }),
        cursor: args.cursorAfterCustomer,
      });
      return null;
    }
    const scanInvitation =
      latestLiveInvitationId === undefined ? null : await ctx.db.get(latestLiveInvitationId);
    const scanCandidateIsLive =
      scanInvitation !== null &&
      scanInvitation.kind === "prepared_setup" &&
      sameScope(currentCustomer, scanInvitation) &&
      scanInvitation.usedAt === undefined &&
      scanInvitation.acceptedAt === undefined &&
      scanInvitation.invalidatedAt === undefined &&
      scanInvitation.expiresAt === latestLiveExpiresAt &&
      scanInvitation.expiresAt !== undefined &&
      scanInvitation.expiresAt > now;
    const lifecycleChanged =
      currentCustomer.setupState !== snapshotSetupState ||
      currentCustomer.setupExpiryInvitationId !== snapshotSetupExpiryInvitationId ||
      currentCustomer.setupExpiresAt !== snapshotSetupExpiresAt;
    const currentExpiryInvitation =
      currentCustomer.setupState === "waiting" &&
      currentCustomer.setupExpiryInvitationId !== undefined
        ? await ctx.db.get(currentCustomer.setupExpiryInvitationId)
        : null;
    const currentCandidateIsLive =
      currentExpiryInvitation !== null &&
      currentExpiryInvitation.kind === "prepared_setup" &&
      sameScope(currentCustomer, currentExpiryInvitation) &&
      currentExpiryInvitation.usedAt === undefined &&
      currentExpiryInvitation.acceptedAt === undefined &&
      currentExpiryInvitation.invalidatedAt === undefined &&
      currentExpiryInvitation.expiresAt === currentCustomer.setupExpiresAt &&
      currentExpiryInvitation.expiresAt !== undefined &&
      currentExpiryInvitation.expiresAt > now;
    const indexedLiveInvitation = await ctx.db
      .query("invitations")
      .withIndex("by_customerId_kind_scope_invalidatedAt_acceptedAt_usedAt_expires", (q) =>
        q
          .eq("customerId", currentCustomer._id)
          .eq("kind", "prepared_setup")
          .eq("scope", currentCustomer.scope)
          .eq("invalidatedAt", undefined)
          .eq("acceptedAt", undefined)
          .eq("usedAt", undefined)
          .gt("expiresAt", now),
      )
      .order("desc")
      .first();
    const liveInvitation =
      [
        currentCandidateIsLive ? currentExpiryInvitation : null,
        scanCandidateIsLive ? scanInvitation : null,
        indexedLiveInvitation !== null && sameScope(currentCustomer, indexedLiveInvitation)
          ? indexedLiveInvitation
          : null,
      ]
        .filter((invitation): invitation is NonNullable<typeof invitation> => invitation !== null)
        .sort((left, right) => (right.expiresAt ?? 0) - (left.expiresAt ?? 0))[0] ?? null;
    const hasPreparedByBackfill =
      hasPreparedSetup ||
      (scanInvitation !== null && sameScope(currentCustomer, scanInvitation)) ||
      (currentExpiryInvitation !== null &&
        currentExpiryInvitation.kind === "prepared_setup" &&
        sameScope(currentCustomer, currentExpiryInvitation)) ||
      indexedLiveInvitation !== null;
    const derivedState = currentCustomer.demoResetInProgress
      ? null
      : currentCustomer.userId !== undefined && currentCustomer.status === "active"
        ? "active"
        : hasPreparedByBackfill
          ? liveInvitation !== null
            ? "waiting"
            : "draft"
          : null;
    const currentState = currentCustomer.setupState;
    const setupState =
      !lifecycleChanged || currentState === undefined || currentState === "waiting"
        ? derivedState
        : currentState;
    if (
      setupState === "waiting" &&
      liveInvitation !== null &&
      liveInvitation.setupExpiryScheduled !== true
    ) {
      await ctx.db.patch(liveInvitation._id, { setupExpiryScheduled: true });
      await ctx.scheduler.runAt(liveInvitation.expiresAt!, internal.customers.expirePreparedSetup, {
        customerId: currentCustomer._id,
        invitationId: liveInvitation._id,
      });
    }
    await finishCustomer(
      setupState,
      setupState === "waiting" ? liveInvitation?._id : undefined,
      setupState === "waiting" ? liveInvitation?.expiresAt : undefined,
    );
    return null;
  },
});
