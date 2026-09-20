"use client";

import Link from "next/link";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";

const publicNavItems = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#teams", label: "For teams" },
  { href: "#pricing", label: "Pricing" },
  { href: "/build-card", label: "Build card" },
];

export function PublicBrand() {
  return (
    <Link
      aria-label="Tapit home"
      className="inline-flex min-h-11 items-center text-[1.75rem] font-semibold tracking-[-0.06em] text-tapit-ink"
      href="/"
    >
      Tapit
    </Link>
  );
}

function AccountLink() {
  return isLocalDemoMode() ? <DemoAccountLink /> : <LiveAccountLink />;
}

function DemoAccountLink() {
  const session = useDemoSession();
  const href =
    session === null ? "/login" : session.role === "admin" ? "/admin/customers" : "/app/profile";
  const label = session === null ? "Sign in" : session.role === "admin" ? "Dashboard" : "Profile";
  return <AccountAnchor href={href}>{label}</AccountAnchor>;
}

function LiveAccountLink() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const signedIn = !isLoading && access?.authenticated === true;
  const href = signedIn
    ? access.role === "admin"
      ? "/admin/customers"
      : "/app/profile"
    : "/login";
  const label = signedIn ? (access.role === "admin" ? "Dashboard" : "Profile") : "Sign in";
  return <AccountAnchor href={href}>{label}</AccountAnchor>;
}

function AccountAnchor({ href, children }: { href: string; children: string }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center text-base font-medium text-tapit-muted transition hover:text-tapit-ink"
      href={href}
    >
      {children}
    </Link>
  );
}

export function PublicHeader({ activeHref }: { activeHref?: string }) {
  return (
    <header className="flex items-center border-b border-tapit-ink/10 py-5 sm:py-7">
      <PublicBrand />
      <nav
        aria-label="Primary navigation"
        className="hidden items-center gap-9 lg:ml-20 lg:flex lg:mr-auto"
      >
        {publicNavItems.map((item) =>
          item.href.startsWith("/") ? (
            <Link
              aria-current={item.href === activeHref ? "page" : undefined}
              className="inline-flex min-h-11 items-center text-base text-tapit-muted transition hover:text-tapit-ink"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ) : (
            <a
              aria-current={item.href === activeHref ? "page" : undefined}
              className="inline-flex min-h-11 items-center text-base text-tapit-muted transition hover:text-tapit-ink"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </a>
          ),
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3 sm:gap-7">
        <AccountLink />
      </div>
    </header>
  );
}
