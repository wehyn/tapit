"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PreparedRow } from "./types";

export type PreparedConfirmation = { kind: "revoke" | "delete"; row: PreparedRow } | null;

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
    </>
  );
}
