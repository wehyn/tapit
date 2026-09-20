"use client";

import { useEffect, useRef } from "react";

import type { CardDesignPreview } from "@/lib/card-design";

import { Button } from "../ui/Button";
import { Notice } from "../ui/Notice";

const titleId = "card-preview-title";

export function CardPreviewDialog({
  file,
  onChooseAnother,
  onClose,
  onOrder,
  orderingComingSoon,
}: {
  file: CardDesignPreview;
  onChooseAnother: () => void;
  onClose: () => void;
  onOrder: () => void;
  orderingComingSoon: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
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
      triggerRef.current?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-tapit-ink/70 px-5 py-8 backdrop-blur-[2px]">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative w-full max-w-md rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_24px_80px_rgba(21,25,24,0.24)] sm:p-8"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-tapit-ink" id={titleId}>
          Looks good?
        </h2>
        <Button
          aria-label="Close card preview"
          className="absolute right-4 top-4 min-h-10 px-3 text-xl leading-none"
          onClick={onClose}
          type="button"
          variant="quiet"
        >
          <span aria-hidden="true">×</span>
        </Button>
        <div className="mt-6 flex max-h-[55vh] min-h-48 items-center justify-center overflow-hidden rounded-tapit border border-tapit-line bg-tapit-paper p-3 sm:max-h-[60vh]">
          <img
            alt={`Preview of ${file.name}`}
            className="max-h-[52vh] max-w-full object-contain sm:max-h-[57vh]"
            src={file.url}
          />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button className="w-full" onClick={onOrder} type="button">
            Order a card now <span aria-hidden="true">→</span>
          </Button>
          <Button className="w-full" onClick={onChooseAnother} type="button" variant="secondary">
            Choose another design
          </Button>
        </div>
        {orderingComingSoon ? (
          <div className="mt-4">
            <Notice tone="neutral">Ordering is coming soon</Notice>
          </div>
        ) : null}
      </div>
    </div>
  );
}
