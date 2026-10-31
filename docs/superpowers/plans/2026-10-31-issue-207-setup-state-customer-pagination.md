# Issue #207 Setup-State Customer Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the prepared admin customer list page through setup-state rows without scanning or annotating the whole customer scope.

**Architecture:** Store the derived setup state and maximum live setup-link expiry on each customer, index state with scope, and backfill existing records before enabling indexed reads. Use Convex cursors for each state, schedule the move from Waiting to Draft at link expiry, and return profile/invitation row data from only the selected customer pages.

**Tech Stack:** Convex queries, mutations, indexes and scheduler; React hooks with `usePaginatedQuery`; existing local-demo store and Tapit UI components.

---

## Files to change

- `convex/schema.ts` — optional persisted setup state/expiry metadata and compound indexes.
- `convex/customerSetupStateBackfill.ts` — scoped start/status/watchdog functions and bounded resumable batches carrying the maximum live expiry.
- `convex/customers.ts` — setup-state indexed pagination, page-local profile/invitation projection, and customer state writes.
- `convex/invitations.ts` — prepared invitation create, revoke, and claim state changes; schedule expiry.
- `convex/invitationAcceptance.ts` — generic invitation acceptance state change.
- `convex/authIdentity.ts`, `convex/bootstrap.ts`, and `convex/demo.ts` — initialize or refresh state for provisioned, promoted, and hosted-demo customers.
- `convex/integration/prepared-setup.test.ts` — align fixtures and add focused regression assertions for backfill recovery, expiry races, mixed invitation history, reset consistency, and legacy invitation projection.
- `src/components/admin/prepared/use-prepared-accounts.ts` — start/watch backfill, use four paginated queries, consume page-local row data, and expose load-more state.
- `src/components/admin/prepared/types.ts` — page projection and pagination result types.
- `src/components/admin/prepared/PreparedCustomers.tsx` — pass current filter and pagination callbacks to the list.
- `src/components/admin/prepared/PreparedAccountsList.tsx` — load-more control and search hint.

## Task 1: Add stored state and a safe backfill gate

**Files:** `convex/schema.ts`, `convex/customerSetupStateBackfill.ts`

- [x] **Step 1: Add an optional state field and scope index.** Keep the field optional during backfill; values are `null`, `waiting`, `draft`, and `active`.

```ts
setupState: v.optional(
  v.union(v.null(), v.literal("waiting"), v.literal("draft"), v.literal("active")),
),
```

Add `.index("by_scope_and_setupState", ["scope", "setupState"])` to `customers`.

- [x] **Step 2: Add scoped status, start, and watchdog functions.** Use the existing `settings.by_scope_and_key` marker pattern. The query reads only the stored marker value. A scheduled watchdog materializes `stalled` after a run stops making progress; start restarts a stalled run from the beginning.

```ts
const BACKFILL_KEY = "customerSetupStateBackfill";
const CUSTOMER_PAGE_SIZE = 1;
const INVITATION_PAGE_SIZE = 100;
const STALE_AFTER_MS = 5 * 60 * 1000;
```

The public start mutation must call `requireAdministrator`, store `userId` in a newly inserted settings marker, and schedule `internal.customerSetupStateBackfill.runBatch` with the admin's scope and `cursor: null`.

- [x] **Step 3: Backfill in bounded resumable batches.** Process one customer and at most 100 prepared invitations per transaction, carrying invitation cursors, prepared-link existence, and the maximum live expiry/ID between batches. Revalidate that maximum before finalizing and schedule its expiry transition. On the last customer, mark the settings value `completed`.

```ts
const customers = await ctx.db
  .query("customers")
  .withIndex("by_scope", (q) => q.eq("scope", args.scope))
  .paginate({ cursor: args.cursor, numItems: CUSTOMER_PAGE_SIZE });
```

For each customer, read prepared invitations through the customer-and-kind index, retain the existing `sameScope` rule, and carry whether any setup link exists or is live. Mark the current live invitation's expiry as scheduled so retries do not add duplicate timers.

- [x] **Step 4: Add regression coverage.** Before tests, document the failure paths: a failed batch can strand an open screen; expired-only prepared history can be lost; long invitation history can exceed transaction limits or hide the maximum live expiry; a link can expire between batches; a reset or revoke during a scan can be overwritten; a newer expired or wrong-scope invitation can hide an older live link; revoking a link can demote an active customer; and a legacy accepted invitation can disagree with its action flag.

## Task 2: Maintain state on every customer lifecycle path

**Files:** `convex/customers.ts`, `convex/invitations.ts`, `convex/invitationAcceptance.ts`, `convex/authIdentity.ts`, `convex/bootstrap.ts`

- [x] **Step 1: Initialize state on customer creation and provisioning.** Set the field in every customer insert and any status-changing patch in these files. Preserve the existing derivation: prepared link creation is `waiting`; active accounts are `active`; unprepared pending/invited accounts are `null`.

Cover `createCustomer`, `createPrepared`, `createSelfServiceAccount`, self-service onboarding completion, Google account provisioning/restart, `promoteUser`, both accounts in `bootstrap`, and hosted-demo customer inserts. Do not change behavior in unrelated customer fields.

- [x] **Step 2: Update prepared-link changes.** In `invitations.generate`, set the customer to `waiting` in the same mutation that invalidates old prepared links and inserts the replacement. In `invitations.revoke`, set the customer to `draft` when the revoked invitation is a prepared setup link.

- [x] **Step 3: Mark accepted accounts active.** Set `setupState: "active"` in prepared `invitations.claim`, generic `invitationAcceptance.finishAcceptance`, and the existing active customer setup completion path in `customers.ts`.

