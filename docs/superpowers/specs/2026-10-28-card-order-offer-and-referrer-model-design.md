# Card-order offers and referrer attribution

**Date:** 2026-10-28
**Status:** Approved
**Related work:** Issues #151, #166, and #167; PR #169

## Goal

Define a reusable model that represents each card-order discount offer separately from the referrer it may credit. `FOUNDING` is one offer: it sets the card price to ₱299 and has a shared cap of 25 submitted orders. `LAUNCH` is a different offer with its own pricing rule and usage pool. `AHRON` identifies the referrer.

The existing one-field checkout experience can use explicit aliases to apply an offer alone or with a referrer: `FOUNDING` and `FOUNDING-AHRON` resolve to the `FOUNDING` offer, while `LAUNCH` and `LAUNCH-AHRON` resolve to the `LAUNCH` offer.

This corrects the per-combined-code limit interpretation in the approved [code limits and admin copy spec](2026-10-28-card-order-code-limits-and-admin-copy-design.md). The current exact-code cap can give `FOUNDING` and `FOUNDING-AHRON` separate pools even though `FOUNDING` is the limited offer.

## Terms

- **Offer:** A buyer pricing rule using the existing fixed-price or percentage-discount behavior, with its own optional usage limit and count. `FOUNDING` sets the card price to ₱299 and is limited to 25 uses. `LAUNCH` has its separately configured pricing rule and limit.
- **Referrer:** The referral attribution used for the existing commission workflow. `AHRON` identifies the referrer.
- **Checkout code:** The exact value entered by the customer. It resolves to an offer, a referrer, or both.
- **Alias:** An explicitly configured checkout code mapping to at most one offer and one referrer. For example, `FOUNDING` maps to the offer alone; `FOUNDING-AHRON` maps to that offer and the AHRON referrer. The same pattern applies to `LAUNCH` and `LAUNCH-AHRON`.
- **Use:** One submitted order that applies a limited offer. Canceled and refunded orders remain counted, matching existing behavior.

## Checkout behavior

- Keep one code field at checkout and allow only one checkout code per order; do not add code stacking.
- Resolve entered values through explicit alias mappings. Do not infer the offer or referrer by splitting on hyphens.
- `FOUNDING` applies the ₱299 offer without referrer attribution.
- `FOUNDING-AHRON` applies the same ₱299 offer and attributes the order to AHRON.
- `LAUNCH` applies the independently configured `LAUNCH` offer without referrer attribution. For example, its pricing rule may use the existing 10%-off behavior.
- `LAUNCH-AHRON` applies that same `LAUNCH` offer and attributes the order to AHRON.
- Additional aliases may map any offer to another referrer without creating another offer or usage pool. The referrer component does not change the offer's pricing rule or usage limit.
- Existing referral-only codes retain their current pricing, eligibility, and commission behavior.
- Keep the existing first-order eligibility, commission calculation, shipping treatment, and payment behavior. A code's pricing and commission snapshots remain on the order after later edits.

## Shared usage limit

- Store each usage limit and count on its offer, rather than on each checkout alias. Offers have independent usage pools: `FOUNDING` and `LAUNCH` never consume each other's uses.
- Include every order mapped to a given offer in that offer's total, whether the customer entered the offer alias alone or an alias that also identifies a referrer. For example, `FOUNDING`, `FOUNDING-AHRON`, and any other `FOUNDING` alias all consume the `FOUNDING` pool.
- The five existing submitted orders count toward the cap, leaving 20 additional orders. Reconcile those five against historical orders before enabling the cap. If the total cannot be confirmed, keep the cap unavailable and surface an actionable admin error.
- Preview checks whether the offer has remaining uses but does not consume one.
- Order submission checks and increments the offer count in the same Convex transaction that creates the order. Concurrent orders using different aliases for the same offer must not exceed its cap.
- Once an offer reaches its limit, every alias for that offer is unavailable. Raising or clearing the limit restores availability according to the resulting count. If `LAUNCH` has a limit, all `LAUNCH` aliases share it independently of `FOUNDING`.

## Admin Codes view

- Show each offer once with its pricing rule and shared usage. For example, show `FOUNDING` as `5 of 25 uses · 20 remaining` across its aliases.
- Make each checkout alias's mapping clear, such as `FOUNDING-AHRON → FOUNDING + AHRON` and `LAUNCH-AHRON → LAUNCH + AHRON`.
- Configure, edit, or clear the usage limit on the offer. Aliases do not show or accept separate limits for the same offer.
- Keep referrer attribution review available for orders, without changing historical order snapshots.

## Historical data and migration

- Preserve existing orders, pricing snapshots, referral snapshots, commissions, and statuses.
- Map existing combined code records to explicit offer and referrer identities without parsing their strings. Map `FOUNDING` and `FOUNDING-AHRON` to the `FOUNDING` offer, and map `FOUNDING-AHRON` to AHRON.
- Backfill each offer's usage from historical submitted orders across all aliases. Make the backfill idempotent so retries do not double-count.
- Do not enable the `FOUNDING` cap until its backfill is complete and the known total of five uses is verified. Any other `FOUNDING` aliases must use that completed shared count immediately. Apply the same backfill rule when migrating another offer with historical orders.
- Keep Convex and local-demo behavior consistent.

## Scope

- Use the same offer/referrer model for future card-order codes, not a special-case `FOUNDING` rule, while preserving the existing single-field checkout experience.
- Do not change the ₱299 price, commission formula or rate, first-order rule, shipping, payment, or order-status behavior.
- Do not rewrite or delete historical orders or their snapshots.
- Preserve existing standalone referral-code behavior. Apply offer-level usage pooling when a checkout alias is explicitly mapped to an offer; keep unrelated legacy code limits unchanged unless they are intentionally migrated.

## Acceptance criteria

- `FOUNDING` and `FOUNDING-AHRON` resolve to the same offer and consume the same usage count.
- `LAUNCH` and `LAUNCH-AHRON` resolve to a different shared offer and do not consume `FOUNDING` usage.
- The five historical orders appear as 5 of 25 uses, leaving 20 additional orders across all `FOUNDING` aliases.
- Mixed-alias submissions for `FOUNDING` succeed through the 20th additional use; preview and submission reject subsequent `FOUNDING` uses.
- Concurrent submissions across different aliases for the same offer cannot exceed that offer's limit.
- `FOUNDING-AHRON` orders retain AHRON attribution and existing commission behavior; `FOUNDING` orders have no referrer attribution.
- The admin view shows one offer-level cap per offer and identifies each alias's offer/referrer mapping.
- Backfill can be retried without changing historical snapshots or counting an order twice.
- Existing referral-only codes and both local-demo and Convex checkout continue to work as before.

## Validation

- Test exact alias resolution for `FOUNDING`, `FOUNDING-AHRON`, `LAUNCH`, and `LAUNCH-AHRON`, including the offer price and referrer attribution.
- Seed historical orders across both aliases and verify a single count of five after backfill and after a retry.
- Verify the 20th additional `FOUNDING` order is accepted and the next is rejected in preview and submission, regardless of alias.
- Verify `LAUNCH` usage is independent from `FOUNDING` usage, including when each offer has a configured limit.
- Submit concurrent orders using different aliases for the same offer and verify its shared cap is not exceeded.
- Verify raising or clearing the offer limit restores availability without changing saved order snapshots.
- Verify the admin view shows the offer-level count and alias mappings in both Convex and local-demo modes.
