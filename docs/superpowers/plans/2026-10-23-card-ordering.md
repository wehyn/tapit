# Card Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active Tapit customers order one custom NFC + QR card with launch pricing, manual payment, delivery details, and optional referral discount, while admins manage orders and commission payouts.

**Architecture:** Keep the order page inside the existing authenticated customer workspace and route the builder’s order action to it, where customers reselect the artwork. Store authoritative pricing, payment snapshots, referral snapshots, delivery data, and status transitions in scoped Convex records; mirror the same workflow in local demo state. Keep uploaded originals private and use an order-specific artwork policy of strictly under 5 MiB and at most 6,000,000 decoded pixels. Keep the separate generic card-design policy at 50 MiB / 50 MP. Store local demo originals in IndexedDB because the current demo localStorage media codec is designed for compressed profile images.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, TypeScript, existing Convex Auth and storage, browser IndexedDB for local demo uploads.

**Spec:** `docs/superpowers/specs/2026-10-23-card-ordering-design.md`

**Constraints:** No payment gateway or automatic commission transfer. Do not add or run automated tests unless the user asks for testing or verification. Keep the existing unrelated untracked files untouched. Before editing, read `CODING_STANDARDS.md`, the full `convex/_generated/ai/guidelines.md`, and the relevant installed Next guide at `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`.

---

### Task 1: Add shared pricing rules and scoped order records

**Files:**

- Create: `src/lib/card-ordering.ts`
- Modify: `convex/schema.ts`
- Modify: `src/lib/demo/fixtures.ts`

- [ ] **Step 1: Define the shared integer-centavo pricing rules**

Export constants for ₱599 (`59900` centavos), ₱799 (`79900` centavos), and the 10% discount/commission. Add a helper that chooses ₱599 only while `now < launchEndAt`, and helpers that round percentage amounts to integer centavos. Represent the admin date as `YYYY-MM-DD` and convert its start-of-day boundary in `Asia/Manila` before comparing it with `Date.now()`.

```ts
export const CARD_LAUNCH_PRICE_CENTAVOS = 59_900;
export const CARD_REGULAR_PRICE_CENTAVOS = 79_900;
export const REFERRAL_PERCENT = 10;
export const COMMISSION_PERCENT = 10;

export function percentageCentavos(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}
```

- [ ] **Step 2: Add the Convex records and indexes**

In `convex/schema.ts`, add scoped `cardOrderPaymentMethods`, `cardOrderReferralCodes`, `cardOrderDesignUploads`, and `cardOrders` tables. Use index names that include their full fields: `by_scope_and_active`, `by_scope_and_code`, `by_ownerId_and_status`, `by_storageId`, `by_scope_and_customerId_and_createdAt`, and `by_scope_and_createdAt`.

Store one card per order. Store order prices, discount, optional shipping quote, and commission in integer centavos. Snapshot the selected payment provider/label/account details/instructions and referral code/referrer label on the order. Use these status values: payment `unpaid | received | refunded`, fulfillment `awaiting_shipping_quote | awaiting_payment | processing | delivered | cancelled`, and commission `none | pending | eligible | paid | void`. The design source must be a validated upload reference or an HTTPS URL, never both. Bound settings and order queries with `.take()` or Convex pagination; do not collect every order.

- [ ] **Step 3: Add demo state defaults and compatibility**

Extend `DemoState` in `src/lib/demo/fixtures.ts` with launch end date, payment methods, referral codes, and orders. Default the end date to unset and the collections to empty. Update demo-state normalization in `src/lib/demo/store.ts` so older localStorage records receive these defaults and malformed new collections are replaced with empty collections.

---

### Task 2: Add private Convex artwork upload and cleanup

**Files:**

- Create: `convex/cardOrderDesigns.ts`
- Create: `convex/cardOrderDesignProcessing.ts`
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add an authenticated upload URL mutation**

In `convex/cardOrderDesigns.ts`, add `generateUploadUrl` using `ctx.storage.generateUploadUrl()`. Derive the customer from the current Convex identity, and require an active account. Do not accept an owner ID from the client.

- [ ] **Step 2: Validate and register uploaded originals**

In `convex/cardOrderDesignProcessing.ts`, add a Node action that accepts the uploaded storage ID and file name, rechecks the active customer, reads the uploaded Blob, and validates the order-specific `CARD_ORDER_DESIGN_POLICY`: JPEG/PNG, strictly under 5 MiB, valid image bytes, dimensions no greater than 12,000 by 12,000, and no more than 6,000,000 pixels. Keep the generic `CARD_DESIGN_POLICY` at 50 MiB / 50 MP for its separate upload design. Use the installed `sharp` dependency for decoding and metadata; do not transform the original. On success, call an internal mutation to register the storage ID, owner, file name, detected type, byte size, scope, and `available` status in `cardOrderDesignUploads`.

