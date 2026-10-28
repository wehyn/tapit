# Resettable Demo Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the staged Customer → Demo → Administrator promotion path and let Demo customers reset their Tapit data, linked cards, and onboarding while retaining their sign-in identity.

**Architecture:** Store Demo as an account marker separate from `customers.role` and hosted-demo `scope`. Make administrator promotion require Demo, then clear the marker while preserving account data. Add an owner-only reset that marks the account as resetting, reuses the bounded account-data cleanup used by erasure, deletes Demo-owned cards, preserves the Convex Auth identity and customer row, and finishes in pending onboarding state. Mirror the account transitions, cleanup, and re-onboarding in local demo storage.

**Tech Stack:** Next.js 16, React 19, Convex 1.45 / Convex Auth, browser-local demo storage and IndexedDB, Vitest/convex-test, Playwright.

---

## File map

- `convex/schema.ts` — optional Demo marker and reset-in-progress state on customer records; do not reuse `scope: "demo"`, which identifies hosted-demo data.
- `convex/customers.ts` — admin-only Demo promotion, staged role transition, owner-only reset start, and onboarding completion guard.
- `convex/accountErasure.ts` — shared bounded deletion of account-owned product data; preserve permanent erasure behavior and add reset finalization that keeps Auth and the customer row.
- `convex/admin.ts` — expose reset progress in `currentAccess` so onboarding cannot start before cleanup finishes.
- `src/lib/demo/fixtures.ts` and `src/lib/demo/store.ts` — local Demo marker, pending/resetting state, staged promotion, per-account reset, and same-account re-onboarding.
- `src/lib/demo/card-order-assets.ts` and `src/lib/demo/card-order-receipts.ts` — owner-scoped IndexedDB cleanup for reset, retaining shared administrator payment QR assets and the existing deletion-approval guard.
- `src/components/admin/CustomersManager.tsx` — Demo badge and Customer → Demo → Administrator actions in both local and Convex modes.
- `src/components/forms/AccountSettings.tsx` — show Reset account for Demo customers and preserve the ordinary customer deletion flow.
- `src/components/auth/LoginForm.tsx`, `src/app/onboarding/page.tsx`, and a local-demo onboarding component — route a reset local account back through profile setup without creating a second local identity.
- `src/components/auth/OnboardingForm.tsx` — show a reset-in-progress state and use the existing Convex onboarding mutation only after cleanup completes.
- `convex/integration/auth-ownership.test.ts` — staged role transitions and authorization.
- `convex/integration/demo-account-reset.test.ts` — new reset, cleanup, identity-preservation, and re-onboarding coverage.
- `convex/integration/card-order-receipt-erasure.test.ts` and `convex/integration/retention.test.ts` — protect permanent-erasure behavior while sharing cleanup code.
- `tests/unit/admin-auth-pagination.test.tsx`, `tests/unit/demo-storage-store.test.ts`, and `tests/unit/auth-flow.test.tsx` — manager actions, local state compatibility, and account settings.
- `tests/unit/demo-account-reset.test.ts` — new local reset and sidecar cleanup coverage.
- `e2e/admin.spec.ts`, `e2e/customer.spec.ts`, `docs/spec.md`, and `docs/CHANGELOG.md` — deterministic browser proof, product behavior, and user-visible change note.

## Sequencing and file ownership

- Tasks 1, 3, and 4 touch the same Convex schema/customer lifecycle. Keep them with one owner or complete them in sequence; run codegen and the reset integration test only after Task 4 defines `internal.accountErasure.resetDemoAccountPass`.
- Tasks 2 and 5 share the local customer/store and reset tests. Keep them with one owner or complete them in sequence.
- Tasks 6 and 7 can start after the backend and local APIs they call exist. Do not let separate workers stage or commit another task's files.

## Task 1: Add the Convex Demo marker and enforce staged promotion

**Files:** `convex/schema.ts`, `convex/customers.ts`, `convex/integration/auth-ownership.test.ts`

