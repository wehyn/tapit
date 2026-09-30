"use client";

import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { SidebarNav } from "./SidebarNav";
import type { ShellNavGroup } from "./navigation";

export function AppShell({
  children,
  eyebrow,
  mobileHeaderActions,
  navGroups,
  beforeNavigate,
  pageTitle,
  showPageIntro = true,
  sidebarFooter,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  mobileHeaderActions?: ReactNode;
  navGroups: ShellNavGroup[];
  beforeNavigate?: (href: string) => Promise<boolean>;
  pageTitle?: string;
  showPageIntro?: boolean;
  sidebarFooter?: ReactNode;
  title: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const activeHref = navGroups
    .flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  const handleNavigation = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (
      beforeNavigate === undefined ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin) return;

    event.preventDefault();
    void beforeNavigate(href).then(
      (shouldNavigate) => {
        if (shouldNavigate) router.push(href);
      },
      () => {
        // A failed draft save keeps the user on the current page.
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-tapit-paper">
      <SidebarNav
        activeHref={activeHref}
        eyebrow={eyebrow}
        groups={navGroups}
        mobileHeaderActions={mobileHeaderActions}
        onNavigate={handleNavigation}
        sidebarFooter={sidebarFooter}
        title={title}
      />
      <main className="min-h-[100dvh] lg:ml-[72px] lg:[&_.fixed.inset-x-0]:left-[72px] xl:ml-[252px] xl:[&_.fixed.inset-x-0]:left-[252px]">
        {showPageIntro ? (
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 sm:px-10 sm:pt-12">
            <p className="tapit-eyebrow">{eyebrow}</p>
            <h1 className="tapit-display mt-3 text-3xl font-medium leading-tight text-tapit-ink sm:text-4xl">
              {title}
            </h1>
          </div>
        ) : pageTitle ? (
          <h1 className="sr-only">{pageTitle}</h1>
        ) : null}
        {children}
      </main>
    </div>
  );
}
