"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Brand } from "./Brand";

export type ShellNavItem = {
  href: string;
  label: string;
};

export function AppShell({
  children,
  eyebrow,
  headerActions,
  navItems,
  showPageIntro = true,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  headerActions?: ReactNode;
  navItems: ShellNavItem[];
  showPageIntro?: boolean;
  title: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-[100dvh] bg-tapit-paper">
      <header className="border-b border-tapit-line/80 bg-tapit-surface/95">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-x-10 gap-y-3 px-5 py-3 sm:px-8 sm:py-3">
          <Brand showMark={false} />
          <nav
            aria-label={`${title} navigation`}
            className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`relative shrink-0 px-2 py-2 text-sm transition-colors after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-tapit-accent after:transition-transform ${
                    active
                      ? "font-semibold text-tapit-ink after:scale-x-100"
                      : "text-tapit-muted after:scale-x-0 hover:text-tapit-ink hover:after:scale-x-100"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          {headerActions ? <div className="ml-auto flex items-center">{headerActions}</div> : null}
        </div>
      </header>
      <main>
        {showPageIntro ? (
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 sm:px-10 sm:pt-12">
            <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink sm:text-4xl">
              {title}
            </h1>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
