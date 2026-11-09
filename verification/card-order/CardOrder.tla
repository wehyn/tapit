---- MODULE CardOrder ----
\* Model of one Tapit card order. Mirrors transitionCardOrder in
\* src/lib/domain/state-machines.ts and the admin mutations in convex/cardOrders.ts.
\* Each action below is one Convex mutation, which is one atomic transaction.
EXTENDS Naturals

VARIABLES pay, ful, com, ref, quoted
vars == <<pay, ful, com, ref, quoted>>

Pay == {"unpaid", "received", "refunded"}
Ful == {"awaiting_shipping_quote", "awaiting_payment", "processing", "delivered", "cancelled"}
Com == {"none", "pending", "eligible", "paid", "void"}

Init ==
  /\ ref \in BOOLEAN
  /\ pay = "unpaid"
  /\ ful = "awaiting_shipping_quote"
  /\ com = IF ref THEN "pending" ELSE "none"
  /\ quoted = FALSE

\* Retire commission on cancel or refund: a paid commission stays paid.
Retired == IF com = "paid" THEN "paid" ELSE IF ref THEN "void" ELSE "none"

QuoteShipping ==
  /\ pay = "unpaid" /\ ful = "awaiting_shipping_quote"
  /\ ful' = "awaiting_payment" /\ quoted' = TRUE
  /\ UNCHANGED <<pay, com, ref>>

ReceivePayment ==
  /\ quoted \* markPaymentReceived rejects an order with no shipping quote
  /\ pay = "unpaid" /\ ful = "awaiting_payment"
  /\ pay' = "received" /\ ful' = "processing"
  /\ UNCHANGED <<com, ref, quoted>>

Deliver ==
  /\ pay = "received" /\ ful = "processing"
  /\ ful' = "delivered"
  /\ UNCHANGED <<pay, com, ref, quoted>>

Cancel ==
  /\ pay = "unpaid" /\ ful \in {"awaiting_shipping_quote", "awaiting_payment"}
  /\ ful' = "cancelled" /\ com' = Retired
  /\ UNCHANGED <<pay, ref, quoted>>

Refund ==
  /\ pay = "received" /\ ful \in {"processing", "delivered"}
  /\ pay' = "refunded"
  /\ ful' = IF ful = "delivered" THEN "delivered" ELSE "cancelled"
  /\ com' = Retired
  /\ UNCHANGED <<ref, quoted>>

CommissionEligible ==
  /\ ful = "delivered" /\ pay = "received" /\ com = "pending"
  /\ com' = "eligible"
  /\ UNCHANGED <<pay, ful, ref, quoted>>

PayCommission ==
  /\ ful = "delivered" /\ pay = "received" /\ com = "eligible"
  /\ com' = "paid"
  /\ UNCHANGED <<pay, ful, ref, quoted>>

\* End states change nothing, so TLC does not call them deadlocks.
Done ==
  /\ ful = "cancelled" \/ (ful = "delivered" /\ com \in {"none", "void", "paid"})
  /\ UNCHANGED vars

Next ==
  \/ QuoteShipping \/ ReceivePayment \/ Deliver \/ Cancel \/ Refund
  \/ CommissionEligible \/ PayCommission \/ Done

Spec == Init /\ [][Next]_vars

TypeOK == pay \in Pay /\ ful \in Ful /\ com \in Com /\ ref \in BOOLEAN /\ quoted \in BOOLEAN

\* Money is only ever taken after a quote exists.
PaidNeedsQuote == pay # "unpaid" => quoted
\* Nothing ships without payment.
DeliveredIsPaid == ful = "delivered" => pay \in {"received", "refunded"}
\* An order that never got paid cannot be refunded.
RefundNeedsPayment == pay = "refunded" => ful \in {"cancelled", "delivered"}
CancelledIsNotPaid == ful = "cancelled" => pay \in {"unpaid", "refunded"}
\* Only referral orders carry a commission.
NoReferralNoCommission == ~ref => com = "none"
ReferralHasCommission == ref => com # "none"
\* A commission becomes payable only after the card was delivered and paid for.
CommissionNeedsDelivery == com \in {"eligible", "paid"} => ful = "delivered"
\* A dead order never leaves a commission waiting to be paid out.
NoPayableCommissionOnDeadOrder ==
  com \in {"pending", "eligible"} => (ful # "cancelled" /\ pay # "refunded")
\* A payable commission always has money behind it.
EligibleNeedsPayment == com = "eligible" => pay = "received"

====
