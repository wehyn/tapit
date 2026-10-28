# Time-Limited Card-Order Promo and Referral Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task.

**Goal:** Add manually expiring promo offers, move launch pricing to `LAUNCH`, and let customers use one promo code plus one referral code in separate checkout controls.

**Architecture:** Resolve promo codes directly from scoped card-order offers and referral codes from standalone referrer records. An offer sets a fixed final price or applies its configured whole-number percentage to the ₱799 base. Then apply a 10% referral discount to that promo-adjusted price. Pay commission only when a referral is present, at 10% of the promo-adjusted price before the referral discount. Mirror all rules in Convex and local demo.

**Tech Stack:** Next.js 16 App Router, React 19, Convex 1.45, TypeScript, Vitest, Playwright, deterministic local demo store.

**Spec:** `docs/superpowers/specs/2026-10-28-time-limited-card-order-offers-design.md`  
**Issue:** https://github.com/wehyn/tapit/issues/182

## File map

- `src/lib/card-ordering.ts`: offer pricing, referral discount, commission, and Manila cutoff calculations.
- `convex/schema.ts`, `convex/cardOrderSettings.ts`, `convex/cardOrders.ts`: offer expiry and percentage storage, separate code preview, authoritative pricing, both snapshots and counters.
- `src/lib/demo/fixtures.ts`, `src/lib/demo/store.ts`, `src/lib/demo/card-ordering.ts`: demo offer shape, legacy-state compatibility, separate code resolution and matching price/commission rules.
- `src/components/admin/CodesManager.tsx`, `src/components/admin/SettingsManager.tsx`, `src/components/card-order/OrderCardExperience.tsx`: fixed-price or percentage offer editor, offer expiry, remove global date setting, separate promo field and referral toggle.
- `convex/integration/card-order-usage.test.ts`, `convex/integration/card-order-price-contract.test.ts`, `convex/integration/card-order-payment-qr.test.ts`, `tests/unit/card-order-demo-price-contract.test.ts`, `tests/unit/card-order-price-contract.test.tsx`, `tests/unit/card-order-live-price-contract.test.tsx`, `tests/unit/card-ordering-expiry.test.ts`, `tests/unit/codes-manager.test.tsx`, `tests/unit/settings-payment-qr.test.tsx`, `tests/unit/demo-payment-qr-url-lifecycle.test.tsx`, `tests/unit/demo-storage-store.test.ts`, `e2e/card-order-codes.spec.ts`: focused behavior and compatibility coverage.
- `docs/CHANGELOG.md`: describe the customer-facing checkout and launch change.

## Constraints

- Read `CODING_STANDARDS.md` and `convex/_generated/ai/guidelines.md` before implementation. Read the relevant installed Next.js guide before changing Next.js-specific APIs; this plan does not add or change routes.
- An offer without `expiresOn` stays time-unlimited. The selected date is the first Manila date the offer is unavailable.
- Checkout accepts at most one promo code and one referral code; one of each may be used together. It does not accept multiple promo codes or multiple referral codes.
- New offers use either `fixedPriceCentavos` (final pre-referral price) or `percentOff` (whole number 1–99 applied to ₱799), never both. Existing offers with neither field keep the legacy 10%-off rule.
- Apply the promo offer first to the ₱799 base. Store that result as `cardPriceCentavos`; store the 10% referral reduction as `discountCentavos`. Calculate commission from `cardPriceCentavos` only when a referral code is present. Promo-only commission is zero.
- LAUNCH+AHRON: card price ₱599, referral discount ₱59.90, amount due ₱539.10, commission ₱59.90. FOUNDING+AHRON: card price ₱299, referral discount ₱29.90, amount due ₱269.10, commission ₱29.90. AHRON alone: card price ₱799, discount ₱79.90, amount due ₱719.10, commission ₱79.90.
- Example 20%-off promo+AHRON: promo price ₱639.20, referral discount ₱63.92, due ₱575.28, commission ₱63.92. Promo-only LAUNCH costs ₱599 and has no commission.
- Check expiry in preview and again in the Convex order mutation before any order, usage, or upload-attachment write. Preview uses supplied `currentTime`; order submission uses its server-side clock.
- Preserve order snapshots and legacy combined aliases. New checkout resolves promo and referral fields separately; it does not infer mappings by splitting strings.
- No automatic migration of the old global launch date. After rollout, configure `LAUNCH` at ₱599 and `FOUNDING` at ₱299 with their expiry dates in Codes, and ensure a standalone `AHRON` referral code exists. Keep the active-payment-method gate.
- Keep local demo deterministic. Run E2E only against the local demo; never run E2E or provisioning against Production.

