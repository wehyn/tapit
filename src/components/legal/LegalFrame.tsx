import Link from "next/link";
import type { ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { segmentedClass, segmentedItemClass } from "@/components/ui/Segmented";

export function LegalFrame({
  active,
  children,
  effective,
  sections,
  title,
}: {
  active: "privacy" | "terms";
  children: ReactNode;
  effective: string;
  sections: readonly { id: string; title: string }[];
  title: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-12 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-4 rounded-card bg-tapit-surface py-2 pl-4 pr-2 shadow-card">
        <Brand />
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="quiet">
            Sign in
          </ButtonLink>
          <ButtonLink href="/login?mode=signup">Get started</ButtonLink>
        </div>
      </header>
      <div className="flex flex-col gap-2 px-2">
        <p className="text-xs font-semibold tracking-widest text-tapit-accent-strong uppercase">
          Legal
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-tapit-ink">{title}</h1>
        <p className="text-base text-tapit-muted">{effective}</p>
        <nav aria-label="Legal documents" className={`${segmentedClass()} mt-2 self-start`}>
          <Link
            aria-current={active === "privacy" ? "page" : undefined}
            className={segmentedItemClass(active === "privacy")}
            href="/privacy"
          >
            Privacy
          </Link>
          <Link
            aria-current={active === "terms" ? "page" : undefined}
            className={segmentedItemClass(active === "terms")}
            href="/terms"
          >
            Terms
          </Link>
        </nav>
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          aria-label="On this page"
          className="hidden flex-col gap-1 rounded-card bg-tapit-surface p-6 shadow-card lg:flex lg:w-72 lg:shrink-0"
        >
          <p className="px-3 py-2 text-xs font-semibold text-tapit-muted">On this page</p>
          {sections.map((section) => (
            <a
              className="flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-tapit-muted hover:bg-tapit-soft-surface hover:text-tapit-ink"
              href={`#${section.id}`}
              key={section.id}
            >
              {section.title}
            </a>
          ))}
        </nav>
        <article className="flex min-w-0 max-w-3xl flex-1 flex-col gap-8 rounded-card bg-tapit-surface p-6 shadow-card">
          {children}
        </article>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-4 px-2 pb-8 text-sm text-tapit-muted">
        <span>© 2026 Tapit</span>
        <ButtonLink href="/" variant="quiet">
          Back to Tapit
        </ButtonLink>
      </footer>
    </main>
  );
}
