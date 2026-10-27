# Admin Card Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let active administrators use the existing card ordering flow with orders and uploaded artwork owned by their own account.

**Issue:** [#159](https://github.com/wehyn/tapit/issues/159)

**Architecture:** Reuse the existing `/app/card/order-card` flow and existing `cardOrders.customerId` ownership field. Permit active admin accounts at the shared order and upload authorization gates, preserving server-derived identity, same-scope checks, and per-account order/design access. Apply the same rules in local demo mode; keep the admin Orders queue as the cross-account operations view.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, Convex Auth, existing local demo state and IndexedDB artwork storage.

---

### Task 1: Allow active administrator accounts through the Convex order gate

**Files:**

- Modify: `convex/cardOrderSettings.ts`
- Modify: `convex/cardOrders.ts`

- [x] Rename `activeOrderCustomer` to `activeOrderAccount` and change its guard to require an authenticated active account without rejecting `role: "admin"`:

```ts
export async function activeOrderAccount(ctx: QueryCtx | MutationCtx) {
  const userId = await requireUser(ctx);
  const account = await customerForAuthUser(ctx, userId);
  if (account === null || !isActiveCustomer(account)) {
    throw new Error("Active account required.");
  }
  return account;
}
```

- [x] Update callers in `cardOrderSettings.ts` and `cardOrders.ts`; keep the public query names and order record shape unchanged.
- [x] Keep `myOrders` indexed by the identity-derived account ID so admins see only their own orders through `/app/card`.

### Task 2: Allow administrators to upload and read their own order artwork

**Files:**

- Modify: `convex/cardOrderDesigns.ts`

- [x] In `createUploadIntent`, `prepareUpload`, `register`, and `customerDesignUrl`, accept any active account instead of requiring `role === "customer"`.
- [x] Preserve upload owner IDs, matching-account checks, scope checks, upload lifecycle validation, cleanup, and the admin-only `adminDesignUrl` behavior.

### Task 3: Enable administrator access in the shared order page

**Files:**

- Modify: `src/components/card-order/OrderCardExperience.tsx`

- [x] Allow active admin accounts through both the local demo and Convex branches.
- [x] Keep the existing order form, settings, referral validation, submission, and order history; update the customer-only denial copy to say ordering requires an active account.

### Task 4: Mirror account ownership in local demo ordering and artwork storage

**Files:**

- Modify: `src/lib/demo/card-ordering.ts`
- Modify: `src/lib/demo/card-order-assets.ts`

- [x] Use the active demo account for order settings, referral preview, order submission, and personal order history; allow both `customer` and `admin` roles.
- [x] Allow both roles to save, reserve, attach, and read only artwork whose `ownerId` matches that account. Preserve asset locks, rollback, admin operations, and cross-account isolation.

### Task 5: Keep the admin card-claim fix and verify the branch diff

**Files:**

- Modify: `convex/cards.ts`

- [x] Keep the previously prepared change that allows an active admin-owned profile to receive an attached card; do not remove its scope, lifecycle, or profile ownership checks.
- [x] Run `git diff --check` and review all changed call sites for the account-only order path.
- [x] Do not add or run tests unless requested.

### Task 6: Publish the branch reference and create the requested issue

**Files:**

- Create: GitHub issue in `wehyn/tapit`

- [x] Commit the implementation on the existing `t3/limit-card-owner-access` branch.
- [x] Push that branch if it is not already available on `origin`.
- [x] Create an issue describing admin card ownership, claim, and order access; include the branch URL in the issue body so the issue directly references this branch.

**Not included:** Deploying to the Production Convex deployment. A production deploy requires a separate explicit go-ahead after the final diff is ready.
