"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useState, type MouseEventHandler } from "react";

import { api } from "../../../convex/_generated/api";
import { Brand } from "./Brand";
import { isDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";

type PublicNavItem = {
  href: string;
  label: string;
};

const landingNavItems: PublicNavItem[] = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const utilityNavItems: PublicNavItem[] = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/build-card", label: "Build card" },
];

const demoProfileNavItem: PublicNavItem = {
  href: "/mara-velasquez",
  label: "Demo Profile",
};

function getPublicNavItems(pathname: string) {
  if (pathname === "/") return landingNavItems;
  return isDemoMode() ? [...utilityNavItems, demoProfileNavItem] : utilityNavItems;
}

export function PublicBrand() {
  return <Brand />;
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

function AccountAnchor({
  children,
  className = "",
  href,
  onClick,
}: {
  children: string;
  className?: string;
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center text-sm font-semibold text-tapit-muted transition hover:text-tapit-ink ${className}`}
      href={href}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}

function ProfileActionLink({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link
      aria-label="Go to your profile"
      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-tapit-accent px-4 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(49,95,228,0.18)] transition hover:-translate-y-px hover:bg-tapit-accent-strong focus-visible:outline-offset-4 active:translate-y-0 ${mobile ? "text-xs sm:text-sm" : ""}`}
      href="/app/profile"
    >
      {mobile ? (
        <>
          <span className="sm:hidden">Profile</span>
          <span className="hidden sm:inline">Go to your profile</span>
        </>
      ) : (
        "Go to your profile"
      )}
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
  const navItems = getPublicNavItems(pathname);
  const showProfileAction = pathname !== "/build-card";

  useEffect(() => {
    if (!menuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuPathname(null);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  return (
    <header className="tapit-glass sticky top-0 z-40 w-full border-b border-tapit-line/80 shadow-[0_4px_24px_rgba(27,36,51,0.045)]">
      <div className="mx-auto flex w-full max-w-[95rem] items-center gap-3 px-[clamp(1rem,5vw,5.25rem)] py-2.5 sm:gap-5 sm:py-3 xl:max-w-none xl:pr-[6vw]">
        <PublicBrand />
        <nav
          aria-label="Primary navigation"
          className="mr-auto hidden items-center gap-8 lg:ml-14 lg:flex xl:gap-10"
        >
          {navItems.map((item) => {
            const href =
              item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
            return (
              <PublicNavLink
                activeHref={activeHref}
                className="inline-flex min-h-11 items-center text-sm font-medium text-tapit-muted transition-colors hover:text-tapit-accent"
                href={href}
                item={item}
                key={item.href}
              />
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-4 lg:ml-0">
          <div className="hidden sm:block lg:block">
            <AccountLink />
          </div>
          {showProfileAction ? <ProfileActionLink mobile /> : null}
          <button
            aria-controls="public-mobile-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-tapit-line bg-tapit-surface/80 text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent focus-visible:outline-offset-2 lg:hidden"
            onClick={() => setMenuPathname(menuOpen ? null : pathname)}
            type="button"
          >
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
            className="mx-auto grid w-full max-w-[95rem] px-[clamp(1.25rem,5vw,5.25rem)] pb-2"
          >
            {navItems.map((item) => {
              const href =
                item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
              return (
                <PublicNavLink
                  activeHref={activeHref}
                  className="flex min-h-12 items-center border-b border-tapit-line py-3 text-sm font-medium text-tapit-ink last:border-b-0"
                  href={href}
                  item={item}
                  key={item.href}
                  onClick={() => setMenuPathname(null)}
                />
              );
            })}
          </nav>
          <div className="mx-auto flex w-full max-w-[95rem] items-center justify-between px-[clamp(1rem,5vw,5.25rem)] pb-4 pt-2 sm:hidden">
            <AccountLink />
            {showProfileAction ? (
              <Link
                className="inline-flex min-h-11 items-center text-sm font-semibold text-tapit-accent"
                href="/app/profile"
                onClick={() => setMenuPathname(null)}
              >
                Go to your profile
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
