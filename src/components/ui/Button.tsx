import Link from "next/link";
import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-tapit-accent bg-tapit-accent text-white shadow-[0_2px_5px_rgba(23,35,30,0.08)] hover:border-tapit-accent-strong hover:bg-tapit-accent-strong",
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
      className={`inline-flex min-h-12 items-center justify-center rounded-[10px] px-4 py-2.5 text-sm font-semibold transition duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.985] disabled:transform-none disabled:cursor-not-allowed disabled:opacity-55 ${variantClasses[variant]} ${loading ? "cursor-wait" : ""} ${className}`}
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
      className={`inline-flex min-h-12 items-center justify-center rounded-[10px] px-4 py-2.5 text-sm font-semibold transition duration-150 hover:-translate-y-px active:translate-y-px active:scale-[0.985] ${variantClasses[variant]} ${className}`}
      href={href}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
