import { EnvelopeSimple, Globe, Phone } from "@phosphor-icons/react";
import { getAutomaticContactActions } from "@/lib/profile-customization";

const icons = { email: EnvelopeSimple, phone: Phone, website: Globe } as const;
export function ProfileContactStrip({
  email,
  phone,
  website,
  className = "",
}: {
  email?: string;
  phone?: string;
  website?: string;
  className?: string;
}) {
  const actions = getAutomaticContactActions({ email, phone, website });
  if (actions.length === 0) return null;
  return (
    <nav aria-label="Contact actions" className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const Icon = icons[action.kind];
        const external = action.kind === "website";
        return (
          <a
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-current/20 px-3.5 py-2 text-sm font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px hover:border-current/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus active:translate-y-px"
            href={action.href}
            key={action.kind}
            {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
          >
            <Icon aria-hidden="true" size={17} />
            <span>{action.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
