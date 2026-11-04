/** Persistence-agnostic lifecycle transitions used by Convex and the local demo. */

export type CustomerStatus = "pending" | "invited" | "active" | "deleted";
export type CustomerEvent =
  | "complete_onboarding"
  | "accept_invitation"
  | "delete_pending"
  | "delete_prepared"
  | "approve_deletion"
  | "restart_deleted_customer"
  | "reset_demo";

const CUSTOMER_TRANSITIONS: Record<
  CustomerEvent,
  Partial<Record<CustomerStatus, CustomerStatus>>
> = {
  complete_onboarding: { pending: "active" },
  accept_invitation: { pending: "active", invited: "active", active: "active" },
  delete_pending: { pending: "deleted" },
  delete_prepared: { invited: "deleted" },
  approve_deletion: { active: "deleted" },
  restart_deleted_customer: { deleted: "pending" },
  reset_demo: { active: "pending", invited: "pending", pending: "pending" },
};

export function transitionCustomerStatus(
  from: CustomerStatus,
  event: "complete_onboarding" | "accept_invitation",
): "active";
export function transitionCustomerStatus(
  from: CustomerStatus,
  event: "delete_pending" | "delete_prepared" | "approve_deletion",
): "deleted";
export function transitionCustomerStatus(
  from: CustomerStatus,
  event: "restart_deleted_customer" | "reset_demo",
): "pending";
export function transitionCustomerStatus(
  from: CustomerStatus,
  event: CustomerEvent,
): CustomerStatus;
export function transitionCustomerStatus(
  from: CustomerStatus,
  event: CustomerEvent,
): CustomerStatus {
  const to = CUSTOMER_TRANSITIONS[event][from];
  if (to === undefined) throw new Error(`Invalid customer transition: ${from} via ${event}.`);
  return to;
}

export type DeletionStatus = "active" | "requested" | "deleted";

export function transitionDeletionStatus(from: DeletionStatus, event: "request" | "approve") {
  const transitions: Record<typeof event, Partial<Record<DeletionStatus, DeletionStatus>>> = {
    request: { active: "requested" },
    // Older records can have an open deletion request while the customer row
    // still says active; the request record remains the approval authority.
    approve: { active: "deleted", requested: "deleted" },
  };
  const to = transitions[event][from];
  if (to === undefined) throw new Error(`Invalid deletion transition: ${from} via ${event}.`);
  return to;
}

export type DeletionRequestStatus = "requested" | "approved" | "rejected";

export function transitionDeletionRequestStatus(
  from: DeletionRequestStatus,
  event: "approve",
): "approved" {
  if (from !== "requested")
    throw new Error(`Invalid deletion request transition: ${from} via ${event}.`);
  return "approved";
}

export type PreparedSetupState = "waiting" | "draft" | "active" | null;
export type PreparedSetupEvent =
  "issue_link" | "revoke_link" | "expire_link" | "claim" | "delete_draft";

export function transitionPreparedSetup(
  from: PreparedSetupState,
  event: PreparedSetupEvent,
): PreparedSetupState {
  if (event === "issue_link" && (from === "draft" || from === "waiting")) return "waiting";
  if (event === "revoke_link" && from === "waiting") return "draft";
  if (event === "expire_link" && from === "waiting") return "draft";
  if (event === "claim" && from === "waiting") return "active";
  if (event === "delete_draft" && (from === "draft" || from === "waiting")) return null;
  throw new Error(`Invalid prepared setup transition: ${from ?? "none"} via ${event}.`);
}

export type ProfileStatus = "draft" | "published" | "unpublished" | "suspended";

export function transitionProfileStatus(
  from: ProfileStatus,
  to: ProfileStatus,
  actor: "owner" | "administrator" | "system",
) {
  if (actor === "administrator" || actor === "system") return to;
  const allowed =
    (from === "draft" || from === "unpublished") && to === "published"
      ? true
      : from === "published" && (to === "unpublished" || to === "published");
  if (!allowed) throw new Error(`Invalid owner profile transition: ${from} -> ${to}.`);
  return to;
}

