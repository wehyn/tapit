# Time-limited card-order offers and separate referral codes

**Date:** 2026-10-28  
**Status:** Approved, updated 2026-10-28
**Issue:** [#182](https://github.com/wehyn/tapit/issues/182)  
**Related design:** [Card-order offers and referrer attribution](2026-10-28-card-order-offer-and-referrer-model-design.md)

This spec updates the earlier design's single-code checkout behavior.

## Goal

Add manual expiry dates to card-order promo offers, move the launch cutoff to the `LAUNCH` offer, and give customers separate promo and referral inputs. Customers may use one code of each type together. A promo sets a fixed final price or applies its configured percentage discount to the ₱799 base price. A referral then gives 10% off the promo-adjusted price and earns a 10% commission on it before the referral discount.

## Existing behavior

- Existing offers have an optional fixed final card price; offers without one currently apply 10% off. Offers also have an optional shared usage limit. Checkout aliases can map an offer, a referrer, or both.
- Checkout currently accepts one combined code. The global launch end date sets the card price to ₱599 before its date and ₱799 on or after it. Leaving it blank blocks ordering.
- Submitted orders snapshot their price, discount, offer, referral, and commission information. Local demo and Convex checkout must match.

## Terms and date rules

- **Promo code:** A code entered in the optional discount-code field. It resolves directly to an offer in `cardOrderOffers`.
- **Referral code:** A code entered after enabling “Have a referral code?”. It resolves to an active referrer record, such as `AHRON`.
- **Promo-adjusted card price:** The card price after applying the promo offer and before applying any referral discount. It is ₱799 with no promo, ₱599 for `LAUNCH`, ₱299 for `FOUNDING`, or the configured percentage discount from ₱799.
- **Percentage promo:** A whole-number `percentOff` from 1% through 99%, applied to ₱799 and rounded to the nearest centavo. An offer has either `fixedPriceCentavos` or `percentOff`, never both. Existing offers with neither field retain their current 10%-off behavior.
- **Offer expiry date:** An optional, manually entered `YYYY-MM-DD` cutoff in Asia/Manila. The offer is valid before the selected date and unavailable on or after it, matching the current launch cutoff boundary.
- **Referral commission:** 10% of the promo-adjusted card price, payable only when a valid referral code is used.

The expiry date is not calculated from activation and is not extended when other offer fields are edited. To run a one-month launch, the administrator sets the `LAUNCH` cutoff one calendar month after launch starts.

## Checkout behavior

- Keep one optional promo-code input and a separate “Have a referral code?” toggle that reveals the referral-code input. Use the existing one-code-per-order limit within each type: at most one promo code and at most one referral code.
- Allow one promo and one referral code together. Resolve each code through its own record; do not require or parse a combined alias such as `LAUNCH-AHRON`.
- Apply the promo first. With no promo, the card price is ₱799. An offer with a fixed price sets that final price; otherwise, its configured `percentOff` is deducted from ₱799. Existing offers with neither field keep their current 10%-off behavior.
- Apply a valid referral code's 10% discount to the promo-adjusted card price. If a referral is present, calculate commission as 10% of that same promo-adjusted price before the referral discount. Promo-only orders have no referral attribution and no commission.
- Examples:
  - `LAUNCH` only: ₱599 due, no commission.
  - `LAUNCH` + `AHRON`: ₱599 promo-adjusted price, ₱59.90 referral discount, ₱539.10 due, ₱59.90 commission.
  - `FOUNDING` + `AHRON`: ₱299 promo-adjusted price, ₱29.90 referral discount, ₱269.10 due, ₱29.90 commission.
  - A 20%-off promo + `AHRON`: ₱639.20 promo-adjusted price, ₱63.92 referral discount, ₱575.28 due, ₱63.92 commission.
  - `AHRON` only with no promo: ₱799 base, ₱79.90 referral discount, ₱719.10 due, ₱79.90 commission. This remains the result during the launch month unless the customer also enters `LAUNCH`.
- Preview checks both codes and shows the combined price. Order submission independently rechecks both code records, expiry, usage, first-order eligibility, and price before writing. An expired promo must be removed before submitting with a valid referral code alone; do not silently ignore an invalid entered code.
- When both codes are used, save both record IDs and snapshots and increment both applicable usage counts in the same order transaction. A promo-only order records no referral snapshot and keeps commission status `none`.
- Keep existing payment, shipping, fulfillment, order eligibility, and refund behavior unchanged.

## LAUNCH pricing and ordering

- Configure `LAUNCH` as a promo offer with a fixed final card price of ₱599 and a manually entered expiry date. Configure `FOUNDING` with a fixed final card price of ₱299.
- The regular card price is ₱799 when there is no valid promo. After `LAUNCH` expires, AHRON remains a valid referral code and applies its 10% discount to ₱799.
- Remove the “Card ordering launch” / “Launch end date” control from Admin Settings and stop using the global date for order pricing or ordering availability.
- Keep the active-payment-method requirement for ordering. Offer expiry only ends that offer; it does not close ordering.
- Preserve all existing order prices, discounts, referral data, commission values, and snapshots.

## Admin experience

- Let administrators choose either a fixed final price or a whole-number percentage discount (1–99%) for each offer in `/admin/codes`; round percentage discounts to the nearest centavo. Add an optional expiry date field. Administrators can set, edit, and clear expiry; show its date and expired state.
- Keep offer management separate from referrer-code management. Administrators can create a standalone `AHRON` referral code without mapping it to an offer.
- Remove the launch date control and save flow from Admin Settings. Keep payment-method, QR, and support settings.
- Keep historical combined aliases readable in Codes and order history, but do not require them for the new checkout fields.

## Data and compatibility

- Store expiry and optional `percentOff` on the offer, not on aliases, so each offer and all historical aliases share its settings. Existing offers without an expiry remain time-unlimited. Existing offer documents with neither a fixed price nor `percentOff` keep their current 10%-off behavior.
- Existing offer and order documents need no expiry backfill. The old global launch end date becomes inert; the administrator configures `LAUNCH` at ₱599 with its manual expiry in Codes.
- Keep combined alias records and saved order snapshots readable. New checkout resolves promo codes from offers and referral codes from standalone referrer records.
- On an order, store `cardPriceCentavos` as the promo-adjusted price and `discountCentavos` as the referral discount. Snapshot the offer's fixed price or `percentOff` and the referral independently. Existing snapshots remain readable and unchanged. Increment each used code's counter once in the order transaction.
- Apply the same rules in Convex and local demo mode; older demo offers without an expiry remain usable.

## Scope

- Included: manual offer expiry, fixed-price or configurable percentage promos, separate promo/referral checkout inputs, one code of each type per order, combined promo plus referral pricing, commission based on promo-adjusted price, and removal of the global launch cutoff.
- Excluded: multiple promo codes, multiple referral codes, code inference by splitting strings, automatic expiry calculation, offer start dates, and changes to commission rate, payment, shipping, or fulfillment.

## Alternatives considered

1. **Separate promo and referral inputs (selected):** Makes pricing offers and referral attribution distinct while allowing one of each. This supports `LAUNCH` plus `AHRON` without maintaining combined aliases.
2. **One combined checkout code:** Keeps the current input but requires administrators to create and maintain combinations such as `LAUNCH-AHRON` and `FOUNDING-AHRON`.
3. **Allow only one code total:** Prevents promo and referral benefits from being used together, unlike the previous launch-price-plus-referral behavior.

## Acceptance criteria

- Admins can set, edit, and clear an offer expiry date. Offers without expiry remain time-unlimited; expired offers are rejected in preview and order submission on and after the selected Manila date.
- Checkout has separate promo and referral inputs, with the referral field revealed by the toggle. One code of each type can be used together, but multiple codes of either type cannot.
- `LAUNCH` alone prices the card at ₱599 with no commission. `LAUNCH` plus `AHRON` charges ₱539.10 and records ₱59.90 commission.
- `FOUNDING` alone prices the card at ₱299 with no commission. `FOUNDING` plus `AHRON` charges ₱269.10 and records ₱29.90 commission.
- Percentage promo offers accept whole-number values from 1% to 99%, round to the nearest centavo, and apply to ₱799 before a separate 10% referral discount.
- `AHRON` alone with no promo charges ₱719.10 from the ₱799 base and records ₱79.90 commission, including after `LAUNCH` expires.
- Promo-only orders contain no referral attribution or commission. Combined orders snapshot both codes, increment both counters, and preserve the existing referral eligibility and order snapshot rules.
- Admin Settings no longer exposes or uses the global launch date. Ordering remains available at ₱799 with an active payment method after launch expiry.
- Convex and local demo produce the same code validity, price, discount, commission, usage, and snapshot results. Legacy combined aliases and existing orders remain readable.

## Validation

- Test no-expiry offers and the date immediately before, on, and after the Manila cutoff.
- Test promo-only and referral-only orders, `LAUNCH` + `AHRON`, `FOUNDING` + `AHRON`, and a percentage promo + `AHRON`, including percent validation and centavo rounding.
- Verify promo-only orders have no commission, combined orders calculate commission from the promo-adjusted price, and referral-only orders use the ₱799 base after the global cutoff is removed.
- Verify both usage counters increment exactly once for a combined order, and neither increments when preview or submission rejects a code.
- Verify preview and order submission revalidate separately, invalid codes must be removed before order placement, and existing order snapshots remain unchanged.
- Repeat the cases in local demo and Convex. Confirm the legacy launch setting is ignored while the active-payment-method gate remains.
