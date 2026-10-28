# Card-order code limits and admin Codes copy

**Date:** 2026-10-28
**Status:** Approved
**Issues:** #166, #167

## Goal

Give card-order codes an optional usage limit and make the `/admin/codes` wording cover codes that provide a discount, identify a referrer, or do both.

## Terms

- A code is the exact combined value entered at checkout. For example, `FOUNDING-AHRON` is one code record: `FOUNDING` describes the discount and `AHRON` identifies the referrer.
- A use is a submitted card order associated with that exact code.

## Usage limits

- Admins can set an optional positive whole-number usage limit when creating or editing a code. An unset limit means unlimited use. Invalid values are rejected.
- Count one use when an order using the code is submitted. A preview does not consume a use.
- Submitted orders continue to consume a use if they are later canceled or refunded, matching the existing usage-count behavior.
- When the usage count reaches the limit, the code is unavailable for new orders. The preview reports it as unavailable, and order creation enforces the limit as the authoritative check.
- Check availability and record the order and usage in the same Convex mutation so concurrent submissions cannot exceed the limit. Apply the same behavior in the local demo.
- Show each code's usage count, limit, and remaining uses in the admin Codes view. A code at its limit shows no remaining uses.
- If an admin lowers a limit to the existing usage count or below it, the code becomes unavailable until its limit is raised or cleared. Existing orders and their snapshots remain unchanged.
- Existing codes without a configured limit remain unlimited.

## FOUNDING-AHRON limit

- Apply a total limit of 25 to the existing full code `FOUNDING-AHRON`.
- Preserve the five uses already taken, leaving 20 additional submitted orders available.
- Apply the limit to the exact `FOUNDING-AHRON` code record. Do not treat `FOUNDING` alone as the limited code or split the code to determine which record receives the limit.

## `/admin/codes` copy

Make only these copy changes:

| Location         | Current copy                                                                                   | Required change                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Page description | `Manage referral codes and review their order usage.`                                          | Replace with `Manage codes and review their order usage.` |
| Card heading     | `Referral codes`                                                                               | Remove the heading.                                       |
| Card description | `Codes are unique across active and inactive records. Fixed prices must be no more than ₱599.` | Remove the description.                                   |

The page title remains `Codes`. Other field labels, validation, and code management behavior are outside this copy change.

## Scope limits

- Keep one combined code entry per order; do not add separate discount and referrer code fields or discount stacking.
- Do not change code pricing, referral commission, first-order eligibility, or order cancellation and refund behavior.
- Do not rewrite historical orders or their saved pricing, referral, or commission snapshots.
- Keep the limit behavior consistent between Convex and the deterministic local demo.

## Acceptance criteria

- Admins can set, edit, or clear a usage limit. A blank limit leaves a code unlimited; invalid limits are rejected.
- A limited code is available through its final allowed submission and unavailable afterward, including when multiple orders are submitted concurrently.
- Preview reports an exhausted code as unavailable, while the order-creation mutation independently enforces the cap.
- Canceled and refunded submitted orders remain counted.
- Admins can see usage, limit, and remaining uses for each code.
- `FOUNDING-AHRON` is shown as 5 of 25 uses consumed and permits no more than 20 additional submitted orders.
- Convex and local demo behavior match, including for existing unlimited codes.
- `/admin/codes` uses the replacement page description and removes the specified card heading and description; the rest of the code workflow remains available.

## Validation

- Cover an unlimited code and a limited code through preview and order submission.
- Verify the final allowed use succeeds, a later submission fails, and concurrent submissions cannot exceed the cap.
- Verify a canceled or refunded order still consumes a use and changing or clearing a limit preserves prior usage.
- Verify the admin view reports the limit and remaining uses, including for `FOUNDING-AHRON` at 5 of 25.
- Verify the exact copy changes in the admin Codes page.
