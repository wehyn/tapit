import { describe, expect, it } from "vitest";

import { cardOrderOfferAvailability } from "@/lib/card-ordering";
import {
  canTransitionCardOrder,
  isCardOrderAwaitingPayment,
  transitionCardOrder,
  transitionCardStatus,
  transitionCustomerStatus,
  transitionPreparedSetup,
  transitionUploadStatus,
  type CardOrderEvent,
  type CardOrderGate,
  type CardStatus,
} from "@/lib/domain/state-machines";

const ORDER_EVENTS: CardOrderEvent[] = [
  "quote_shipping",
  "receive_payment",
  "deliver",
  "cancel",
  "refund",
  "commission_eligible",
  "pay_commission",
];

const quoted: Required<CardOrderGate> = {
  paymentStatus: "unpaid",
  fulfillmentStatus: "awaiting_payment",
  commissionStatus: "none",
};

function legalEvents(order: CardOrderGate) {
  return ORDER_EVENTS.filter((event) => canTransitionCardOrder(order, event));
}

describe("card order machine", () => {
  it("walks the happy path and exposes only legal events at each step", () => {
    let order: Required<CardOrderGate> = {
      paymentStatus: "unpaid",
      fulfillmentStatus: "awaiting_shipping_quote",
      commissionStatus: "pending",
    };
    expect(legalEvents(order)).toEqual(["quote_shipping", "cancel"]);

    order = { ...order, ...transitionCardOrder({ ...order, hasReferral: true }, "quote_shipping") };
    expect(legalEvents(order)).toEqual(["receive_payment", "cancel"]);

    order = {
      ...order,
      ...transitionCardOrder({ ...order, hasReferral: true }, "receive_payment"),
    };
    expect(legalEvents(order)).toEqual(["deliver", "refund"]);

    order = { ...order, ...transitionCardOrder({ ...order, hasReferral: true }, "deliver") };
    expect(legalEvents(order)).toEqual(["refund", "commission_eligible"]);

    order = {
      ...order,
      ...transitionCardOrder({ ...order, hasReferral: true }, "commission_eligible"),
    };
    expect(legalEvents(order)).toEqual(["refund", "pay_commission"]);
  });

  it("treats cancelled and refunded-cancelled orders as terminal", () => {
    const cancelled: Required<CardOrderGate> = {
      ...quoted,
      ...transitionCardOrder({ ...quoted, hasReferral: false }, "cancel"),
    };
    expect(legalEvents(cancelled)).toEqual([]);
    const refunded: Required<CardOrderGate> = {
      paymentStatus: "received",
      fulfillmentStatus: "processing",
      commissionStatus: "none",
    };
    expect(
      legalEvents({
        ...refunded,
        ...transitionCardOrder({ ...refunded, hasReferral: false }, "refund"),
      }),
    ).toEqual([]);
  });

  it("voids a referral commission when an order stops, but never a paid one", () => {
    expect(
      transitionCardOrder({ ...quoted, commissionStatus: "pending", hasReferral: true }, "cancel"),
    ).toMatchObject({ commissionStatus: "void" });
    expect(
      transitionCardOrder({ ...quoted, commissionStatus: "none", hasReferral: false }, "cancel"),
    ).toMatchObject({ commissionStatus: "none" });
  });

  it("keeps a paid commission paid when a paid order is refunded", () => {
    const paid = {
      paymentStatus: "received",
      fulfillmentStatus: "delivered",
      commissionStatus: "paid",
      hasReferral: true,
    } as const;
    expect(transitionCardOrder(paid, "refund")).toMatchObject({
      paymentStatus: "refunded",
      fulfillmentStatus: "delivered",
      commissionStatus: "paid",
    });
  });

  it("derives awaiting-payment from the machine", () => {
    expect(isCardOrderAwaitingPayment(quoted)).toBe(true);
    expect(isCardOrderAwaitingPayment({ ...quoted, paymentStatus: "received" })).toBe(false);
    expect(
      isCardOrderAwaitingPayment({ ...quoted, fulfillmentStatus: "awaiting_shipping_quote" }),
    ).toBe(false);
  });
});

describe("card lifecycle machine", () => {
  it("rejects events from states that do not allow them", () => {
    expect(() => transitionCardStatus("inactive", { type: "deactivate" })).toThrow(
      /Invalid card transition/,
    );
    expect(() => transitionCardStatus("lost", { type: "mark_lost" })).toThrow();
    expect(() =>
      transitionCardStatus("claimable", { type: "mark_replaced", replacementCardId: "c" }),
    ).toThrow();
  });

  it("only activates a card whose profile is published", () => {
    const attach = (published: boolean) =>
      transitionCardStatus("registered", { type: "attach", published });
    expect(attach(true)).toBe("active");
    expect(attach(false)).toBe("claimable");
  });

  it("lets an administrator recover every retired state", () => {
    const retired: CardStatus[] = ["inactive", "replaced", "lost"];
    for (const from of retired) {
      expect(
        transitionCardStatus(from, { type: "reactivate_admin", published: true, hasProfile: true }),
      ).toBe("active");
    }
  });
});

describe("account and setup machines", () => {
  it("restarts a deleted customer as pending and nothing else", () => {
    expect(transitionCustomerStatus("deleted", "restart_deleted_customer")).toBe("pending");
    expect(() => transitionCustomerStatus("active", "restart_deleted_customer")).toThrow();
    expect(() => transitionCustomerStatus("deleted", "accept_invitation")).toThrow();
  });

  it("moves a prepared setup waiting -> active only through a claim", () => {
    expect(transitionPreparedSetup("draft", "issue_link")).toBe("waiting");
    expect(transitionPreparedSetup("waiting", "claim")).toBe("active");
    expect(() => transitionPreparedSetup("draft", "claim")).toThrow();
    expect(() => transitionPreparedSetup("active", "revoke_link")).toThrow();
  });
});

describe("upload machines", () => {
  it("keeps each upload kind on its own path", () => {
    expect(transitionUploadStatus("receipt", "pending", "start_processing")).toBe("processing");
    expect(transitionUploadStatus("receipt", "attached", "replace")).toBe("replaced");
    expect(transitionUploadStatus("payment_qr", "attached", "replace")).toBe("available");
    expect(() => transitionUploadStatus("design", "processing", "fail")).toThrow();
  });
});

describe("offer availability", () => {
  const now = Date.UTC(2026, 5, 15, 4, 0, 0);
  it("reports available, expired, and exhausted from one rule", () => {
    expect(cardOrderOfferAvailability({ usageCount: 0 }, now)).toBe("available");
    expect(cardOrderOfferAvailability({ usageCount: 9, usageLimit: 10 }, now)).toBe("available");
    expect(cardOrderOfferAvailability({ usageCount: 10, usageLimit: 10 }, now)).toBe("exhausted");
    expect(cardOrderOfferAvailability({ usageCount: 0, expiresOn: "2026-06-15" }, now)).toBe(
      "expired",
    );
    expect(cardOrderOfferAvailability({ usageCount: 0, expiresOn: "2026-06-16" }, now)).toBe(
      "available",
    );
    expect(
      cardOrderOfferAvailability({ usageCount: 99, usageLimit: 1, expiresOn: "2026-01-01" }, now),
    ).toBe("expired");
  });
});