---

### Task 1: Add shared expiry rules and offer persistence

**Files:**

- Modify: `src/lib/card-ordering.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/cardOrderSettings.ts`
- Create: `tests/unit/card-ordering-expiry.test.ts`
- Test: `convex/integration/card-order-usage.test.ts`

- [x] **Step 1: Add failing date-boundary and persistence tests**

Test offers with no expiry, one millisecond before a Manila cutoff, at the cutoff, and after it. Assert the date conversion against a known UTC timestamp so the timezone expectation is independent of the helper:

```ts
const cutoff = manilaStartOfDayTimestamp("2026-10-28")!;
expect(cutoff).toBe(Date.parse("2026-10-27T16:00:00.000Z"));
expect(isCardOrderOfferExpired(undefined, cutoff)).toBe(false);
expect(isCardOrderOfferExpired("2026-10-28", cutoff - 1)).toBe(false);
expect(isCardOrderOfferExpired("2026-10-28", cutoff)).toBe(true);
expect(isCardOrderOfferExpired("2026-10-28", cutoff + 1)).toBe(true);
```

Extend `saveCardOrderOffer` coverage to create with a date, edit the date, clear it, reject `2099-02-30`, and read old offers without the field.

- [x] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run tests/unit/card-ordering-expiry.test.ts convex/integration/card-order-usage.test.ts`

Expected: new helper and persistence assertions fail before implementation.

- [x] **Step 3: Implement the shared expiry helper and offer field**

Keep the existing launch-date parser/type until the global cutoff is removed in Task 2. Reuse strict `YYYY-MM-DD` validation and `manilaStartOfDayTimestamp`, and add:

```ts
export function isCardOrderOfferExpired(expiresOn: string | undefined, now = Date.now()): boolean {
  if (expiresOn === undefined) return false;
  const cutoff = manilaStartOfDayTimestamp(expiresOn);
  return cutoff === null || now >= cutoff;
}
```

Add `expiresOn: v.optional(v.string())` to `cardOrderOffers`. Validate any supplied date in `saveCardOrderOffer`; write `undefined` when an admin clears it. Include `expiresOn` in `adminCardOrderOffers` and the nested offer returned by `adminReferralCodes`.

- [x] **Step 4: Run focused expiry tests**

Run: `npx vitest run tests/unit/card-ordering-expiry.test.ts convex/integration/card-order-usage.test.ts`

Expected: expiry boundaries and offer persistence pass; existing alias and usage cases remain green.

- [x] **Step 5: Commit offer expiry support**

```bash
git add src/lib/card-ordering.ts convex/schema.ts convex/cardOrderSettings.ts tests/unit/card-ordering-expiry.test.ts convex/integration/card-order-usage.test.ts
git commit -m "feat: add offer expiry dates"
```

### Task 2: Implement separate promo/referral pricing in Convex

**Files:**

- Modify: `convex/schema.ts`
- Modify: `convex/cardOrderSettings.ts`
- Modify: `convex/cardOrders.ts`
- Modify: `src/lib/card-ordering.ts`
- Test: `convex/integration/card-order-usage.test.ts`
- Test: `convex/integration/card-order-price-contract.test.ts`
- Test: `convex/integration/card-order-payment-qr.test.ts`

- [ ] **Step 1: Add failing preview and order contract cases**

Cover promo-only `LAUNCH` and `FOUNDING`, referral-only `AHRON`, and each fixed promo plus `AHRON`. Assert amounts due of ₱599, ₱299, ₱719.10, ₱539.10, and ₱269.10; commissions of ₱0, ₱0, ₱79.90, ₱59.90, and ₱29.90; separate offer/referral snapshots; and both usage counters incrementing once for a combined order. Also cover a 20% promo with AHRON (₱575.28 due and ₱63.92 commission), nearest-centavo rounding, invalid percentages (0 and 100), both pricing fields being rejected together, expired offer preview/submission, and the no-code ₱799 order without any launch-date setting.

- [ ] **Step 2: Run the new Convex cases and confirm they fail**

Run: `npx vitest run convex/integration/card-order-usage.test.ts convex/integration/card-order-price-contract.test.ts convex/integration/card-order-payment-qr.test.ts`

Expected: separate inputs, combined price, and no-global-date assertions fail under the one-code launch model.

- [ ] **Step 3: Resolve promo and referral codes independently in preview**

Replace the one-code preview contract with a pricing preview that accepts optional `promoCode`, optional `referralCode`, and `currentTime`. Resolve `promoCode` from `cardOrderOffers` and `referralCode` from a referral record with a referrer identity and no offer mapping. Return each input's validity plus the promo-adjusted card price and referral discount; do not return referrer-only data. Use `args.currentTime` for offer expiry, not `Date.now()` in the query. Apply fixed prices or `percentOff` against ₱799; legacy offers with neither setting retain 10% off.

- [ ] **Step 4: Revalidate both codes and snapshot them in `placeOrder`**

Add `promoCode?: string` alongside `referralCode?: string`. At submission, resolve both scoped records, check offer expiry/usage and referral activity/first-order eligibility, and calculate:

```ts
const promoAdjustedPrice = offer
  ? calculatePromoAdjustedPriceCentavos(
      CARD_REGULAR_PRICE_CENTAVOS,
      offer.fixedPriceCentavos,
      offer.percentOff,
    )
  : CARD_REGULAR_PRICE_CENTAVOS;
