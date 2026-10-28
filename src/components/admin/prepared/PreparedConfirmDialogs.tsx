"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActiveCustomerRow, PreparedRow } from "./types";

export type PreparedConfirmation =
  | { kind: "revoke" | "delete"; row: PreparedRow }
  | { kind: "ownerAccess"; row: ActiveCustomerRow; enabled: boolean }
  | null;

export function PreparedConfirmDialogs({
  confirmation,
  onCancel,
  onConfirm,
}: {
  confirmation: PreparedConfirmation;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={confirmation?.kind === "revoke"}
        title="Revoke this link?"
        description="The current link stops working right away. The account is kept as an unclaimed draft and you can generate a new link later."
        confirmLabel="Revoke link"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
      <ConfirmDialog
        open={confirmation?.kind === "delete"}
        title="Delete this draft?"
        description="This permanently deletes the prepared account. This can't be undone."
        confirmLabel="Delete draft"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
      <ConfirmDialog
        open={confirmation?.kind === "ownerAccess"}
        title={
          confirmation?.kind === "ownerAccess" && !confirmation.enabled
            ? "Revoke owner access?"
            : "Grant owner access?"
        }
        description={
          confirmation?.kind === "ownerAccess" && !confirmation.enabled
            ? `Remove the admin override for ${confirmation.row.email}. Access from a successfully claimed card remains. This change is recorded in the audit log.`
            : `Grant ${confirmation?.kind === "ownerAccess" ? confirmation.row.email : ""} access to owner analytics and card-owner tools. This admin override is recorded in the audit log and does not record a card claim.`
        }
        confirmLabel={
          confirmation?.kind === "ownerAccess" && !confirmation.enabled
            ? "Revoke access"
            : "Grant access"
        }
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </>
  );
}
