"use client";

import { Button } from "./Button";
import { useDialogFocus } from "./use-dialog-focus";

export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel = "Confirm",
  confirmDisabled = false,
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onCancel);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-tapit-ink/45 p-4">
      <div
        aria-describedby="confirm-description"
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="flex w-full max-w-lg flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="text-lg font-semibold text-tapit-ink" id="confirm-title">
          {title}
        </h2>
        <p className="text-sm text-tapit-muted" id="confirm-description">
          {description}
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={onCancel} variant="secondary" type="button">
            {cancelLabel}
          </Button>
          <Button disabled={confirmDisabled} onClick={onConfirm} type="button">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