- [ ] **Step 3: Attach uploads to orders and expire abandoned uploads**

When `cardOrders.placeOrder` accepts an upload ID, verify it belongs to the authenticated customer, is in the same scope, and is still `available`; atomically set it to `attached` and link the new order. Schedule an internal cleanup mutation with `ctx.scheduler.runAfter` for uploads that remain available after 24 hours. The cleanup mutation must recheck status before deleting the record and stored Blob; no recurring cron is needed.

- [ ] **Step 4: Resolve private image URLs only for authorized readers**

Customer order queries may return a signed URL only for that customer’s own uploaded design. Admin order queries may return signed URLs only after `requireAdministrator` and same-scope checks. Never return upload IDs or URLs through public profile queries.

---

### Task 3: Implement Convex settings, pricing, and order state transitions

**Files:**

- Create: `convex/cardOrderSettings.ts`
- Create: `convex/cardOrders.ts`
- Modify: `convex/accountErasure.ts`

- [ ] **Step 1: Add admin settings operations**

Use the existing scoped `settings` table with key `cardOrderLaunchEndDate` for the date. In `convex/cardOrderSettings.ts`, add an admin settings query plus mutations to save/deactivate payment entries, save/deactivate referral codes, and set the date. Normalize referral codes to uppercase, enforce uniqueness within scope, allow multiple payment entries per provider, require `requireAdministrator`, and write audit records for changes. Deactivation must leave entries available for existing order snapshots.

- [ ] **Step 2: Add safe customer pricing and referral queries**

Add an active-customer query that returns the launch date and active payment instructions; do not read `Date.now()` inside a Convex query. Let the client use the shared helper for its price preview. Add referral validation that accepts the client’s current time for preview purposes and returns only validity and discount amount. It must check active code state and that the authenticated customer has no prior order in the same scope; canceled or refunded orders still count as prior orders. The submit mutation remains authoritative and uses server time.

- [ ] **Step 3: Add server-authoritative order submission and owner query**

Add `placeOrder` and `myOrders` in `convex/cardOrders.ts`. Derive and require the active customer server-side. At submission, require a configured launch end date and at least one active payment method; verify the selected method and optional referral code are still active; enforce first-order eligibility; trim and validate delivery name (1–120 characters), phone (1–40 characters), and address (1–1,000 characters); validate exactly one upload or HTTPS URL (maximum 2,048 characters, no URL credentials, and no server fetch); calculate price and the 10% referral discount on the active card price; calculate commission as 10% of the pre-discount card price without shipping; snapshot the selected payment and referral details; and write the order in one mutation. A no-referral order has commission state `none`. Ignore any amount supplied by the client. Return only the latest 20 orders for `myOrders`.

- [ ] **Step 4: Add admin order queries and manual transitions**

Add a paginated admin list query and mutations for shipping quote, payment received, delivery, cancellation, refund, commission eligibility, and commission payout. Require admin role and same scope on every operation. A submitted order starts as `awaiting_shipping_quote`; adding a non-negative integer-centavo quote changes it to `awaiting_payment`; marking payment received changes it to `processing`; delivery requires received payment and changes it to `delivered`. Commission eligibility requires delivery and remains a manual admin action after the refund period; payout requires eligibility plus a non-empty reference. Cancellation or refund before payout sets commission to `void`. If refund happens after payout, retain the paid record; do not add an automatic clawback workflow.

- [ ] **Step 5: Include orders and original artwork in approved account erasure**

Update `convex/accountErasure.ts` to remove a deleted customer’s orders and design-upload records in bounded batches, deleting each private original only after confirming that no remaining order references it. Preserve the existing verified-deletion and administrator-approval gates.

- [ ] **Step 6: Refresh generated Convex bindings**

Run `npx convex codegen` after schema and function signatures are settled. Do not run `convex dev` or deploy as part of this plan.

---

### Task 4: Mirror order rules in local demo mode

**Files:**

- Create: `src/lib/demo/card-order-assets.ts`
- Create: `src/lib/demo/card-ordering.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/components/admin/CustomersManager.tsx`

- [ ] **Step 1: Persist original demo artwork in IndexedDB**

Add browser-only helpers to save, read, and delete original `Blob` files in one IndexedDB object store. Before saving, require JPEG/PNG, strictly under 5 MiB, no side over 12,000 pixels, and at most 6,000,000 decoded pixels. Store only the asset key and file metadata in `DemoState`; do not pass artwork through the existing localStorage serializer or downsample a print original. Return a clear upload error if IndexedDB is unavailable or full.

