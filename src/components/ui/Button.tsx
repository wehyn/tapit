import Link from "next/link";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "tonal" | "quiet" | "danger" | "danger-soft";

const buttonClasses =
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 text-sm font-semibold transition-colors";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-tapit-accent text-white hover:bg-tapit-accent-strong",
  secondary: "bg-tapit-surface text-tapit-ink shadow-card hover:bg-tapit-soft-surface",
  tonal: "bg-tapit-accent-soft text-tapit-accent-strong hover:text-tapit-ink",
  quiet: "text-tapit-muted hover:bg-tapit-soft-surface hover:text-tapit-ink",
  danger: "bg-tapit-danger text-white hover:bg-tapit-danger/90",
  "danger-soft": "bg-tapit-danger-soft text-tapit-danger hover:bg-tapit-danger/15",
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
      className={`${buttonClasses} disabled:cursor-not-allowed disabled:opacity-55 ${variantClasses[variant]} ${loading ? "cursor-wait" : ""} ${className}`}
      data-state={loading ? "loading" : "ready"}
      data-variant={variant}
      {...props}
      disabled={loading || props.disabled}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
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
  onClick,
  variant = "primary",
}: {
  children: ReactNode;
  className?: string;
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  variant?: ButtonVariant;
}) {
  return (
    <Link
      className={`${buttonClasses} ${variantClasses[variant]} ${className}`}
      data-variant={variant}
      href={href}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