- [x] **Step 4: Add the expiry update.** From `createPrepared` and `invitations.generate`, schedule an internal mutation at `expiresAt` with the customer and invitation IDs. The handler must confirm that the invitation still belongs to the customer, remains unaccepted and uninvalidated, is expired, and the customer is still waiting before setting `draft`. Stale timers do nothing.

- [x] **Step 5: Preserve state meaning on deletion.** In `customers.approveDeletion`, derive the state against the resulting deleted customer and its scoped invitations before patching. This keeps the brief pre-erasure state consistent with current `deriveSetupState` behavior.

## Task 3: Paginate and enrich only the returned customer page

**Files:** `convex/customers.ts`, `convex/customerSetupStateBackfill.ts`

- [x] **Step 1: Gate setup-state queries until backfill is complete.** In `customers.list`, after administrator authorization, check the scoped marker when `setupState` is supplied. Reject the setup-state query while the backfill is not complete; the prepared UI will wait for the status query before subscribing. Keep the unfiltered `customers.list` branch unchanged for `CardsManager`.

- [x] **Step 2: Replace collect-and-offset with the compound index cursor.** For a supplied state, construct the query below, call `.paginate(args.paginationOpts)` unchanged, and remove `filteredCursorPrefix`, `requestedOffset`, `collect()`, and `slice()`.

```ts
const customers = await ctx.db
  .query("customers")
  .withIndex("by_scope_and_setupState", (q) =>
    q.eq("scope", account.scope).eq("setupState", args.setupState),
  )
  .paginate(args.paginationOpts);
```

- [x] **Step 3: Keep enrichment page-local and bounded.** After pagination, read profiles and only the newest prepared and legacy invitation for each row through the customer-and-kind index. Keep scope and profile-owner checks. Add the page response fields needed by `PreparedRow`: profile status, profile draft fields needed by prepared-account editing, selected invitation ID/status, current legacy-invitation status, setup expiry, profile name, and slug. Define a legacy invitation as active only while it is unused, unaccepted, and not invalidated.

- [x] **Step 4: Remove redundant broad detail subscriptions from the prepared hook.** Stop subscribing to `api.profiles.adminList` and `api.invitations.listForAdmin` for this screen. Read edit values and row invitation metadata from the page projection. Leave those query functions available for their other callers.

## Task 4: Add load-more UI and keep the demo deterministic

**Files:** `src/components/admin/prepared/use-prepared-accounts.ts`, `src/components/admin/prepared/types.ts`, `src/components/admin/prepared/PreparedCustomers.tsx`, `src/components/admin/prepared/PreparedAccountsList.tsx`

- [x] **Step 1: Use one paginated hook per state.** Replace the four `useQuery_experimental` customer queries with `usePaginatedQuery(api.customers.list, { setupState }, { initialNumItems: 50 })`. Keep the other prepared-screen queries and mutations that are outside the profile/invitation page-local change.

- [x] **Step 2: Start and observe the backfill.** Subscribe to `api.customerSetupStateBackfill.status`. In an effect, call `api.customerSetupStateBackfill.start` only when the status is `not_started` or `stalled`; do not call it while `running` or `ready`. Pass `"skip"` to all four paginated queries until the status is `ready`. Keep `loading` true during this setup.

- [x] **Step 3: Expose filter-aware pagination state.** Add `hasMore(filter)`, `loadingMore(filter)`, and `loadMore(filter)` to `PreparedAccounts`. Map `drafts` to the `draft` cursor. For `all`, report more while any cursor can load and call `loadMore(50)` for all four; for a specific filter, operate on only that state's cursor. The demo hook returns no more pages and a no-op load callback.

- [x] **Step 4: Wire the list control.** Pass the current filter's pagination state through `PreparedWorkspace` to `PreparedAccountsList`. Show **Load more customers** while another relevant page exists, disable it while loading, and show **Load more to continue searching** when no loaded row matches but more pages remain. Reuse existing `Button` and `Notice` components.

## Task 5: Review and verify the implementation

**Files:** all files above

- [x] **Step 1: Review every customer insert and status transition.** Search `convex/` for `insert("customers")`, `status: "active"`, and `status: "pending"`; confirm each path initializes or updates `setupState` consistently with `deriveSetupState`.
- [x] **Step 2: Review query bounds and scope.** Confirm setup-state list calls use `.paginate()` on `by_scope_and_setupState`, never `.collect()` on the customer scope, and only hydrate details from the returned page.
- [x] **Step 3: Run project checks.** Run `npm run verify`; expected result is all checks, tests, and the build pass.
- [x] **Step 4: Verify the web-facing list in local demo.** Use the repo `verify-tapit` skill with the deterministic local demo and confirm filters, search hint, and no-more-pages behavior. Do not use hosted demo or Production.

## Review checklist

- Backfill status changes through a watchdog mutation rather than wall-clock query output; each transaction reads at most one customer and 100 setup invitations.
- Customer expiry metadata identifies the maximum scoped live expiry; expiry jobs only demote Waiting when they still match that metadata.
- Reset finalization clears setup state, and the page projection reads a fixed number of invitations per customer.

- The backfill marker is scoped and the UI cannot issue indexed setup-state queries until it is complete.
- Existing `customers.list` callers without `setupState` keep native pagination.
- Every customer creation/activation path writes the state expected by `deriveSetupState`.
- Expiry jobs cannot demote an accepted, revoked, replaced, or otherwise active setup.
- Page cursors are per setup state; search checks loaded rows only and explains how to continue.
- Local demo behavior remains deterministic.

No deployment or Production operation is part of this plan.
