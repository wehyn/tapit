"use client";

import { useEffect, useRef, useState } from "react";
import {
  BriefcaseIcon,
  CalendarDotsIcon,
  CameraIcon,
  CheckIcon,
  CodeIcon,
  EnvelopeSimpleIcon,
  GithubLogoIcon,
  GlobeIcon,
  ImagesIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  LinkedinLogoIcon,
  PaletteIcon,
  PhoneIcon,
} from "@phosphor-icons/react";
import type { LinkIcon } from "@/lib/domain";

const options = [
  { value: "link", label: "Generic link", icon: LinkSimpleIcon },
  { value: "globe", label: "Website / globe", icon: GlobeIcon },
  { value: "mail", label: "Email", icon: EnvelopeSimpleIcon },
  { value: "phone", label: "Phone", icon: PhoneIcon },
  { value: "calendar", label: "Booking / calendar", icon: CalendarDotsIcon },
  { value: "linkedin", label: "LinkedIn", icon: LinkedinLogoIcon },
  { value: "instagram", label: "Instagram", icon: InstagramLogoIcon },
  { value: "briefcase", label: "Portfolio / briefcase", icon: BriefcaseIcon },
  { value: "images", label: "Gallery / images", icon: ImagesIcon },
  { value: "palette", label: "Design / palette", icon: PaletteIcon },
  { value: "code", label: "Development / code", icon: CodeIcon },
  { value: "camera", label: "Photography / camera", icon: CameraIcon },
  { value: "github", label: "GitHub", icon: GithubLogoIcon },
] as const;

export function LinkPresetIconPicker({
  value,
  label,
  onChange,
}: {
  value: LinkIcon;
  label: string;
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
        onClick={() => setOpen(!open)}
        className="grid size-11 shrink-0 place-items-center rounded-tapit bg-tapit-accent-soft text-tapit-accent transition hover:bg-tapit-accent-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
      >
        <selected.icon aria-hidden="true" size={19} weight="bold" className="shrink-0" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={`Preset icon for ${label || "link"}`}
          className="absolute left-0 top-full z-40 mt-1 max-h-64 w-60 overflow-y-auto rounded-tapit border border-tapit-line bg-white p-1 shadow-xl"
        >
          {options.map((option) => (
            <button
              role="option"
              aria-selected={option.value === selected.value}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                root.current?.querySelector("button")?.focus();
              }}
              className="flex min-h-10 w-full items-center gap-3 rounded-tapit px-3 text-left text-sm text-tapit-ink hover:bg-tapit-accent-soft focus-visible:bg-tapit-accent-soft focus-visible:outline-none"
            >
              <option.icon aria-hidden="true" size={18} className="text-tapit-accent" />
              <span className="flex-1">{option.label}</span>
              {option.value === selected.value ? <CheckIcon aria-hidden="true" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
