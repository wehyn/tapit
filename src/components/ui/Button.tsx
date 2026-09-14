import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-tapit-accent text-white hover:bg-tapit-accent-strong",
  secondary: "border border-tapit-line bg-tapit-surface text-tapit-ink hover:border-tapit-accent",
  quiet: "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink",
  danger: "bg-tapit-danger text-white hover:bg-[#812d29]",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
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
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${variantClasses[variant]} ${className}`}
      href={href}
    >
      {children}
    </Link>
  );
}
