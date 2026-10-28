import type { Doc } from "./_generated/dataModel";

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
      invitation.usedAt === undefined &&
      invitation.acceptedAt === undefined &&
      invitation.invalidatedAt === undefined &&
      invitation.expiresAt !== undefined &&
      invitation.expiresAt > now,
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
          invitation.usedAt === undefined &&
          invitation.acceptedAt === undefined &&
          invitation.invalidatedAt === undefined &&
          invitation.expiresAt !== undefined &&
          invitation.expiresAt > now,
      )
      .map((invitation) => invitation.expiresAt!)
      .sort((left, right) => right - left)[0] ?? null
  );
}
