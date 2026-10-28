# Card-order offers and referrer attribution

**Date:** 2026-10-28
**Status:** Draft for review
**Related work:** Issues #151, #166, and #167; PR #169

## Goal

Represent a card-order discount offer separately from the referrer it may credit. `FOUNDING` is the offer: it sets the card price to ₱299 and has a shared cap of 25 submitted orders. `AHRON` identifies the referrer. The existing checkout value `FOUNDING-AHRON` applies both.

This corrects the per-combined-code limit interpretation in the approved [code limits and admin copy spec](2026-10-28-card-order-code-limits-and-admin-copy-design.md). The current exact-code cap can give `FOUNDING` and `FOUNDING-AHRON` separate pools even though `FOUNDING` is the limited offer.

## Terms

- **Offer:** A buyer pricing rule with an optional usage limit. The `FOUNDING` offer sets the card price to ₱299 and is limited to 25 uses.
- **Referrer:** The referral attribution used for the existing commission workflow. `AHRON` identifies the referrer.
- **Checkout code:** The exact value entered by the customer. It resolves to an offer, a referrer, or both.
- **Alias:** An explicitly configured checkout code mapping. `FOUNDING` maps to the offer alone; `FOUNDING-AHRON` maps to the same offer and the AHRON referrer.
- **Use:** One submitted order that applies a limited offer. Canceled and refunded orders remain counted, matching existing behavior.

## Checkout behavior

- Keep one code field at checkout and allow only one checkout code per order; do not add code stacking.
- Resolve entered values through explicit alias mappings. Do not infer the offer or referrer by splitting on hyphens.
- `FOUNDING` applies the ₱299 offer without referrer attribution.
- `FOUNDING-AHRON` applies the same ₱299 offer and attributes the order to AHRON.
- Additional aliases may map to `FOUNDING` and another referrer without creating another offer or usage pool.
- Existing referral-only codes retain their current pricing, eligibility, and commission behavior.
- Keep the existing first-order eligibility, commission calculation, shipping treatment, and payment behavior. A code's pricing and commission snapshots remain on the order after later edits.

## Shared usage limit

- Store the 25-use limit and its usage count on the `FOUNDING` offer, rather than on each checkout alias.
- Include every order mapped to `FOUNDING` in one total, whether the customer entered `FOUNDING`, `FOUNDING-AHRON`, or another `FOUNDING` alias.
- The five existing submitted orders count toward the cap, leaving 20 additional orders. Reconcile those five against historical orders before enabling the cap. If the total cannot be confirmed, keep the cap unavailable and surface an actionable admin error.
- Preview checks whether the offer has remaining uses but does not consume one.
- Order submission checks and increments the offer count in the same Convex transaction that creates the order. Concurrent orders using different aliases must not exceed the shared cap.
- Once the count reaches the limit, every alias for the offer is unavailable. Raising or clearing the offer limit restores availability according to the resulting count.

## Admin Codes view

- Show the `FOUNDING` offer once with its pricing rule and shared usage, such as `5 of 25 uses · 20 remaining`.
- Make each checkout alias's mapping clear, such as `FOUNDING-AHRON → FOUNDING + AHRON`.
- Configure, edit, or clear the usage limit on the offer. Aliases do not show or accept separate limits for the same offer.
- Keep referrer attribution review available for orders, without changing historical order snapshots.

## Historical data and migration

- Preserve existing orders, pricing snapshots, referral snapshots, commissions, and statuses.
- Map existing `FOUNDING` and `FOUNDING-AHRON` records to the `FOUNDING` offer; map `FOUNDING-AHRON` to the AHRON referrer.
- Backfill offer usage from historical submitted orders across all aliases. Make the backfill idempotent so retries do not double-count.
- Do not enable the offer's cap until the backfill is complete and the known total of five uses is verified. Other aliases for `FOUNDING` must use the completed shared count immediately.
- Keep Convex and local-demo behavior consistent.

## Scope

- Separate the discount offer and referrer attribution for this card-order flow while preserving the existing single-field checkout experience.
- Do not change the ₱299 price, commission formula or rate, first-order rule, shipping, payment, or order-status behavior.
- Do not rewrite or delete historical orders or their snapshots.
- Do not change the limit semantics for unrelated codes in this work.

## Acceptance criteria

- `FOUNDING` and `FOUNDING-AHRON` resolve to the same offer and consume the same usage count.
- The five historical orders appear as 5 of 25 uses, leaving 20 additional orders across all `FOUNDING` aliases.
- Mixed-alias submissions succeed through the 20th additional use; preview and submission reject subsequent uses.
- Concurrent submissions across different aliases cannot exceed the shared limit.
- `FOUNDING-AHRON` orders retain AHRON attribution and existing commission behavior; `FOUNDING` orders have no referrer attribution.
- The admin view shows one offer-level cap and identifies each alias's offer/referrer mapping.
- Backfill can be retried without changing historical snapshots or counting an order twice.
- Existing referral-only codes and both local-demo and Convex checkout continue to work as before.

## Validation

- Test exact alias resolution for `FOUNDING` and `FOUNDING-AHRON`, including the offer price and referrer attribution.
- Seed historical orders across both aliases and verify a single count of five after backfill and after a retry.
- Verify the 20th additional order is accepted and the next order is rejected in preview and submission.
- Submit concurrent orders using different aliases and verify the shared cap is not exceeded.
- Verify raising or clearing the offer limit restores availability without changing saved order snapshots.
- Verify the admin view shows the offer-level count and alias mappings in both Convex and local-demo modes.