- [ ] Add a test proving a normal customer cannot be promoted directly to admin, then can move through Demo to admin. Keep the last-admin demotion assertion in the existing role test.

```ts
await expect(
  admin.mutation(api.customers.setRole, { customerId: data.ownerCustomerId, role: "admin" }),
).rejects.toThrow(/Demo/);
await admin.mutation(api.customers.promoteToDemo, { customerId: data.ownerCustomerId });
await admin.mutation(api.customers.setRole, { customerId: data.ownerCustomerId, role: "admin" });
const promoted = await t.run((ctx) => ctx.db.get(data.ownerCustomerId));
expect(promoted).toMatchObject({ role: "admin", userId: data.ownerUserId });
expect(promoted?.isDemo).toBeUndefined();
```

- [ ] Run `npx vitest run convex/integration/auth-ownership.test.ts`; confirm the new test fails because Demo promotion is not implemented.
- [ ] Add `isDemo: v.optional(v.boolean())` to `customers` in `convex/schema.ts`. Add an admin-only `promoteToDemo` mutation in `convex/customers.ts` that requires an active same-scope customer, leaves `role: "customer"`, sets `isDemo: true`, and writes an audit event.
- [ ] Enforce `target.role === "customer"` server-side and test that administrators cannot be marked Demo.
- [ ] Update `setRole` so customer→admin requires `isDemo === true` and clears the marker; admin→customer clears the marker and keeps the last-active-admin guard. Preserve the target’s `userId`, profile, and other customer data on promotion.
- [ ] Keep the transition checks in this shape so the rule remains server-enforced:

```ts
if (target.role === "customer" && args.role === "admin" && target.isDemo !== true) {
  throw new Error("Promote the customer to Demo first.");
}
await ctx.db.patch(target._id, { role: args.role, isDemo: undefined, updatedAt: Date.now() });
```

- [ ] Run `npx convex codegen`, then `npx vitest run convex/integration/auth-ownership.test.ts`; expect the staged transition and existing role/audit tests to pass.
- [ ] Commit as `feat: enforce staged demo account promotion`.

## Task 2: Add local promotion state and expose both admin actions

