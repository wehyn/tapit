# Fixed-Price Referral Code Implementation Plan

> **For agentic workers:** Use subagent-driven development to implement the disjoint tasks in parallel. Steps use checkbox syntax for tracking.

**Goal:** Make the `FOUNDING` referral code set the card price to ₱299 while retaining the normal referral commission.

**Architecture:** Add an optional fixed card price to each referral code; absent values retain the current 10% discount. A shared centavo calculation feeds both local demo and Convex preview/order creation, while admin settings expose the optional value. Commission remains based on the pre-discount card price and order records retain their price snapshots.

**Tech Stack:** Next.js client components, TypeScript, Convex, local demo state.

---

### Task 1: Add fixed-price pricing and persistence

**Files:**

- Modify: `src/lib/card-ordering.ts`
- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/lib/demo/card-ordering.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/cardOrderSettings.ts`
- Modify: `convex/cardOrders.ts`

- [x] Add optional `fixedPriceCentavos` to demo and Convex referral-code records; keep legacy records valid when absent.
- [x] Extend the shared referral-discount helper so absent fixed prices calculate the existing 10%, while configured fixed prices calculate `baseCardPrice - fixedPrice`; reject non-positive or greater-than-₱599 fixed amounts.
- [x] Use the shared helper in demo and Convex referral previews and order mutations. Keep commission based on the undiscounted card price and preserve existing order snapshots.
- [x] Validate the optional fixed amount at both admin save boundaries and preserve the field in settings queries.

### Task 2: Expose the price rule in admin and customer UI

**Files:**

- Modify: `src/components/admin/SettingsManager.tsx`
- Modify: `src/components/card-order/OrderCardExperience.tsx`

- [x] Add an optional whole-peso fixed-price field to the referral code form and map it to centavos for storage. An empty field keeps the 10% discount rule.
- [x] Populate the field when editing a code and show each saved code's rule in the admin list.
- [x] Keep the existing customer price summary driven by the validated preview discount so a fixed-price code shows ₱299 plus shipping.

### Task 3: Configure and verify `FOUNDING`

**Files:**

- Local demo admin settings in the browser profile used for the current order flow.

- [x] Edit or add the `FOUNDING` referral entry at a fixed card price of ₱299 and confirm it remains active.
- [x] Confirm the demo admin list shows the fixed price and the customer order preview totals ₱299 plus pending shipping.
- [x] Confirm the signed-in customer session is restored after the admin update.

Do not add or run automated tests for this change. Use `npx tsc --noEmit` and the local demo UI check only; do not run Convex codegen or deploy.
