import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
  title,
  description,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_12px_36px_rgba(16,33,28,0.06)] sm:p-7 ${className}`}
    >
      {title ? (
        <h2 className="text-lg font-semibold tracking-tight text-tapit-ink">{title}</h2>
      ) : null}
      {description ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-tapit-muted">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