export type CardStatus = "registered" | "claimable" | "active" | "inactive" | "replaced" | "lost";
export type CardEvent =
  | { type: "attach"; published: boolean }
  | { type: "claim"; published: boolean }
  | { type: "publish_profile" }
  | { type: "reassign"; published: boolean }
  | { type: "deactivate" }
  | { type: "retire_for_deletion" }
  | { type: "erase_customer" }
  | { type: "mark_lost" }
  | { type: "mark_replaced"; replacementCardId: string }
  | { type: "reactivate_owner"; published: boolean }
  | { type: "reactivate_admin"; published: boolean; hasProfile: boolean };

export function transitionCardStatus(
  from: CardStatus,
  event:
    | { type: "attach"; published: boolean }
    | { type: "claim"; published: boolean }
    | { type: "reassign"; published: boolean }
    | { type: "reactivate_owner"; published: boolean },
): "active" | "claimable";
export function transitionCardStatus(
  from: CardStatus,
  event: { type: "publish_profile" },
): "active";
export function transitionCardStatus(
  from: CardStatus,
  event: { type: "deactivate" } | { type: "retire_for_deletion" } | { type: "erase_customer" },
): "inactive";
export function transitionCardStatus(from: CardStatus, event: { type: "mark_lost" }): "lost";
export function transitionCardStatus(
  from: CardStatus,
  event: { type: "mark_replaced"; replacementCardId: string },
): "replaced";
export function transitionCardStatus(
  from: CardStatus,
  event: { type: "reactivate_admin"; published: boolean; hasProfile: boolean },
): "registered" | "active" | "claimable";
export function transitionCardStatus(from: CardStatus, event: CardEvent): CardStatus;
export function transitionCardStatus(from: CardStatus, event: CardEvent): CardStatus {
  let to: CardStatus | undefined;
  switch (event.type) {
    case "attach":
      if (from === "registered") to = event.published ? "active" : "claimable";
      break;
    case "claim":
      if (from === "registered" || from === "claimable" || from === "active")
        to = event.published ? "active" : "claimable";
      break;
    case "publish_profile":
      if (from === "claimable") to = "active";
      break;
    case "reassign":
      if (from === "active" || from === "claimable") to = event.published ? "active" : "claimable";
      break;
    case "deactivate":
      if (from === "active") to = "inactive";
      break;
    case "retire_for_deletion":
      if (from === "registered" || from === "claimable" || from === "active") to = "inactive";
      break;
    case "erase_customer":
      to = "inactive";
      break;
    case "mark_lost":
      if (from !== "lost") to = "lost";
      break;
    case "mark_replaced":
      if (from === "active" && event.replacementCardId.trim().length > 0) to = "replaced";
      break;
    case "reactivate_owner":
      if (from === "inactive") to = event.published ? "active" : "claimable";
      break;
    case "reactivate_admin":
      if (from === "inactive" || from === "replaced" || from === "lost") {
        if (!event.hasProfile && from === "lost") to = "registered";
        else if (event.hasProfile) to = event.published ? "active" : "claimable";
      }
      break;
  }
  if (to === undefined) throw new Error(`Invalid card transition: ${from} via ${event.type}.`);
  return to;
}

export function canTransitionCardStatus(from: CardStatus, to: CardStatus): boolean {
  const events: CardEvent[] = [
    { type: "attach", published: true },
    { type: "attach", published: false },
    { type: "publish_profile" },
    { type: "deactivate" },
    { type: "mark_lost" },
    { type: "mark_replaced", replacementCardId: "replacement" },
  ];
  return events.some((event) => {
    try {
      return transitionCardStatus(from, event) === to;
    } catch {
      return false;
    }
  });
}

export type CorrectionStatus = "open" | "pending" | "corrected";

export function transitionCorrectionStatus(from: "open" | "pending", event: "resolve"): "corrected";
export function transitionCorrectionStatus(from: CorrectionStatus, event: "resolve"): "corrected";
export function transitionCorrectionStatus(from: CorrectionStatus, event: "resolve"): "corrected" {
  if ((from === "open" || from === "pending" || from === "corrected") && event === "resolve")
    return "corrected";
  throw new Error(`Invalid correction transition: ${from} via ${event}.`);
}

