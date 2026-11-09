---
name: verify-card-order-lifecycle
description: Check changes to Tapit's card-order lifecycle (payment, fulfillment, referral commission) against a TLA+ model and an exhaustive walk of the real transition function. Use when touching transitionCardOrder, convex/cardOrders.ts admin mutations, or the order status fields in convex/schema.ts.
---

# Verify the card order lifecycle

Use this when a change touches `transitionCardOrder`, `canTransitionCardOrder`, `isCardOrderAwaitingPayment` in `src/lib/domain/state-machines.ts`, the admin order mutations in `convex/cardOrders.ts`, the demo order code in `src/lib/demo/card-ordering.ts`, or `paymentStatus`, `fulfillmentStatus`, `commissionStatus` in `convex/schema.ts`.

## Property

An order is only delivered after it was paid, a referral commission is only payable after delivery and payment, and a cancelled or refunded order never leaves a commission waiting to be paid out.

Harm if it breaks: a customer's card ships without payment, or Tapit owes a referrer money for an order that never completed.

The ten rules are the `INVARIANTS` in `verification/card-order/CardOrder.cfg`, each with a plain-English comment in `CardOrder.tla`.

## Run

1. Run `/statechart` on `verification/card-order/CardOrder.tla` with config `CardOrder.cfg` and view `view.mjs`. Read the result with it: every broken rule is shown as its shortest path, and a pass draws the chart of the order lifecycle. Use a new output folder each time.
2. From the repository root run `npx vitest run --project unit tests/verification/card-order-model.test.ts`. It walks every order reachable through the real `transitionCardOrder`, checks the same rules on each, and pins the reachable state and step counts to the model's.
3. For behaviour through Convex run `npm run test -- convex/integration/card-order-usage.test.ts` and `npm run test -- tests/unit/state-machines.test.ts`.

Both checks take seconds. Run them on every relevant change.

## Reading a failure

- TLC breaks a rule: read the path. If the path is a legal sequence of admin actions, it is a real bug in the model's picture of the code; check it against the code before anything else.
- The vitest walk fails on a rule: the real function reached a state the rules forbid. That is a real bug.
- The vitest walk fails only on the state or step count: the machine gained or lost a transition. Decide whether that was intended. If so, update `CardOrder.tla` to match, re-run TLC, then change `MODEL_STATES` and `MODEL_STEPS` in the test. TLC counts 2 more states than the test (19 against 17) because the model also records whether a quote was sent, which splits "cancelled before payment".
- Never loosen an invariant to make a run pass.

## Scope and assumptions

One order, up to the two starting points (with and without a referral). Each action is one Convex mutation, which is one transaction; the model assumes mutations on one order do not interleave, as Convex guarantees for a single document write. Left out: amounts and prices, shipping quote values, offers and referral usage counters, receipts and payment QR uploads, audit logs, who the administrator is, the customer-facing order form. The conformance test checks the pure function only; the extra guard in `markPaymentReceived` (a shipping quote must exist) is modelled in TLA+ and exercised by the integration suites, not by the walk.

Observed, not a rule: refunding a delivered order whose commission is already paid out keeps the commission `paid`. There is no clawback. This is deliberate (commit `5f9f549`) but the chart shows it as a state, so a reviewer can decide if it is acceptable.

## Coverage record

- `src/lib/domain/state-machines.ts`: `transitionCardOrder` (all seven events), `canTransitionCardOrder`, `isCardOrderAwaitingPayment`.
- `convex/cardOrders.ts`: `quoteShipping`, `markPaymentReceived`, `markDelivered`, `cancelOrder`, `refundOrder`, `markCommissionEligible`, `recordCommissionPayout`; the initial state set in the order-creation mutation (`commissionStatus: hasReferrer ? "pending" : "none"`).
- `verification/card-order/`: model, config, chart view. `tests/verification/card-order-model.test.ts`: walk of the real function.
- Sync commit: `91ec266c908683fc5f975b4a109148bf28e5fa4a`.

After any covered file changes, re-read the model against the new code, re-run all checks, and move the sync commit forward only once you have confirmed the model still describes the code at that commit.

## Proof the checks can fail

Both were seen failing on a broken variant, then restored:

- Model: `Deliver` allowed from `awaiting_payment` without payment. TLC reports `DeliveredIsPaid` broken in two steps (quote, deliver).
- Code: `deliver` in `transitionCardOrder` allowed from `awaiting_payment`. The vitest walk failed on the rules and on the state count.

For later drift checks, use `/maintain-formal-verification-skill`.