**Files:** `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `src/components/admin/CustomersManager.tsx`, `tests/unit/demo-storage-store.test.ts`, `tests/unit/admin-auth-pagination.test.tsx`

- [ ] Add unit assertions for a stored customer with no `isDemo` field, customer→Demo, and Demo→admin. Confirm local promotion keeps account data and that old localStorage records still load.
- [ ] Run `npx vitest run tests/unit/demo-storage-store.test.ts tests/unit/admin-auth-pagination.test.tsx`; confirm the new promotion assertions fail first.
- [ ] Add optional `isDemo` to `DemoCustomer`; let the store validator accept the missing field so existing browser storage remains compatible. Add local admin-only store operations mirroring the Convex transition rules and audit the transitions.
- [ ] Keep the stored marker optional for pre-existing accounts:

```ts
export type DemoCustomer = {
  id: string;
  email: string;
  role: "customer" | "admin";
  profileId?: string;
  status: "invited" | "pending" | "active" | "deleted";
  deletionStatus: "active" | "requested" | "deleted";
  setupToken?: string;
  passwordHash?: string;
  claimedCardIds?: string[];
  cardOwnerAccessOverride?: boolean;
  isDemo?: boolean;
  demoResetInProgress?: boolean;
};
```

- [ ] Update both managers in `CustomersManager.tsx`: active ordinary customer gets **Promote to Demo**; active Demo customer gets **Promote to Administrator**; show a Demo label; keep **Demote to customer** for administrators. Define `promoteToDemo` and `promoteToAdmin` handlers; wire them to Convex `promoteToDemo` / `setRole` and the local guarded store operations. Do not render a direct customer→admin action.
- [ ] Gate the two customer actions on the state, not just the account role:

```tsx
{
  customer.status === "active" && customer.role === "customer" && !customer.isDemo ? (
    <Button onClick={() => promoteToDemo(customer)}>Promote to Demo</Button>
  ) : null;
}
{
  customer.status === "active" && customer.role === "customer" && customer.isDemo ? (
    <Button onClick={() => promoteToAdmin(customer)}>Promote to Administrator</Button>
  ) : null;
}
```

- [ ] Run `npx vitest run tests/unit/demo-storage-store.test.ts tests/unit/admin-auth-pagination.test.tsx`; expect local persistence and both action paths to pass.
- [ ] Commit as `feat: add staged demo promotion controls`.

## Task 3: Add the Convex reset lifecycle and protect the identity

**Files:** `convex/schema.ts`, `convex/customers.ts`, `convex/admin.ts`, `convex/integration/demo-account-reset.test.ts`

- [ ] Create `convex/integration/demo-account-reset.test.ts` with a signed-in Demo owner and assertions that reset derives the owner from Auth, rejects non-Demo accounts (including `scope: "demo"` accounts without `isDemo: true`), and does not accept a customer ID argument. Assert the existing `users` and `authAccounts` records survive.
- [ ] Run `npx vitest run convex/integration/demo-account-reset.test.ts`; confirm the reset mutation is not yet available.
- [ ] Add `demoResetInProgress: v.optional(v.boolean())` to the customer schema. Add `resetDemoAccount` in `convex/customers.ts` with no customer ID argument: use `requireUser`, find the account through `customers.by_userId`, require an active Demo customer, mark it `status: "pending"` and `demoResetInProgress: true`, unpublish its profile, and schedule `internal.accountErasure.resetDemoAccountPass`.
- [ ] Start reset only from the authenticated owner’s Demo account:

```ts
const userId = await requireUser(ctx);
const customer = await ctx.db
  .query("customers")
  .withIndex("by_userId", (q) => q.eq("userId", userId))
  .unique();
if (
  customer === null ||
  customer.role !== "customer" ||
  customer.isDemo !== true ||
  customer.status !== "active" ||
  customer.deletionStatus !== "active"
)
  throw new Error("Active Demo account required.");