export type InvitationState = "usable" | "accepted" | "revoked" | "expired";
export type InvitationLifecycle = {
  acceptedAt?: number;
  usedAt?: number;
  invalidatedAt?: number;
  expiresAt?: number;
};

export function invitationState(invitation: InvitationLifecycle, now: number): InvitationState {
  if (invitation.invalidatedAt !== undefined) return "revoked";
  if (invitation.acceptedAt !== undefined || invitation.usedAt !== undefined) return "accepted";
  if (invitation.expiresAt !== undefined && invitation.expiresAt <= now) return "expired";
  return "usable";
}

export function transitionInvitationState(
  from: InvitationState,
  event: "accept" | "revoke",
): InvitationState {
  if (event === "accept" && from === "usable") return "accepted";
  if (event === "accept" && from === "accepted") return "accepted";
  if (event === "revoke" && (from === "usable" || from === "expired" || from === "revoked"))
    return "revoked";
  throw new Error(`Invalid invitation transition: ${from} via ${event}.`);
}

export type ClaimCodeState = "missing" | "issued" | "claimed" | "invalidated";
export type ClaimCodeLifecycle = {
  claimCodeHash?: string;
  claimCodeExpiresAt?: number;
  claimCodeInvalidatedAt?: number;
  claimCodeClaimedAt?: number;
};

export function claimCodeState(code: ClaimCodeLifecycle): ClaimCodeState {
  if (code.claimCodeInvalidatedAt !== undefined) return "invalidated";
  if (code.claimCodeClaimedAt !== undefined) return "claimed";
  if (code.claimCodeHash === undefined) return "missing";
  return "issued";
}

export type ClaimChallengeState = "active" | "used" | "expired";

export function claimChallengeState(
  challenge: { usedAt?: number; expiresAt: number },
  now: number,
) {
  if (challenge.usedAt !== undefined) return "used" as const;
  if (challenge.expiresAt <= now) return "expired" as const;
  return "active" as const satisfies ClaimChallengeState;
}

export type UploadStatus =
  "pending" | "processing" | "available" | "attached" | "failed" | "replaced";
export type UploadKind = "profile_job" | "design" | "payment_qr" | "receipt";
export type UploadEvent = "start_processing" | "make_available" | "attach" | "fail" | "replace";

const UPLOAD_TRANSITIONS: Record<
  UploadKind,
  Record<UploadEvent, Partial<Record<UploadStatus, UploadStatus>>>
> = {
  profile_job: {
    start_processing: {},
    make_available: {},
    attach: { pending: "attached" },
    fail: { pending: "failed", attached: "failed", failed: "failed" },
    replace: {},
  },
  design: {
    start_processing: { pending: "processing" },
    make_available: { processing: "available" },
    attach: { available: "attached" },
    fail: {},
    replace: {},
  },
  payment_qr: {
    start_processing: { pending: "processing" },
    make_available: { processing: "available" },
    attach: { available: "attached" },
    fail: {},
    replace: { attached: "available" },
  },
  receipt: {
    start_processing: { pending: "processing" },
    make_available: { processing: "available" },
    attach: { available: "attached" },
    fail: { processing: "failed" },
    replace: { attached: "replaced" },
  },
};

export function transitionUploadStatus(
  kind: "design" | "payment_qr" | "receipt",
  from: UploadStatus,
  event: "start_processing",
): "processing";
export function transitionUploadStatus(
  kind: "design" | "payment_qr" | "receipt",
  from: UploadStatus,
  event: "make_available",
): "available";
export function transitionUploadStatus(
  kind: "design" | "payment_qr" | "receipt" | "profile_job",
  from: UploadStatus,
  event: "attach",
): "attached";
export function transitionUploadStatus(
  kind: "receipt",
  from: UploadStatus,
  event: "fail",
): "failed";
export function transitionUploadStatus(
  kind: "payment_qr",
  from: UploadStatus,
  event: "replace",
): "available";
export function transitionUploadStatus(
  kind: "receipt",
  from: UploadStatus,
  event: "replace",
): "replaced";
export function transitionUploadStatus(
  kind: "profile_job",
  from: UploadStatus,
  event: "fail",
): "failed";
export function transitionUploadStatus(
  kind: UploadKind,
  from: UploadStatus,
  event: UploadEvent,
): UploadStatus;
export function transitionUploadStatus(
  kind: UploadKind,
  from: UploadStatus,
  event: UploadEvent,
): UploadStatus {
  const to = UPLOAD_TRANSITIONS[kind][event][from];
  if (to === undefined) throw new Error(`Invalid ${kind} upload transition: ${from} via ${event}.`);
  return to;
}