- [ ] **Step 2: Add demo customer and admin operations**

In `src/lib/demo/card-ordering.ts`, add helpers for first-order referral validation, server-equivalent centavo calculations, order creation, shipping quote, payment, delivery, cancellation/refund, eligibility, and payout recording. Apply local demo authorization: customers see only their own orders and admin sessions may manage all demo orders.

- [ ] **Step 3: Keep demo upload lifecycle aligned**

Delete an unattached demo asset when the user replaces/removes the selected file. When local demo account deletion is approved, remove that customer’s order records and IndexedDB artwork as the Convex erasure flow does; keep attached artwork available to admins until then.

---

### Task 5: Build the authenticated customer order page

**Files:**

- Create: `src/app/app/account/order-card/page.tsx`
- Create: `src/components/card-order/OrderCardExperience.tsx`
- Modify: `src/components/card-builder/BuildCardExperience.tsx`
- Use: `src/lib/card-design.ts` and `src/lib/card-ordering.ts`

- [ ] **Step 1: Route the existing builder action to the order page**

Change the authenticated builder order action to `router.push("/app/account/order-card")`. For unauthenticated visitors, send login’s `next` path to that route. Keep the existing preview local to `/build-card`; the order page explicitly asks the customer to select the design again.

- [ ] **Step 2: Build the shared customer form and mode adapters**

Follow `BuildCardExperience`’s local-demo/live split so hooks are not called conditionally. Share the form UI while providing demo or Convex adapters for settings, referral validation, file storage, order submission, and the customer’s order list.

- [ ] **Step 3: Collect the approved order fields and show the price breakdown**

Require exactly one PNG/JPG file or HTTPS URL, delivery name (1–120 characters), phone (1–40 characters), delivery address (1–1,000 characters), and payment method. Uploaded files must be strictly under 5 MiB, no side over 12,000 pixels, and at most 6,000,000 decoded pixels. Use `src/lib/card-design.ts` for PNG/JPG validation and add order-specific under-5-MiB size feedback; decode the selected file in the browser before upload to check its dimensions and release the decoded image resources afterward. Keep these client checks as UX feedback and enforce the same rules in Convex with `CARD_ORDER_DESIGN_POLICY`. Validate URLs as HTTPS, with no credentials, and do not fetch them. Show ₱599 before the configured Manila cutoff or ₱799 at/after it; show a valid 10% referral discount; label shipping as pending until quoted. Show the selected file name/size with a replace action.

- [ ] **Step 4: Submit without trusting browser amounts and show manual payment instructions**

Submit only form fields, selected payment method ID, referral code, and design reference. After success, show the saved order price, selected payment instructions, pending shipping quote, and tell the customer to wait for the quote before paying. Display the customer’s own order status and shipping quote on the page so they can see the amount due before paying.

---

### Task 6: Add admin order settings and operations UI

**Files:**

- Modify: `src/components/admin/SettingsManager.tsx`
- Create: `src/app/admin/orders/page.tsx`
- Create: `src/components/admin/OrderManager.tsx`
- Modify: `src/components/layout/AdminShell.tsx`

- [ ] **Step 1: Add payment, referral, and launch-date settings**

Extend the existing Settings page in both demo and Convex modes. Let admins add/edit/deactivate multiple payment entries per provider, add/edit/deactivate unique referral codes with referrer labels, and set the launch end date. Keep the existing support settings and launch gates intact.

- [ ] **Step 2: Add the Orders admin route and navigation link**

Create `/admin/orders` under the existing `AdminShell` and add an Orders item to its Operations group. Use the current demo/live split pattern used by other admin managers.

- [ ] **Step 3: Display order snapshots and record manual operations**

Show customer and delivery details, private artwork or HTTPS design URL, payment snapshot, centavo price breakdown, shipping quote, payment/fulfillment/commission states, and referral label. Provide only the approved admin actions: quote shipping, mark paid, mark delivered, cancel/refund, mark eligible, and record payout reference. Parse shipping input as pesos with no more than two decimal places, then send integer centavos. Admin-visible addresses and design URLs must never be included in customer-facing responses.

---

### Task 7: Review implementation scope and handoff

**Files:**

- Review: all files listed above
- Review: `docs/superpowers/specs/2026-10-23-card-ordering-design.md`

- [ ] **Step 1: Review the diff against the spec**

Confirm both demo and Convex paths cover pricing cutoff, 10% discount, commission excluding shipping, private file ownership, HTTPS-only URLs, payment snapshots, shipping-before-payment, delivery-before-eligibility, and referral first-order behavior. Confirm unrelated untracked files remain untouched. Do not add or run automated tests unless the user asks for testing or verification.
