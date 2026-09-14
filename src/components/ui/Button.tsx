import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-tapit-accent text-white hover:bg-tapit-accent-strong",
  secondary:
    "border border-tapit-line bg-tapit-surface text-tapit-ink hover:border-tapit-accent hover:bg-tapit-paper",
  quiet: "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink",
  danger: "bg-tapit-danger text-white hover:bg-[#812d29]",
};

export function Button({
  children,
  className = "",
  loading = false,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 items-center justify-center rounded-tapit px-4 py-2.5 text-sm font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 ${variant === "primary" ? "rounded-full" : ""} ${variantClasses[variant]} ${loading ? "cursor-wait" : ""} ${className}`}
      data-state={loading ? "loading" : "ready"}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="mr-2 size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className = "",
  href,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  href: string;
  variant?: ButtonVariant;
}) {
  return (
    <Link
      className={`inline-flex min-h-12 items-center justify-center rounded-tapit px-4 py-2.5 text-sm font-semibold transition duration-150 hover:-translate-y-px ${variant === "primary" ? "rounded-full" : ""} ${variantClasses[variant]} ${className}`}
      href={href}
    >
      {children}
    </Link>
  );
}
