import { EnvelopeSimple, Globe, Phone } from "@phosphor-icons/react";
import {
  getAutomaticContactActions,
  type ProfileContactDisplay,
} from "@/lib/profile-customization";

const icons = { email: EnvelopeSimple, phone: Phone, website: Globe } as const;
export function ProfileContactStrip({
  email,
  phone,
  website,
  className = "",
  display = "labels",
}: {
  email?: string;
  phone?: string;
  website?: string;
  className?: string;
  display?: ProfileContactDisplay;
}) {
  const actions = getAutomaticContactActions({ email, phone, website });
  if (actions.length === 0) return null;
  const compact = display !== "labels";
  const shapeClass = display === "icons-soft-square" ? "rounded-lg" : "rounded-full";
  return (
    <nav aria-label="Contact actions" className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const Icon = icons[action.kind];
        const external = action.kind === "website";
        return (
          <a
            className={`inline-flex min-h-11 items-center ${compact ? "min-w-11 justify-center" : "gap-2"} ${compact ? shapeClass : "rounded-full"} border border-current/20 ${compact ? "px-2" : "px-3.5"} py-2 text-sm font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px hover:border-current/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus active:translate-y-px`}
            href={action.href}
            key={action.kind}
            {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
            {...(compact ? { "aria-label": action.label, title: action.label } : {})}
          >
            <Icon aria-hidden="true" size={17} />
            {compact ? null : <span>{action.label}</span>}
          </a>
        );
      })}
    </nav>
  );
}
