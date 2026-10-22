import { Icon } from "@/components/ui/Icon";
import {
  getAutomaticContactActions,
  type ProfileContactDisplay,
} from "@/lib/profile-customization";

const icons = { email: "email", phone: "phone", website: "globe" } as const;
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
  const shapeClass = display === "icons-soft-square" ? "rounded-control" : "rounded-full";
  return (
    <nav aria-label="Contact actions" className={`flex flex-wrap gap-2 ${className}`}>
      {actions.map((action) => {
        const iconName = icons[action.kind];
        const external = action.kind === "website";
        return (
          <a
            className={`inline-flex min-h-11 items-center bg-tapit-surface shadow-card hover:bg-tapit-soft-surface ${compact ? "min-w-11 justify-center" : "gap-2"} ${compact ? shapeClass : "rounded-control"} ${compact ? "px-2" : "px-3"} py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus`}
            href={action.href}
            key={action.kind}
            {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
            {...(compact ? { "aria-label": action.label, title: action.label } : {})}
          >
            <Icon name={iconName} size={17} />
            {compact ? null : <span>{action.label}</span>}
          </a>
        );
      })}
    </nav>
  );
}
