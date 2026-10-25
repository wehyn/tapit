# Card Ordering Design

**Issue:** [#142](https://github.com/wehyn/tapit/issues/142)  
**Date:** 2026-10-23  
**Status:** Approved in conversation; two-sided artwork amendment added 2026-10-25, awaiting written-spec review

## Goal

Let an active Tapit customer submit an order for one physical NFC + QR card with front and back artwork, choose a manual payment method, and optionally use an approved referral code. Admins can configure payment methods and referral codes, process orders, and record referral commission payouts.

## Customer flow

- Add `/app/card/order-card` inside the authenticated customer workspace. Link the existing card-builder order action to this page. The order page owns the design upload or URL field, so a file previewed on `/build-card` must be selected again there.
- Require one source for each side: independently choose a PNG/JPG upload strictly under 5 MiB and at most 6,000,000 decoded pixels, or an HTTPS URL for the front and back. Keep uploaded originals private; do not fetch customer URLs from the server. Each order upload also keeps the existing maximum edge of 12,000 pixels. Client checks provide quick feedback; Convex enforces the authoritative limits.
- Show a single CR80 preview with Front and Back switches. Each side retains its own source choice, input, validation state, and uploaded-image preview; uploaded artwork crops to the CR80 ratio of 1.586:1. Require both sides before submission.
- Collect delivery name, phone, and address. Shipping remains separate: an admin quotes the fee after submission, and the customer sees the quote before paying.
- Show active payment entries with their account details and instructions. Orders are paid manually; there is no payment gateway.
- Sell one card per order. The card price is ₱599 until the admin-configured launch end date, then ₱799. An active referral code gives 10% off the current card price. During launch, a referred customer pays ₱539.10. Shipping is excluded from the discount and quoted separately.
- Require an active customer account. On submission, show a confirmation and the selected payment instructions; display shipping as pending until an admin enters a quote.

## Admin operations

- Extend admin Settings with payment-method entries, referral codes, and the launch end date. Each payment entry has a provider, label, account details, instructions, and active state. Multiple entries can use the same provider. Removing an entry hides it from new orders while existing orders keep their snapshot.
- Referral entries have a unique code, referrer label, and active state. A code is valid only for a customer’s first order. Customer-facing validation returns only validity and the resulting discount; referrer payout information stays admin-only.
- Add an admin Orders view with delivery details, front and back design sources, payment-method snapshot, price breakdown, and order/commission states. Admins can quote shipping, mark payment received, mark delivery, cancel or refund an order, mark a delivered commission eligible after the refund period, and record a manual payout reference. Existing orders with one design source remain readable as front-only orders.
- Commission equals 10% of the card price before discount, excluding shipping. For a ₱599 launch order, that is ₱59.90. A commission stays pending until delivery; an admin marks it eligible after the refund period, then marks it paid. Cancellation or refund before payout voids it. Payments to referrers happen outside Tapit.

## Data and validation

- Store orders, payment methods, and referral codes as Convex records. Keep order amounts as integer PHP centavos and calculate all prices on the server; never trust an amount from the client.
- Each order snapshots the card price, discount, shipping quote, selected payment details, referral code/referrer, and commission amount. Later edits to settings or codes cannot rewrite existing orders.
- Store one private asset reference or HTTPS URL per side, never both for the same side. Preserve the existing `designSource` field as the front source and add optional `backDesignSource`; new order submission requires both while existing one-sided records remain valid. Validate each uploaded file's type, strict under-5-MiB byte cap, decoded pixel count of at most 6,000,000, maximum 12,000-pixel edge, and image content at the upload boundary. Validate URLs, payment entry status, referral status, first-order eligibility, and customer identity again in the order mutation.
- Restrict customer order queries to the authenticated owner. Only administrators can list all orders, view referral labels and addresses, or change payment, delivery, eligibility, and payout states.
- Match the same behavior in local demo mode using the existing demo-state store.
- Require an admin-configured launch end date and at least one active payment entry before orders can be submitted. The ₱599 price applies before that date; ₱799 applies at or after it. Existing orders retain the price calculated at submission.

## Scope

Included: first-order referral discount and commission tracking; customer delivery details; manual shipping quotes; manual customer payment status; manual commission eligibility and payout records; local demo parity.

Excluded: card quantities and team bundles, student/founders/Card Care offers, arbitrary coupon types, shipping-carrier integration, automatic payment or commission transfers, automated refund-period timers, and payment/referral account data exposed to customers beyond the selected payment instructions.

## Alternatives considered

1. **Separate authenticated order page (selected):** keeps order entry in the customer workspace and gives admins a durable order and commission record. The design file is selected on this page, even if it was previewed earlier on `/build-card`.
2. Extend `/build-card` into checkout: preserves its selected file but couples design preparation and order management.
3. Email/manual intake: less backend work but does not provide order ownership, payment status, or commission tracking.

## Validation approach

Review the customer flow in both local demo and Convex mode. Check the file-size and decoded-pixel boundaries, that uploaded files remain private, customers cannot read other customers’ orders, disabled payment methods/codes are rejected at submission, launch-date boundaries produce the right price, referral totals round to centavos, and canceled/refunded orders do not leave an unpaid commission. Automated test creation or execution is not part of this design approval.

## Two-sided artwork amendment (2026-10-25)

- The customer selects Front or Back in a single preview. The selected side has an independent upload/HTTPS URL choice and independent validation and preview state.
- Both sides are required for new orders. File limits apply separately to each uploaded image. HTTPS URLs remain un-fetched by Tapit.
- Keep `designSource` as the front source and add optional `backDesignSource` to stored orders. This keeps historical single-sided orders valid; the admin view labels those as front-only.
- Update Convex upload attachment and signed-URL resolution, local demo IndexedDB asset reservation/release/deletion, account erasure, and admin artwork display to handle both sources.
- Pricing, shipping, payment, referrals, and commission behavior do not change.
