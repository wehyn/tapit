# Time-limited card-order offers and launch pricing

**Date:** 2026-10-28  
**Status:** Draft for review  
**Issue:** [#182](https://github.com/wehyn/tapit/issues/182)  
**Related design:** [Card-order offers and referrer attribution](2026-10-28-card-order-offer-and-referrer-model-design.md)

## Goal

Let administrators set an optional expiration date on a card-order offer. Replace the global card-order launch cutoff with the `LAUNCH` offer: a ₱599 card price that an administrator configures with a manual expiry date, normally one month after launch begins. After that date, customers can still order at the regular ₱799 price.

## Existing behavior

- Offers have an optional fixed card price and usage limit. Checkout aliases can apply an offer, a referrer, or both.
- The global launch end date currently sets the card price to ₱599 before its date and ₱799 on or after it. Leaving the date blank also blocks card ordering.
- Offer aliases use the offer's price and shared usage rules. Submitted orders keep their saved price and discount snapshots.
- Local demo and Convex checkout must behave the same way.

## Terms and date rules

- **Offer expiry date:** An optional date entered by an administrator on an offer. It is a cutoff date in the Asia/Manila timezone: the offer is valid before the selected date and unavailable on or after that date. This preserves the current launch cutoff boundary.
- **Expired offer:** An offer whose expiry date has been reached. All checkout aliases that refer to it are unavailable, even if those aliases remain active.
- **Regular card price:** ₱799, applied when an order has no valid offer.

The date is entered manually; the system does not calculate it from an activation date or extend it when other offer fields are edited. To run a one-month launch, the administrator sets the `LAUNCH` expiry date to the desired cutoff.

## Offer behavior

- Add an optional expiry date to card-order offers. Offers without an expiry date keep their current unlimited-time behavior.
- Preserve the existing one-code checkout field and exact alias mapping. Do not add code stacking or infer offer mappings from code text.
- Check offer expiry wherever offer eligibility is checked: checkout preview and authoritative order submission. Submission must use the server-side current time/date and reject an expired offer independently of the preview result. An expired offer does not consume a use.
- An order submitted with an expired code is rejected with an actionable message; the customer can remove the code and continue at ₱799.
- Keep existing offer usage limits, first-order eligibility, referrer attribution, commission, shipping, and payment behavior unchanged.

## LAUNCH pricing and ordering

- Configure `LAUNCH` as an offer with a fixed card price of ₱599 and a manually entered expiry date. For a one-month launch, the administrator chooses a cutoff one calendar month after the launch starts.
- The regular card price is always ₱799 when no valid offer is applied. An expired `LAUNCH` offer stops applying its price; it does not prevent the customer from ordering.
- Remove the “Card ordering launch” / “Launch end date” control from Admin Settings and stop using the global date to calculate order prices or determine whether ordering is configured.
- Keep the existing active payment-method requirement for ordering. Offer expiry does not replace or modify that requirement.
- Do not rewrite prices, discounts, or other snapshots on orders that already exist.

## Admin experience

- Add an optional expiry date field to the offer editor in `/admin/codes`. Administrators can set, edit, or clear the date.
- Show each offer's configured expiry date and whether it is expired in the Codes workspace. An alias display continues to identify its mapped offer and referrer.
- Do not add an automatic one-month duration, activation date, or start/end scheduling controls. The administrator enters the launch cutoff date directly.
- Remove the launch date field and its save flow from Admin Settings.

## Data and compatibility

- Store the optional expiry date on the offer, not on individual aliases, so every alias shares the same time window.
- Existing offers with no expiry date remain usable until an administrator sets one. The `LAUNCH` offer must be configured with its ₱599 fixed price and chosen expiry date in the Codes workspace.
- Stop consulting the legacy global launch end date. It is not an ordering gate and does not change the saved details on existing orders.
- Preserve existing offer usage counts, alias mappings, referrer attribution, orders, and historical snapshots.
- Keep the same validation, cutoff comparison, and checkout behavior in Convex and local demo mode.

## Scope

- Included: manual expiry dates for card-order offers; expired-offer enforcement in checkout; replacing the global launch pricing cutoff with the `LAUNCH` offer.
- Excluded: automatic expiry calculation, offer start dates, date/time scheduling, stacking multiple codes, limits on referrer-only codes that are not mapped to an offer, and changes to commissions, payment, shipping, or fulfillment.

## Alternatives considered

1. **Manual expiry per offer (selected):** Keeps each discount and its expiry together. `LAUNCH` uses the same offer model and an administrator enters its cutoff date.
2. **Keep the global launch date and add offer expiry:** Gives launch pricing two independent controls and preserves the date as an ordering gate; this would leave duplicate, conflicting behavior.
3. **Add start and end dates to every offer:** Supports scheduled campaigns, but a start date is not required for the requested time limit.

## Acceptance criteria

- Administrators can set, edit, or clear an offer expiry date. An offer with no date remains time-unlimited.
- At the selected cutoff date in Manila, the offer is unavailable in preview and rejected by order submission. No alias can bypass the offer's expiry, and a rejected attempt does not consume a use.
- An expired code can be removed so the customer can place the order at ₱799, assuming the existing account and payment requirements are met.
- An administrator can configure `LAUNCH` at ₱599 and manually enter its one-month cutoff date; editing another offer field does not recalculate or extend the expiry.
- Admin Settings no longer exposes or uses the global launch end date. Its blank value no longer closes ordering.
- Existing submitted orders retain their original price, discount, referral, and commission snapshots.
- Convex and local demo use the same date boundary and offer-expiry behavior.

## Validation

- Verify offers without an expiry remain usable and offers with an expiry are available before the cutoff and unavailable on and after it in Asia/Manila.
- Verify an expired offer is unavailable through every alias that points to it in preview and order submission, and does not increment its usage count.
- Verify an expired `LAUNCH` code can no longer give the ₱599 price while an order without a code remains available at ₱799.
- Verify the legacy launch end date no longer blocks ordering, while the existing active-payment-method requirement still applies.
- Verify edits to offer pricing or other fields do not change expiry unless the administrator changes or clears the date.
- Verify old orders keep their saved price and discount snapshots, and run the same cases in local demo and Convex modes.
