import type { Doc } from "./_generated/dataModel";
import { invitationState } from "../src/lib/domain/state-machines";

export type SetupState = "waiting" | "draft" | "active";

export function deriveSetupState(
  customer: Doc<"customers">,
  invitations: Doc<"invitations">[],
  now: number,
): SetupState | null {
  if (customer.userId !== undefined && customer.status === "active") return "active";
  const isPreparedAccount = invitations.some(
    (invitation) => invitation.kind === "prepared_setup" && invitation.scope === customer.scope,
  );
  if (!isPreparedAccount) return null;
  const hasLiveInvitation = invitations.some(
    (invitation) =>
      invitation.kind === "prepared_setup" &&
      invitation.scope === customer.scope &&
      invitationState(invitation, now) === "usable" &&
      invitation.expiresAt !== undefined,
  );
  return hasLiveInvitation ? "waiting" : "draft";
}

export function latestSetupExpiry(
  customer: Doc<"customers">,
  invitations: Doc<"invitations">[],
  now: number,
): number | null {
  return (
    invitations
      .filter(
        (invitation) =>
          invitation.kind === "prepared_setup" &&
          invitation.scope === customer.scope &&
          invitationState(invitation, now) === "usable" &&
          invitation.expiresAt !== undefined,
      )
      .map((invitation) => invitation.expiresAt!)
      .sort((left, right) => right - left)[0] ?? null
  );
}
