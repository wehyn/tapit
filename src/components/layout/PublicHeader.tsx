"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEventHandler } from "react";

import { PublicAccountAction } from "./PublicAccountAction";
import { Brand } from "./Brand";
import { isDemoMode } from "@/lib/demo/mode";
import { Icon } from "@/components/ui/Icon";

type PublicNavItem = {
  href: string;
  label: string;
};

const landingNavItems: PublicNavItem[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const utilityNavItems: PublicNavItem[] = [
  { href: "#how-it-works", label: "How it works" },
  { href: "/build-card", label: "Build card" },
];

const demoProfileNavItem: PublicNavItem = {
  href: "/mara-velasquez",
  label: "See a profile",
};

function getPublicNavItems(pathname: string) {
  const items = pathname === "/" ? landingNavItems : utilityNavItems;
  return isDemoMode() ? [...items, demoProfileNavItem] : items;
}

export function PublicBrand() {
  return <Brand />;
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
    <header className="tapit-glass sticky top-0 z-40 w-full shadow-card">
      <div className="mx-auto flex w-full max-w-[95rem] items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6 sm:py-3 lg:px-8">
        <PublicBrand />
        <nav
          aria-label="Primary navigation"
          className="mr-auto hidden items-center gap-2 lg:ml-6 lg:flex xl:gap-4"
        >
          {navItems.map((item) => {
            const href =
              item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
            return (
              <PublicNavLink
                activeHref={activeHref}
                className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink"
                href={href}
                item={item}
                key={item.href}
              />
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-4 lg:ml-0">
          <div className="hidden sm:block lg:block">
            <PublicAccountAction hideWhenPrimaryVisible={showProfileAction} placement="account" />
          </div>
          {showProfileAction ? <PublicAccountAction placement="header" /> : null}
          <button
            aria-controls="public-mobile-menu"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-tapit-surface text-tapit-ink shadow-card transition-colors hover:bg-tapit-soft-surface lg:hidden"
            onClick={() => setMenuPathname(menuOpen ? null : pathname)}
            type="button"
          >
            <Icon name={menuOpen ? "close" : "menu"} size={20} weight="bold" />
          </button>
        </div>
      </div>
      {menuOpen ? (
        <div className="bg-tapit-surface lg:hidden" id="public-mobile-menu">
          <nav
            aria-label="Mobile navigation"
            className="mx-auto grid w-full max-w-[95rem] gap-1 px-4 pb-2 sm:px-6 lg:px-8"
          >
            {navItems.map((item) => {
              const href =
                item.href.startsWith("#") && pathname !== "/" ? `/${item.href}` : item.href;
              return (
                <PublicNavLink
                  activeHref={activeHref}
                  className="flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-tapit-ink transition-colors hover:bg-tapit-soft-surface"
                  href={href}
                  item={item}
                  key={item.href}
                  onClick={() => setMenuPathname(null)}
                />
              );
            })}
          </nav>
          <div className="mx-auto flex w-full max-w-[95rem] items-center justify-between px-4 pb-4 pt-2 sm:hidden sm:px-6">
            <PublicAccountAction hideWhenPrimaryVisible={showProfileAction} placement="account" />
          </div>
        </div>
      ) : null}
    </header>
  );
}
