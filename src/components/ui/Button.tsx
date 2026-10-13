import Link from "next/link";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const buttonClasses =
  "inline-flex min-h-12 items-center justify-center rounded-[14px] px-4 py-2.5 text-sm font-semibold tapit-button-motion";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-tapit-accent bg-tapit-accent text-white shadow-[0_6px_16px_rgba(27,36,51,0.12)] hover:border-tapit-accent-strong hover:bg-tapit-accent-strong",
  secondary:
    "border border-tapit-line bg-tapit-surface text-tapit-ink hover:border-tapit-accent hover:bg-tapit-soft-surface",
  quiet: "text-tapit-muted hover:bg-tapit-soft-surface hover:text-tapit-ink",
  danger:
    "border border-tapit-danger bg-tapit-danger text-white hover:border-[#812d29] hover:bg-[#812d29]",
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
