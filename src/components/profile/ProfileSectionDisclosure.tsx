"use client";

import { useState } from "react";
import type { ProfileSection } from "@/lib/profile-customization";
import { Icon } from "@/components/ui/Icon";

export function ProfileSectionDisclosure({
  section,
  className = "",
}: {
  section: ProfileSection;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const regionId = `profile-section-${section.kind}`;
  return (
    <details
      className={`group overflow-hidden rounded-card bg-tapit-surface shadow-card ${className}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-controls={regionId}
        aria-expanded={open}
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-focus [&::-webkit-details-marker]:hidden"
      >
        <span>{section.kind === "about" ? "About" : "Services"}</span>
        <Icon className="group-open:rotate-180" name="caretDown" size={18} />
      </summary>
      <div className="grid gap-3 px-4 pb-4 text-sm leading-6" id={regionId} role="region">
        <p>{section.body}</p>
        {section.kind === "services" && section.items?.length ? (
          <ul className="grid gap-2 pl-4 marker:text-current" aria-label="Services offered">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
