# Card Ordering Design

**Issue:** [#142](https://github.com/wehyn/tapit/issues/142)  
**Date:** 2026-10-23  
**Status:** Approved in conversation; awaiting written-spec review

## Goal

Let an active Tapit customer submit an order for one physical NFC + QR card with custom artwork, choose a manual payment method, and optionally use an approved referral code. Admins can configure payment methods and referral codes, process orders, and record referral commission payouts.

## Customer flow

- Add `/app/account/order-card` inside the authenticated customer workspace. Link the existing card-builder order action to this page. The order page owns the design upload or URL field, so a file previewed on `/build-card` must be selected again there.
- Accept one design source: a PNG/JPG upload strictly under 5 MiB and at most 6,000,000 decoded pixels, or an HTTPS URL. Keep uploaded originals private; do not fetch customer URLs from the server. The order upload also keeps the existing maximum edge of 12,000 pixels. Client checks provide quick feedback; Convex enforces the authoritative limits.
- Collect delivery name, phone, and address. Shipping remains separate: an admin quotes the fee after submission, and the customer sees the quote before paying.
- Show active payment entries with their account details and instructions. Orders are paid manually; there is no payment gateway.
- Sell one card per order. The card price is ₱599 until the admin-configured launch end date, then ₱799. An active referral code gives 10% off the current card price. During launch, a referred customer pays ₱539.10. Shipping is excluded from the discount and quoted separately.
- Require an active customer account. On submission, show a confirmation and the selected payment instructions; display shipping as pending until an admin enters a quote.

## Admin operations

- Extend admin Settings with payment-method entries, referral codes, and the launch end date. Each payment entry has a provider, label, account details, instructions, and active state. Multiple entries can use the same provider. Removing an entry hides it from new orders while existing orders keep their snapshot.
- Referral entries have a unique code, referrer label, and active state. A code is valid only for a customer’s first order. Customer-facing validation returns only validity and the resulting discount; referrer payout information stays admin-only.
- Add an admin Orders view with delivery details, design source, payment-method snapshot, price breakdown, and order/commission states. Admins can quote shipping, mark payment received, mark delivery, cancel or refund an order, mark a delivered commission eligible after the refund period, and record a manual payout reference.
- Commission equals 10% of the card price before discount, excluding shipping. For a ₱599 launch order, that is ₱59.90. A commission stays pending until delivery; an admin marks it eligible after the refund period, then marks it paid. Cancellation or refund before payout voids it. Payments to referrers happen outside Tapit.

## Data and validation

- Store orders, payment methods, and referral codes as Convex records. Keep order amounts as integer PHP centavos and calculate all prices on the server; never trust an amount from the client.
- Each order snapshots the card price, discount, shipping quote, selected payment details, referral code/referrer, and commission amount. Later edits to settings or codes cannot rewrite existing orders.
- Store either a private card-design asset reference or an HTTPS URL, never both. Validate file type, the strict under-5-MiB byte cap, decoded pixel count of at most 6,000,000, maximum 12,000-pixel edge, and image content at the upload boundary. Validate URLs, payment entry status, referral status, first-order eligibility, and customer identity again in the order mutation.
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
