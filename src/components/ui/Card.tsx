import type { ReactNode } from "react";

const toneClasses = {
  default: "bg-tapit-surface shadow-card",
  soft: "bg-tapit-soft-surface",
  accent: "bg-tapit-accent text-white",
};

export function Card({
  children,
  className = "",
  description,
  title,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
  tone?: keyof typeof toneClasses;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col gap-4 rounded-card p-6 ${toneClasses[tone]} ${className}`}
    >
      {title ? <h2 className="text-lg font-semibold text-tapit-ink">{title}</h2> : null}
      {description ? (
        <p className={`max-w-2xl text-sm text-tapit-muted ${title ? "-mt-2" : ""}`}>
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}
