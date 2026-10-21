import type { ReactNode } from "react";

export function segmentedClass(tone: "white" | "soft" = "white") {
  return `inline-flex max-w-full flex-wrap gap-1 rounded-control p-1 ${tone === "soft" ? "bg-tapit-soft-surface" : "bg-tapit-surface shadow-card"}`;
}

export function segmentedItemClass(active: boolean) {
  return `inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold transition-colors ${
    active
      ? "bg-tapit-accent-soft text-tapit-accent-strong"
      : "text-tapit-muted hover:text-tapit-ink"
  }`;
}

export function Segmented<T extends string>({
  label,
  onChange,
  options,
  tone,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: readonly { icon?: ReactNode; label: string; value: T }[];
  tone?: "white" | "soft";
  value: T;
}) {
  return (
    <div aria-label={label} className={segmentedClass(tone)} role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={segmentedItemClass(value === option.value)}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
