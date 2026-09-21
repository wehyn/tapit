"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState, type MouseEventHandler } from "react";

import { api } from "../../../convex/_generated/api";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";

type PublicNavItem = {
  href: string;
  label: string;
};

const publicNavItems: PublicNavItem[] = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "/build-card", label: "Build card" },
];

const demoProfileNavItem: PublicNavItem = {
  href: "/mara-velasquez",
  label: "Demo Profile",
};

function getPublicNavItems(): PublicNavItem[] {
  return isLocalDemoMode() ? [...publicNavItems, demoProfileNavItem] : publicNavItems;
}

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

function PublicNavLink({
  item,
  href,
  activeHref,
  className,
  onClick,
}: {
  item: PublicNavItem;
  href: string;
  activeHref?: string;
  className: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const props = {
    "aria-current": item.href === activeHref ? ("page" as const) : undefined,
    className,
    href,
    onClick,
  };

  return href.startsWith("/") ? (
    <Link {...props}>{item.label}</Link>
  ) : (
    <a {...props}>{item.label}</a>
  );
}

export function PublicHeader({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  const [menuPathname, setMenuPathname] = useState<string | null>(null);
  const menuOpen = menuPathname !== null && menuPathname === pathname;
  const navItems = getPublicNavItems();

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPathname(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-tapit-ink/10 bg-tapit-surface">
      <div className="mx-auto flex w-full max-w-[95rem] items-center px-[clamp(1.25rem,5vw,5.25rem)] py-2.5 xl:max-w-none xl:pr-[6vw] sm:py-3.5">
        <PublicBrand />
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-9 lg:ml-20 lg:flex lg:mr-auto"
        >
          {navItems.map((item) => {
            const href =
              item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
            return (
              <PublicNavLink
                activeHref={activeHref}
                className="inline-flex min-h-11 items-center text-base text-tapit-muted transition hover:text-tapit-ink"
                href={href}
                item={item}
                key={item.href}
              />
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-7">
          <AccountLink />
          <button
            aria-controls="public-mobile-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex min-h-11 items-center gap-2 rounded-tapit px-2 text-sm font-semibold text-tapit-ink transition hover:bg-tapit-paper lg:hidden"
            onClick={() => setMenuPathname(menuOpen ? null : pathname)}
            type="button"
          >
            <span>{menuOpen ? "Close" : "Menu"}</span>
            {menuOpen ? (
              <XIcon aria-hidden="true" size={20} weight="bold" />
            ) : (
              <ListIcon aria-hidden="true" size={20} weight="bold" />
            )}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div className="border-t border-tapit-line lg:hidden" id="public-mobile-menu">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto grid w-full max-w-[95rem] px-[clamp(1.25rem,5vw,5.25rem)]"
          >
            {navItems.map((item) => {
              const href =
                item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
              return (
                <PublicNavLink
                  activeHref={activeHref}
                  className="flex min-h-12 items-center border-b border-tapit-line py-3 text-base font-medium text-tapit-ink last:border-b-0"
                  href={href}
                  item={item}
                  key={item.href}
                  onClick={() => setMenuPathname(null)}
                />
              );
            })}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
