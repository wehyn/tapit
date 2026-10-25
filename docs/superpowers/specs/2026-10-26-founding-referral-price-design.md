# Fixed-price referral code design

**Date:** 2026-10-26  
**Status:** Conversation decision confirmed; awaiting spec review

## Goal

Allow a referral code to set a fixed card price while preserving the existing referral commission workflow. Configure `FOUNDING` to make the card price ₱299.

## Behavior

- An active referral code may use either the existing 10% discount or an optional fixed card price. Existing codes without a fixed price continue to receive 10% off the current card price.
- `FOUNDING` uses a fixed price of ₱299, regardless of whether the base card price is the ₱599 launch price or ₱799 regular price.
- Shipping stays separate and is quoted by an admin. The referral price applies only to the card.
- Commission remains 10% of the card's pre-discount price, excluding shipping. For `FOUNDING`, commission is ₱59.90 on a ₱599 launch order or ₱79.90 on a ₱799 regular order.
- The code remains restricted to a customer's first order. Only one code may be used, so referral discounts do not stack.
- The order snapshots the base card price, applied discount, referral code, and commission at submission. Editing a code later does not change existing orders.

## Implementation shape

- Add optional `fixedPriceCentavos` to referral-code records. A missing value retains the current 10% rule. A configured fixed price is validated as a positive whole-centavo amount no greater than the current lowest card price (₱599), ensuring it can only lower the card price in either pricing period.
- Expose the optional fixed price in admin Settings so codes can be created or edited with a fixed amount. Display each code's pricing rule in the code list.
- Use one shared calculation for customer preview, local demo order creation, Convex preview, and Convex order creation. The server remains authoritative; the commission calculation continues to use the base card price.
- Keep the same behavior in local demo and Convex modes. Existing stored codes remain valid without migration because the new field is optional.
- Update the existing local demo `FOUNDING` entry to the ₱299 fixed-price rule.

## Scope

This change adds fixed buyer pricing to referral codes. It does not change referral eligibility, commission rates or payout states, launch dates, shipping, payment, or the 10% default for other codes. It does not add a first-25 cap or a separate non-referral offer.

## Validation

Validate fixed prices at both the admin mutation boundary and when applying a code. Confirm that unset prices retain the 10% behavior, `FOUNDING` produces a ₱299 card price in both launch and regular periods, shipping remains separate, commission remains based on the base card price, and existing orders keep their snapshots.