```

- [ ] Return `demoResetInProgress` from `admin.currentAccess` and its internal counterpart. Make `completeSelfServiceOnboarding` reject while reset is in progress and accept the account again only after reset finalization leaves it pending with no profile.
- [ ] Defer codegen and the reset integration test until Task 4 adds `internal.accountErasure.resetDemoAccountPass`; then run both tasks' Convex tests together.

## Task 4: Reuse bounded Convex cleanup without deleting Auth or unrelated records

**Files:** `convex/accountErasure.ts`, `convex/profileStorageReferences.ts`, `convex/integration/demo-account-reset.test.ts`, `convex/integration/card-order-receipt-erasure.test.ts`, `convex/integration/retention.test.ts`

- [ ] Extend the new integration fixture with profile links/media, analytics, a claimed card and challenge, a card order with receipt/design upload, and an unrelated customer/card. Include a shared storage reference.
- [ ] Assert completion through the existing scheduled-function test pattern: `await t.finishAllScheduledFunctions(vi.runAllTimers)`. Before implementation, run `npx vitest run convex/integration/demo-account-reset.test.ts` and confirm the cleanup assertions fail.
- [ ] Extract the bounded product-data cleanup from `eraseCustomerPass` into `eraseAccountDataPass(ctx, customerId, mode)` with `mode: "permanentDeletion" | "demoReset"`. Keep the existing approved-deletion gate and terminal Auth/customer deletion for `permanentDeletion`; require the Demo reset marker and preserve Auth/customer records for `demoReset`.
- [ ] Implement `resetDemoAccountPass` as a separate internal mutation. After each pass, schedule itself again only while the customer still has `demoResetInProgress === true`; the final pass clears that marker, preventing the retained customer row from causing an infinite cleanup loop.
- [ ] For reset mode, delete each Demo profile’s card rows only after its claim challenges and card audit references are removed. Keep the existing permanent-erasure behavior that deactivates/unassigns inventory. Use the existing storage reference inspection so files still referenced elsewhere survive.
- [ ] Keep `demoResetInProgress` set until profile image and media upload cleanup jobs have reconciled. If a profile still has upload jobs, start the existing cleanup path, retain reset state, and resume account cleanup after the final reconciliation removes its job; do not spin a zero-delay reset loop or expose onboarding early.
- [ ] Delete account-owned orders, receipt/design uploads, assets, profile media, links, analytics, profile data, and account-specific claim state. Keep global payment methods and shared payment QR assets. On the final pass, clear `profileId`, `onboardingName`, and `cardOwnerAccessOverride`, restore `deletionStatus: "active"`, clear reset progress, and leave `status: "pending"`, `role: "customer"`, `isDemo: true`, `userId`, and the Auth records intact.
- [ ] Run `npx vitest run convex/integration/demo-account-reset.test.ts convex/integration/card-order-receipt-erasure.test.ts convex/integration/retention.test.ts`; expect reset, shared-file safety, and unchanged approved deletion behavior to pass. Assert the retained customer still references the same `userId`, and complete onboarding as that authenticated user after cleanup.
- [ ] Commit as `feat: reset demo accounts without deleting auth`.

## Task 5: Add local per-account reset and same-identity re-onboarding

**Files:** `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `src/lib/demo/card-order-assets.ts`, `src/lib/demo/card-order-receipts.ts`, `src/components/auth/LoginForm.tsx`, `src/app/onboarding/page.tsx`, new `src/components/auth/DemoOnboardingForm.tsx`, `tests/unit/demo-account-reset.test.ts`, `tests/unit/demo-storage-store.test.ts`

- [ ] Add local tests for resetting one Demo account while preserving its email/password hash, Demo marker, and session; assert another customer, unrelated cards, shared payment settings, and unrelated files remain.
- [ ] Run `npx vitest run tests/unit/demo-account-reset.test.ts tests/unit/demo-storage-store.test.ts`; confirm pending local Demo accounts and their reset helper are missing.
- [ ] Extend local account validation to accept the optional Demo marker and a pending/resetting state without rejecting existing saved records. Implement a reset helper that derives the account from the current local session, sets `status: "pending"` and `demoResetInProgress: true`, retains its password hash and Demo marker, removes its profile-owned cards/claims, profile/links/media/analytics, profile theme, audits, and order data, then clears the progress marker and leaves the account pending for onboarding.
- [ ] In the store, derive the target from the current session and reject non-Demo or administrator accounts before changing persisted state:

```ts
const session = getDemoSession();
const account = session && getDemoState().customers.find((item) => item.email === session.email);
if (
  !account ||
  account.role !== "customer" ||
  account.isDemo !== true ||
  account.status !== "active" ||
  account.demoResetInProgress === true
) {
  throw new Error("Active Demo account required.");
}
```

- [ ] After marking reset in progress, authorize sidecar cleanup from the captured owner/session and the same account's reset marker inside the IndexedDB lock. Do not call the ordinary active-account access helper after reset begins.
- [ ] Reuse the existing locked IndexedDB order-asset/receipt cleanup, but add an owner-authorized reset path instead of calling `deleteDemoCardOrderAssetsForApprovedDeletion` without its approval check. Retain shared administrator QR assets and protect concurrent order-asset changes.
- [ ] Let a pending local Demo session route to `/onboarding`; render `DemoOnboardingForm` in local mode and complete the profile on the existing customer record rather than creating a duplicate account. Preserve the same local password and Demo marker. If the tab closes during cleanup, retain the reset marker, allow idempotent cleanup to resume on the next valid sign-in, and route to onboarding only after cleanup finishes. Leave hosted-demo and live onboarding paths unchanged.
- [ ] Test sign-out/reload, sign-in with the same credentials, interrupted sidecar cleanup recovery, and re-onboarding under the same identity.
- [ ] Run `npx vitest run tests/unit/demo-account-reset.test.ts tests/unit/demo-storage-store.test.ts`; expect old local storage, account isolation, sidecar cleanup, and re-onboarding tests to pass.
- [ ] Commit as `feat: reset local demo customer accounts`.

