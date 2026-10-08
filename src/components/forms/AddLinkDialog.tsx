"use client";

import { useEffect, useRef, useState } from "react";
import { EnvelopeSimpleIcon, GlobeIcon, PhoneIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { validateLinkDestination, type LinkIcon, type ProfileLink } from "@/lib/domain";
import { formatDestination, type LinkKind } from "./LinkDestination";

const kinds = [
  {
    value: "link",
    label: "Website or link",
    detail: "A page, portfolio, or social profile",
    icon: GlobeIcon,
  },
  {
    value: "email",
    label: "Email address",
    detail: "Let people send you an email",
    icon: EnvelopeSimpleIcon,
  },
  { value: "phone", label: "Phone number", detail: "Let people call you", icon: PhoneIcon },
] as const;

export function AddLinkDialog({
  onClose,
  onAdd,
  destinations,
}: {
  onClose: () => void;
  onAdd: (link: Pick<ProfileLink, "label" | "destination" | "icon">) => void;
  destinations: string[];
}) {
  const [kind, setKind] = useState<LinkKind | null>(null);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input")].filter(
        (item) => !item.hasAttribute("disabled"),
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!kind) return;
    const destination = formatDestination(kind, value);
    if (!label.trim()) return setError("Enter a label for this link.");
    if (label.trim().length > 120) return setError("Keep the label under 120 characters.");
    if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return setError("Enter a valid email address.");
    if (kind === "phone" && value.replace(/\D/g, "").length < 7)
      return setError("Enter a valid phone number.");
    if (validateLinkDestination(destination))
      return setError(
        kind === "link" ? "Enter a valid HTTPS web address." : "Enter a valid destination.",
      );
    if (destinations.some((existing) => existing.toLowerCase() === destination.toLowerCase()))
      return setError("This destination is already used by another link.");
    const icon: LinkIcon = kind === "link" ? "globe" : kind === "email" ? "mail" : "phone";
    onAdd({ label: label.trim(), destination, icon });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tapit-ink/50 px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-link-title"
        tabIndex={-1}
        className="w-full max-w-lg rounded-tapit border border-tapit-line bg-tapit-surface p-6 shadow-[0_24px_70px_rgba(27,36,51,.2)] outline-none sm:p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-tapit-accent">
          Add link · {kind ? "Step 2 of 2" : "Step 1 of 2"}
        </p>
        <h2
          id="add-link-title"
          className="tapit-display mt-2 text-2xl font-semibold text-tapit-ink"
        >
          {kind
            ? `Add ${kind === "link" ? "a link" : kind === "email" ? "an email" : "a phone number"}`
            : "What would you like to add?"}
        </h2>
        {!kind ? (
          <div className="mt-6 grid gap-3">
            {kinds.map((option) => (
              <button
                key={option.value}
                aria-label={option.label}
                type="button"
                onClick={() => {
                  setKind(option.value);
                  setError("");
                }}
                className="flex items-center gap-4 rounded-tapit border border-tapit-line p-4 text-left transition hover:border-tapit-accent hover:bg-tapit-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-tapit bg-tapit-accent-soft text-tapit-accent">
                  <option.icon size={22} />
                </span>
                <span>
                  <span className="block font-semibold text-tapit-ink">{option.label}</span>
                  <span className="text-sm text-tapit-muted">{option.detail}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form className="mt-6 grid gap-4" onSubmit={submit}>
            <div>
              <label
                htmlFor="new-link-label"
                className="mb-2 block text-sm font-semibold text-tapit-ink"
              >
                Label
              </label>
              <input
                id="new-link-label"
                autoFocus
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setError("");
                }}
                placeholder={
                  kind === "link"
                    ? "e.g. Portfolio"
                    : kind === "email"
                      ? "e.g. Email me"
                      : "e.g. Call me"
                }
                className="min-h-12 w-full rounded-tapit border border-tapit-line bg-white px-3 outline-none focus:border-tapit-accent"
              />
            </div>
            <div>
              <label
                htmlFor="new-link-destination"
                className="mb-2 block text-sm font-semibold text-tapit-ink"
              >
                {kind === "link"
                  ? "Web address"
                  : kind === "email"
                    ? "Email address"
                    : "Phone number"}
              </label>
              <input
                id="new-link-destination"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError("");
                }}
                type={kind === "email" ? "email" : kind === "phone" ? "tel" : "text"}
                placeholder={
                  kind === "link"
                    ? "https://example.com"
                    : kind === "email"
                      ? "you@example.com"
                      : "+1 555 123 4567"
                }
                className="min-h-12 w-full rounded-tapit border border-tapit-line bg-white px-3 outline-none focus:border-tapit-accent"
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-tapit-danger">
                {error}
              </p>
            ) : null}
            <div className="mt-2 flex justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setKind(null);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button type="submit">Add link</Button>
            </div>
          </form>
        )}
        {!kind ? (
          <div className="mt-6 flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
