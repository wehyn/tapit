"use client";

import { useEffect, useRef } from "react";

import { Button } from "./Button";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    dialogRef.current?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [onCancel, open]);

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
