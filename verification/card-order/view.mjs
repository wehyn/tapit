// Statechart view for CardOrder.tla: the order as an administrator sees it.
export const title = "Card order: from checkout to payout";

const money = (v) => (v.pay === "refunded" ? "refunded" : v.pay === "received" ? "paid" : "unpaid");

export const state = (v) => {
  if (v.ful === "awaiting_shipping_quote") return "New order, needs a shipping quote";
  if (v.ful === "awaiting_payment") return "Quoted, waiting for payment";
  if (v.ful === "cancelled")
    return v.pay === "refunded" ? "Cancelled and refunded" : "Cancelled before payment";
  const sale =
    v.ful === "processing"
      ? "Paid, being made"
      : v.pay === "refunded"
        ? "Delivered then refunded"
        : "Delivered";
  if (!v.ref) return sale;
  const c = {
    pending: "commission pending",
    eligible: "commission ready",
    paid: "commission paid out",
    void: "commission voided",
  }[v.com];
  return `${sale}, ${c}`;
};

export const group = (v) =>
  v.ful === "awaiting_shipping_quote" || v.ful === "awaiting_payment"
    ? "yellow"
    : v.ful === "processing"
      ? "blue"
      : v.ful === "delivered" && v.pay === "received"
        ? "teal"
        : "tan";

export const colors = { yellow: "yellow", blue: "blue", teal: "teal", tan: "tan" };

export const step = (action) =>
  ({
    QuoteShipping: "admin sends the shipping quote",
    ReceivePayment: "admin marks payment received",
    Deliver: "admin marks delivered",
    Cancel: "admin cancels the unpaid order",
    Refund: "admin refunds the paid order",
    CommissionEligible: "admin marks the referral commission ready",
    PayCommission: "admin records the commission payout",
    Done: null,
  })[action] ?? action;
