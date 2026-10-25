"use client";

import { useEffect, useRef, useState } from "react";
import type { LinkIcon } from "@/lib/domain";
import { Icon } from "@/components/ui/Icon";

const options = [
  { value: "link", label: "Generic link", icon: "linkSimple" },
  { value: "globe", label: "Website / globe", icon: "globe" },
  { value: "mail", label: "Email", icon: "email" },
  { value: "phone", label: "Phone", icon: "phone" },
  { value: "calendar", label: "Booking / calendar", icon: "calendar" },
  { value: "linkedin", label: "LinkedIn", icon: "linkedin" },
  { value: "instagram", label: "Instagram", icon: "instagram" },
  { value: "briefcase", label: "Portfolio / briefcase", icon: "briefcase" },
  { value: "images", label: "Gallery / images", icon: "images" },
  { value: "palette", label: "Design / palette", icon: "palette" },
  { value: "code", label: "Development / code", icon: "code" },
  { value: "camera", label: "Photography / camera", icon: "camera" },
  { value: "github", label: "GitHub", icon: "github" },
] as const;

export function LinkPresetIconPicker({
  value,
  label,
  disabled = false,
  onChange,
}: {
  value: LinkIcon;
  label: string;
  disabled?: boolean;
  onChange: (value: LinkIcon) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector("button")?.focus();
      }
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={root} className="relative min-w-0">
      <button
        type="button"
        aria-label={`Preset icon for ${label || "link"}: ${selected.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="grid size-11 shrink-0 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent transition-colors hover:bg-tapit-accent-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus disabled:cursor-not-allowed disabled:opacity-55"
      >
        <Icon name={selected.icon} size={19} weight="bold" className="shrink-0" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={`Preset icon for ${label || "link"}`}
          className="absolute left-0 top-full z-40 mt-1 max-h-64 w-60 overflow-y-auto overscroll-contain rounded-card bg-tapit-surface p-1 shadow-card"
        >
          {options.map((option) => (
            <button
              role="option"
              aria-selected={option.value === selected.value}
              disabled={disabled}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                root.current?.querySelector("button")?.focus();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm text-tapit-ink hover:bg-tapit-accent-soft focus-visible:bg-tapit-accent-soft focus-visible:outline-none"
            >
              <Icon name={option.icon} size={18} className="text-tapit-accent" />
              <span className="flex-1">{option.label}</span>
              {option.value === selected.value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