export type PendingMediaUploadStatus = "queued" | "uploading" | "failed";

export function transitionPendingMediaUpload(
  from: PendingMediaUploadStatus,
  event: "start" | "fail",
): PendingMediaUploadStatus {
  if (event === "start" && (from === "queued" || from === "failed")) return "uploading";
  if (event === "fail" && from === "uploading") return "failed";
  throw new Error(`Invalid profile media preview transition: ${from} via ${event}.`);
}

export type CardOrderState = {
  paymentStatus: "unpaid" | "received" | "refunded";
  fulfillmentStatus:
    "awaiting_shipping_quote" | "awaiting_payment" | "processing" | "delivered" | "cancelled";
  commissionStatus: "none" | "pending" | "eligible" | "paid" | "void";
  hasReferral: boolean;
};
export type CardOrderEvent =
  | "quote_shipping"
  | "receive_payment"
  | "deliver"
  | "cancel"
  | "refund"
  | "commission_eligible"
  | "pay_commission";

export function transitionCardOrder(state: CardOrderState, event: CardOrderEvent) {
  switch (event) {
    case "quote_shipping":
      if (state.paymentStatus === "unpaid" && state.fulfillmentStatus === "awaiting_shipping_quote")
        return { fulfillmentStatus: "awaiting_payment" as const };
      throw new Error("Order is not awaiting a shipping quote.");
    case "receive_payment":
      if (state.paymentStatus === "unpaid" && state.fulfillmentStatus === "awaiting_payment")
        return { paymentStatus: "received" as const, fulfillmentStatus: "processing" as const };
      throw new Error("Order is not awaiting payment.");
    case "deliver":
      if (state.paymentStatus === "received" && state.fulfillmentStatus === "processing")
        return { fulfillmentStatus: "delivered" as const };
      throw new Error("Paid processing order required.");
    case "cancel":
      if (
        state.paymentStatus === "unpaid" &&
        (state.fulfillmentStatus === "awaiting_shipping_quote" ||
          state.fulfillmentStatus === "awaiting_payment")
      )
        return {
          fulfillmentStatus: "cancelled" as const,
          commissionStatus:
            state.commissionStatus === "paid"
              ? ("paid" as const)
              : state.hasReferral
                ? ("void" as const)
                : ("none" as const),
        };
      throw new Error("Only an unpaid open order can be cancelled.");
    case "refund":
      if (
        state.paymentStatus === "received" &&
        (state.fulfillmentStatus === "processing" || state.fulfillmentStatus === "delivered")
      )
        return {
          paymentStatus: "refunded" as const,
          fulfillmentStatus:
            state.fulfillmentStatus === "delivered"
              ? ("delivered" as const)
              : ("cancelled" as const),
          commissionStatus:
            state.commissionStatus === "paid"
              ? ("paid" as const)
              : state.hasReferral
                ? ("void" as const)
                : ("none" as const),
        };
      throw new Error("Only a paid order can be refunded.");
    case "commission_eligible":
      if (
        state.fulfillmentStatus === "delivered" &&
        state.paymentStatus === "received" &&
        state.commissionStatus === "pending"
      )
        return { commissionStatus: "eligible" as const };
      throw new Error("Delivered referral order required.");
    case "pay_commission":
      if (
        state.fulfillmentStatus === "delivered" &&
        state.paymentStatus === "received" &&
        state.commissionStatus === "eligible"
      )
        return { commissionStatus: "paid" as const };
      throw new Error("Eligible delivered order required.");
  }
}