const discountCentavos = referral ? calculateReferralDiscountCentavos(promoAdjustedPrice) : 0;
const commissionCentavos = referral ? calculateCommissionCentavos(promoAdjustedPrice) : 0;
```

Reject an expired or invalid entered code before writes. Store `promoAdjustedPrice` in `cardPriceCentavos`, the referral amount in `discountCentavos`, and both offer/referral IDs and snapshots independently. Add optional `percentOff` to new offer snapshots while preserving old snapshots. Increment the offer and referral counters with separate `if` blocks in the same mutation; the current `if offer ... else if referral` would skip one counter when both are used. Promo-only orders use commission status `none` and amount `0`.

- [ ] **Step 5: Remove the global launch-date API and gate**

Delete `LAUNCH_END_KEY`, `launchEndDate`, and `setLaunchEndDate` from `convex/cardOrderSettings.ts`. Remove `launchEndDate` from `adminSettings` and `customerSettings` validators/results. In order submission require an active payment method, but no launch date. Remove the global date input from test seeds; leave old settings documents untouched and unused.

- [ ] **Step 6: Regenerate Convex types and run focused tests**

Run:

```bash
npx convex codegen
npx vitest run convex/integration/card-order-usage.test.ts convex/integration/card-order-price-contract.test.ts convex/integration/card-order-payment-qr.test.ts
```

Expected: promo-only, referral-only, combined, expiry-boundary, commission, usage, no-code ordering, and historical snapshot cases pass.

- [ ] **Step 7: Commit Convex pricing and validation**

```bash
git add convex/cardOrderSettings.ts convex/cardOrders.ts convex/schema.ts src/lib/card-ordering.ts convex/integration/card-order-usage.test.ts convex/integration/card-order-price-contract.test.ts convex/integration/card-order-payment-qr.test.ts convex/_generated
git commit -m "feat: separate promo and referral order pricing"
```

### Task 3: Mirror separate code pricing in local demo

**Files:**

- Modify: `src/lib/demo/fixtures.ts`
- Modify: `src/lib/demo/store.ts`
- Modify: `src/lib/demo/card-ordering.ts`
- Test: `tests/unit/card-order-demo-price-contract.test.ts`
- Test: `tests/unit/demo-storage-store.test.ts`

- [ ] **Step 1: Add failing demo pricing and compatibility cases**

Cover promo-only, referral-only, and combined fixed-price and percentage promo prices/commissions; offer expiry before/on/after the Manila cutoff; both usage counts on combined orders; no usage after rejection; and old offers with no expiry. Include a referral-only order without any global launch setting and legacy offers with no pricing fields falling back to 10% off.

- [ ] **Step 2: Run the demo cases and confirm they fail**

Run: `npx vitest run tests/unit/card-order-demo-price-contract.test.ts tests/unit/demo-storage-store.test.ts`

Expected: separate-code inputs and legacy state assertions fail before implementation.

- [ ] **Step 3: Add expiry and separate pricing to demo records**

Add `expiresOn?: string` and `percentOff?: number` to `DemoCardOrderOffer`; preserve old localStorage offers with no fields and discard a malformed expiry without deleting the offer or its usage history. Change `placeDemoCardOrder` to accept `promoCode` and `referralCode` independently, apply a fixed final price or percentage promo to ₱799 before the referral discount, calculate commission only with a referral, and increment each used counter independently.

- [ ] **Step 4: Remove global launch state from the demo path**

Use `CARD_REGULAR_PRICE_CENTAVOS` without a promo. Remove launch date from demo customer/admin settings and stop exporting `setDemoCardOrderLaunchEndDate`. Ignore the old persisted `cardOrderLaunchEndDate` so older browser state remains readable. Keep the active-payment-method gate.

- [ ] **Step 5: Run focused demo and storage tests**

Run: `npx vitest run tests/unit/card-order-demo-price-contract.test.ts tests/unit/demo-storage-store.test.ts`

Expected: demo and Convex calculations match, legacy offers still load, and saved order snapshots remain unchanged.

- [ ] **Step 6: Commit local-demo parity**

```bash
git add src/lib/demo/fixtures.ts src/lib/demo/store.ts src/lib/demo/card-ordering.ts tests/unit/card-order-demo-price-contract.test.ts tests/unit/demo-storage-store.test.ts
git commit -m "feat: mirror separate order codes in demo"
```

### Task 4: Update admin offer and Settings controls

**Files:**

- Modify: `src/components/admin/CodesManager.tsx`
- Modify: `src/components/admin/SettingsManager.tsx`
- Test: `tests/unit/codes-manager.test.tsx`
- Test: `tests/unit/settings-payment-qr.test.tsx`
- Test: `tests/unit/demo-payment-qr-url-lifecycle.test.tsx`

- [ ] **Step 1: Add failing admin form tests**

Cover fixed-price and percentage offer create/edit, offer expiry create/edit/clear and expired display; assert Settings no longer renders `Card ordering launch` and retains payment, QR, and support settings. Update live/demo settings mocks to omit `launchEndDate` and `setDemoCardOrderLaunchEndDate`.

- [ ] **Step 2: Run the admin tests and confirm they fail**

Run: `npx vitest run tests/unit/codes-manager.test.tsx tests/unit/settings-payment-qr.test.tsx tests/unit/demo-payment-qr-url-lifecycle.test.tsx`

Expected: new offer-expiry assertions fail and the Settings component still renders the launch-date control.

- [ ] **Step 3: Add expiry to offer editing and projections**

Extend `Offer` and `OfferInput` with `percentOff` and `expiresOn`. Add a pricing-mode selector for fixed final price or percentage off; prefill the mode in `startOffer`, submit only its matching value, and default legacy offers with neither field to 10% off. Validate the percent as a whole number from 1 through 99. Render a date field labeled `Expires on (Manila date)`, map both fields through demo and live projections, and let blank expiry clear it. Show the pricing mode, configured percentage or fixed price, `No expiry`, the configured date, and `Expired` as appropriate. Keep alias/referrer management available, including standalone `AHRON` with no offer mapping.

- [ ] **Step 4: Remove the global launch setting from Settings**

Remove launch-date state, the input card, save callback, `setLaunchEndDate` mutation hook, and demo setter import/use from `SettingsManager`. Keep payment method and support settings.

- [ ] **Step 5: Run admin tests and commit**

Run: `npx vitest run tests/unit/codes-manager.test.tsx tests/unit/settings-payment-qr.test.tsx tests/unit/demo-payment-qr-url-lifecycle.test.tsx`.

```bash
git add src/components/admin/CodesManager.tsx src/components/admin/SettingsManager.tsx tests/unit/codes-manager.test.tsx tests/unit/settings-payment-qr.test.tsx tests/unit/demo-payment-qr-url-lifecycle.test.tsx
git commit -m "feat: manage offer expiry dates in admin"
```

### Task 5: Add distinct customer inputs and local-demo E2E coverage

**Files:**

- Modify: `src/components/card-order/OrderCardExperience.tsx`
- Modify: `e2e/card-order-codes.spec.ts`
- Modify: `docs/CHANGELOG.md`
- Test: `tests/unit/card-order-price-contract.test.tsx`
- Test: `tests/unit/card-order-live-price-contract.test.tsx`

- [ ] **Step 1: Add failing checkout tests**

Cover promo-only `LAUNCH`/`FOUNDING`, referral-only, and combined fixed-price and percentage promos with AHRON. Assert the 0/29.90/59.90/63.92/79.90 commission results. Assert an expired promo is unavailable, can be removed, and does not prevent a valid referral-only order at the ₱799 base.

- [ ] **Step 2: Run checkout tests and confirm the new cases fail**

Run: `npx vitest run tests/unit/card-order-price-contract.test.tsx tests/unit/card-order-live-price-contract.test.tsx`

Expected: current single-code preview, submission, and price display cannot satisfy the separate-code expectations.

- [ ] **Step 3: Add the promo field and referral toggle**

In `OrderCardExperience`, keep separate promo and referral state. Render an optional promo-code field and use the existing accessible Switch with the label `Have a referral code?` to reveal the referral field. Send both values through demo and live preview/order adapters. Show each code's validity and the combined price for fixed-price and percentage promos; keep an invalid entered code from being silently ignored.

- [ ] **Step 4: Remove global launch pricing and make feedback actionable**

Remove launch date from checkout settings, price calculation, `isConfigured`, and launch cutoff copy. Use the ₱799 regular base with active payment methods as the ordering gate. Keep the periodic clock refresh for offer expiry. For an invalid promo, tell customers to remove it; a valid referral remains usable on the ₱799 base after `LAUNCH` expires.

- [ ] **Step 5: Update E2E and changelog**

In `e2e/card-order-codes.spec.ts`, configure `LAUNCH`, `FOUNDING`, a percentage promo, and standalone `AHRON`; verify promo-only and combined checkout pricing, expiry, referral-only fallback, and absence of the Settings launch control. Run only local demo. Add a `2026-10-28` changelog entry for separate codes, configurable promo discounts, and expiring launch pricing.

- [ ] **Step 6: Run focused UI and E2E coverage**

Run:

```bash
npx vitest run tests/unit/card-order-price-contract.test.tsx tests/unit/card-order-live-price-contract.test.tsx
npm run test:e2e:demo -- e2e/card-order-codes.spec.ts
```

Expected: demo and live UI show the same separate-code prices and expiry behavior; the E2E run uses the local demo only.

- [ ] **Step 7: Commit checkout and docs**

```bash
git add src/components/card-order/OrderCardExperience.tsx e2e/card-order-codes.spec.ts docs/CHANGELOG.md tests/unit/card-order-price-contract.test.tsx tests/unit/card-order-live-price-contract.test.tsx
git commit -m "feat: add separate promo and referral checkout"
```

### Task 6: Verify behavior and record manual rollout setup

**Files:**

- Review: all files above
- Review: `docs/superpowers/specs/2026-10-28-time-limited-card-order-offers-design.md`

- [ ] **Step 1: Run the project verification suite**

Run: `npm run verify`

Expected: design checks, formatting, lint, typecheck, tests, and production build pass.

- [ ] **Step 2: Review compatibility and generated APIs**

Run: `git diff --check && git status --short`. Confirm the new preview and order APIs accept separate codes, offer expiry is enforced twice, both counters update together, promo-only commission is zero, existing combined aliases and order snapshots still load, old launch-date values are unused, and orders still require an active payment method.

- [ ] **Step 3: Record non-production setup**

In the intended non-production environment, configure `LAUNCH` with fixed price `59_900`, `FOUNDING` with fixed price `29_900`, and their manual cutoffs as needed. Ensure a standalone `AHRON` referral code exists. Leave legacy combined aliases and historical orders readable. Do not run this setup or E2E against Production.
