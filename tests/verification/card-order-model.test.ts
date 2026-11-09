import { describe, expect, it } from "vitest";

import {
  transitionCardOrder,
  type CardOrderEvent,
  type CardOrderState,
} from "@/lib/domain/state-machines";

// Explores every order reachable through the real transitionCardOrder and
// checks the rules of verification/card-order/CardOrder.tla on each one.
// The TLC counts below come from the model; a mismatch means the code and the
// model no longer describe the same machine.
const EVENTS: CardOrderEvent[] = [
  "quote_shipping",
  "receive_payment",
  "deliver",
  "cancel",
  "refund",
  "commission_eligible",
  "pay_commission",
];
const MODEL_STATES = 17; // TLC counts 19: it also splits "cancelled before payment" by whether a quote was sent
const MODEL_STEPS = 18;

const key = (s: CardOrderState) =>
  `${s.paymentStatus}|${s.fulfillmentStatus}|${s.commissionStatus}|${s.hasReferral}`;

function explore() {
  const start = (hasReferral: boolean): CardOrderState => ({
    paymentStatus: "unpaid",
    fulfillmentStatus: "awaiting_shipping_quote",
    commissionStatus: hasReferral ? "pending" : "none",
    hasReferral,
  });
  const seen = new Map<string, CardOrderState>();
  const steps: { from: CardOrderState; event: CardOrderEvent; to: CardOrderState }[] = [];
  const queue = [start(false), start(true)];
  for (const s of queue) seen.set(key(s), s);
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const event of EVENTS) {
      let change;
      try {
        change = transitionCardOrder(from, event);
      } catch {
        continue;
      }
      const to = { ...from, ...change };
      steps.push({ from, event, to });
      if (!seen.has(key(to))) {
        seen.set(key(to), to);
        queue.push(to);
      }
    }
  }
  return { states: [...seen.values()], steps };
}

describe("card order model conformance", () => {
  const { states, steps } = explore();

  it("reaches exactly the states and steps of the TLA+ model", () => {
    expect(states).toHaveLength(MODEL_STATES);
    expect(steps).toHaveLength(MODEL_STEPS);
  });

  it("keeps every rule of CardOrder.tla in every reachable state", () => {
    for (const s of states) {
      const { paymentStatus: pay, fulfillmentStatus: ful, commissionStatus: com } = s;
      const where = key(s);
      if (ful === "delivered") expect(["received", "refunded"], where).toContain(pay);
      if (pay === "refunded") expect(["cancelled", "delivered"], where).toContain(ful);
      if (ful === "cancelled") expect(["unpaid", "refunded"], where).toContain(pay);
      if (!s.hasReferral) expect(com, where).toBe("none");
      if (s.hasReferral) expect(com, where).not.toBe("none");
      if (com === "eligible" || com === "paid") expect(ful, where).toBe("delivered");
      if (com === "pending" || com === "eligible") {
        expect(ful, where).not.toBe("cancelled");
        expect(pay, where).not.toBe("refunded");
      }
      if (com === "eligible") expect(pay, where).toBe("received");
    }
  });

  it("takes payment only from an order that was quoted", () => {
    for (const step of steps.filter((x) => x.event === "receive_payment"))
      expect(step.from.fulfillmentStatus).toBe("awaiting_payment");
  });
});