## Task 6: Add Reset account to settings without changing normal deletion

**Files:** `src/components/forms/AccountSettings.tsx`, `src/components/auth/OnboardingForm.tsx`, `tests/unit/auth-flow.test.tsx`

- [ ] Add settings tests that distinguish Demo and ordinary customers: Demo sees a confirmed **Reset account** action; a normal customer retains the existing **Delete Account** and deletion request flow. Assert cancellation does not invoke a mutation and a failed reset shows an error.
- [ ] Run `npx vitest run tests/unit/auth-flow.test.tsx`; confirm Demo settings currently use the deletion flow.
- [ ] Reuse the existing account action card and `ConfirmDialog` with Demo-specific copy and confirmation label. Call the local store reset in local mode and `api.customers.resetDemoAccount` in Convex mode. Keep the ordinary deletion request untouched.
- [ ] Select the action from the account marker so a regular customer’s current behavior remains explicit:

```tsx
const isResettableDemo = account.role === "customer" && account.isDemo === true;
const actionLabel = isResettableDemo ? "Reset account" : "Request deletion";
```

- [ ] In the Convex onboarding form, show a waiting state while `demoResetInProgress` is true; accept profile input only after the cleanup job finishes and account access becomes pending without a profile.
- [ ] Run `npx vitest run tests/unit/auth-flow.test.tsx`; expect reset action/cancel/error paths and unchanged ordinary deletion tests to pass.
- [ ] Commit as `feat: add demo account reset settings`.

## Task 7: Prove the staged flow in the deterministic local demo and finish checks

**Files:** `e2e/admin.spec.ts`, `e2e/customer.spec.ts`, `docs/spec.md`, `docs/CHANGELOG.md`

- [ ] Add a local-demo admin browser flow that confirms an ordinary customer can be promoted to Demo, sees the Demo marker, and can then be promoted to Administrator; confirm the administrator account no longer shows Demo reset controls.
- [ ] Add a local-demo account flow that creates a customer once, has an admin mark it Demo, resets it from account settings, re-enters onboarding under the same email/password, and confirms previous profile data and linked cards are gone while Demo status remains.
- [ ] Keep existing ordinary customer account-deletion browser assertions unchanged. Update `docs/spec.md` account-management and acceptance-criteria sections to record Customer → Demo → Administrator promotion, Demo-only reset, preserved Google identity, and account-owned card/data cleanup. Add a concise user-visible entry to `docs/CHANGELOG.md` for the same behavior.
- [ ] Run `npm run test:e2e:demo`; expect the Customer → Demo → Administrator flow, Demo reset/re-onboarding, and existing demo journeys to pass.
- [ ] Run `npm run verify`; expect design, formatting, lint, typecheck, unit/Convex tests, and build to pass. Do not run E2E, provisioning, or seed commands against Production.
- [ ] Commit as `test: cover demo account promotion and reset`.

## Acceptance coverage

- Customer → Demo → Administrator, no direct Customer → Administrator, Demo marker removal on admin promotion, and preservation of customer data/Google identity: Tasks 1–2.
- Demo-only **Reset account**, confirmation, owner authorization, and unchanged normal deletion: Tasks 3 and 6.
- Account data, profile/media, orders/uploads, claim state, and linked cards removed; shared or unrelated data preserved: Tasks 4–5.
- Same Convex Auth identity and Demo marker retained, then onboarding can complete again: Tasks 3–6.
- Deterministic local-demo parity and browser proof: Tasks 5 and 7.
