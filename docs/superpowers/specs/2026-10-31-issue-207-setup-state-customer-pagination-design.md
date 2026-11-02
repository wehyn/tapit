# Issue #207: Paginate Setup-State Customer Lists

**Status:** Design approved; written spec review pending
**Date:** 2026-10-31
**Issue:** [#207 — Paginate setup-state customer lists](https://github.com/wehyn/tapit/issues/207)

## Goal

Make the prepared admin customer list load in bounded pages. Filtering by setup state must not read the whole customer scope or fetch profile and invitation details for customers outside the requested page. Admins must be able to load later pages while keeping the current filters and search.

## Current behavior

- `convex/customers.ts:list` paginates only when no `setupState` is supplied. For each setup-state query it collects the whole customer scope, reads each customer's profile and invitations, then filters and slices the result with a numeric offset cursor.
- `use-prepared-accounts.ts` starts four setup-state queries with 1,000 rows each and combines them in the browser.
- The prepared customer screen has no load-more control. Its search checks only the rows already loaded.
- `setupState` is derived from customer and invitation data. A valid prepared link means `waiting`; a prepared customer with no valid link means `draft`; an active account means `active`; other accounts mean `null`.

## Design

### Store and index setup state

Store the current setup state on each customer and add an index ordered by scope and setup state. Keep the existing state meanings, including `null` for accounts that are not prepared and `active` for any active account, as in `deriveSetupState` today.

Initialize the field in every customer creation flow. Backfill existing customer records in bounded batches before switching setup-state queries to the index, so existing accounts remain visible. The backfill must use the same rules as `deriveSetupState` and keep the customer's scope checks.

### Keep the state current

- Creating or regenerating a prepared setup link sets the customer to `waiting`.
- Revoking the current prepared setup link sets the customer to `draft`.
- Accepting setup sets the customer to `active`.
- Schedule an internal update for the link's expiry. It sets the customer to `draft` only if that invitation is still current and the customer is still waiting. A stale job from a revoked or replaced link does nothing.
- Deleting a prepared draft deletes its customer as it does today.

These updates run with the existing customer or invitation mutation where possible. The expiry job is the only new scheduled transition.

### Return real pages

For setup-state requests, `customers.list` will filter by the new index and call Convex `.paginate()` with the supplied pagination options. The response cursor will be Convex's continuation cursor, not an offset into a freshly collected list. The unfiltered customer-list path will keep its existing scoped pagination.

After the database selects a page, the query may load profile and invitation details for those page rows only. Preserve current authorization, scope checks, and profile ownership checks.

Return the row fields the prepared screen needs from that page projection, including profile fields used to edit prepared accounts and invitation IDs/status used for row actions. Remove the prepared screen's separate `profiles.adminList` and `invitations.listForAdmin` subscriptions so they do not load records outside the customer pages.

### Load more in the admin screen

Use one paginated query and cursor per setup state, starting with 50 rows per state. Keep the current state filters. **Load more** advances the selected state's cursor; under **All**, it advances each of the four cursors. Show the control while any relevant cursor has another page.

Search remains in the browser and checks loaded rows. If more pages exist, tell the admin to load more to continue searching. The local demo keeps its deterministic in-memory list and does not need a server cursor; its shared screen shows no load-more control when all demo rows are loaded.

## Acceptance criteria

1. Setup-state list requests do not collect the customer scope.
2. A page contains only customers in the requested state and has a continuation cursor that pages through matching rows without offset-based skips or duplicates.
3. Profile and invitation details are fetched only for customers in the returned page.
4. The prepared admin screen retains All, Waiting, Drafts, and Active filters, and can load later pages.
5. Search covers loaded pages and indicates when more pages can be loaded to continue searching.
6. Existing customers are included after the backfill; customer scope and profile ownership protections remain enforced.
7. Expired links move from Waiting to Draft automatically. A stale expiry job cannot change the state after link replacement, revocation, or setup acceptance.
8. The local demo remains deterministic and keeps current filters and search.

## Validation

- Convex integration coverage for each setup state, multiple cursor pages, no skipped or duplicate IDs, state transitions on create/regenerate/revoke/accept/expiry, stale expiry jobs, and scope isolation.
- UI verification for the four filters, load-more behavior, search hint when more pages exist, and the no-more-pages state.
- Confirm the backfill is complete before the indexed query path becomes the only source for setup-state lists.

No implementation or test execution is included in this design spec.

## Out of scope

- Searching records that have not been loaded. Search across all customers would require a separate server-side search design.
- Changing the prepared account workflow, customer actions, or local-demo data model.
