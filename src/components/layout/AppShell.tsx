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
  navItems,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  navItems: ShellNavItem[];
  title: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-tapit-paper">
      <header className="border-b border-tapit-line bg-tapit-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-4 sm:px-8">
          <Brand />
          <nav aria-label={`${title} navigation`} className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-tapit-accent-soft font-semibold text-tapit-accent-strong"
                      : "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main>
        <div className="mx-auto max-w-7xl px-5 pt-10 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink sm:text-4xl">
            {title}
          </h1>
        </div>
        {children}
      </main>
    </div>
  );
}
