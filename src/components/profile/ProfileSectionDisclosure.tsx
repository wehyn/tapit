"use client";

import { CaretDown } from "@phosphor-icons/react";
import { useState } from "react";
import type { ProfileSection } from "@/lib/profile-customization";

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
      className={`group overflow-hidden rounded-tapit border ${className}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        aria-controls={regionId}
        aria-expanded={open}
        className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-focus [&::-webkit-details-marker]:hidden"
      >
        <span>{section.kind === "about" ? "About" : "Services"}</span>
        <CaretDown
          aria-hidden="true"
          className="transition-transform duration-200 motion-reduce:transition-none group-open:rotate-180"
          size={18}
        />
      </summary>
      <div
        className="border-t border-inherit px-4 py-4 text-sm leading-6"
        id={regionId}
        role="region"
      >
        <p>{section.body}</p>
        {section.kind === "services" && section.items?.length ? (
          <ul className="mt-3 grid gap-1.5 pl-5 marker:text-current" aria-label="Services offered">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
