"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { Brand } from "./Brand";
import type { ShellNavGroup, ShellNavItem } from "./navigation";
import { Icon } from "../ui/Icon";

const drawerId = "authenticated-navigation-drawer";

export function SidebarNav({
  activeHref,
  eyebrow,
  groups,
  mobileHeaderActions,
  onNavigate,
  sidebarFooter,
  title,
}: {
  activeHref?: string;
  eyebrow: string;
  groups: ShellNavGroup[];
  mobileHeaderActions?: ReactNode;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  sidebarFooter?: ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;

    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        close();
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (drawer === null) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first || !drawer.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !drawer.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const renderGroups = (surface: "desktop" | "mobile") => (
    <nav aria-label={`${title} navigation`}>
      {groups.map((group) => (
        <section className="mb-7 last:mb-0" key={group.label}>
          <h2
            className={`mb-2 px-3 text-[0.68rem] font-semibold tracking-[0.16em] text-tapit-muted uppercase ${surface === "desktop" ? "lg:sr-only xl:not-sr-only" : ""}`}
          >
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                active={item.href === activeHref}
                item={item}
                compact={surface === "desktop"}
                key={item.href}
                onClose={surface === "mobile" ? close : undefined}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ))}
    </nav>
  );

  return (
    <>
      <aside
        data-testid="workspace-sidebar"
        className="fixed inset-y-0 left-0 z-20 hidden w-[72px] flex-col border-r border-tapit-line bg-tapit-surface px-2 py-6 shadow-[2px_0_14px_rgba(27,36,51,0.025)] lg:flex xl:w-[244px] xl:px-5 xl:py-7"
      >
        <div className="overflow-hidden lg:hidden xl:block">
          <Brand />
        </div>
        <div
          aria-hidden="true"
          className="hidden size-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-tapit-accent to-[#6184e8] text-white shadow-[0_6px_16px_rgba(49,95,228,0.18)] lg:flex xl:hidden"
        >
          <Icon name="fingerprint" size={20} weight="bold" />
        </div>
        {eyebrow ? <p className="tapit-eyebrow mt-10 hidden px-3 xl:block">{eyebrow}</p> : null}
        <div className="mt-7 flex-1 overflow-y-auto">{renderGroups("desktop")}</div>
        {sidebarFooter ? (
          <div className="mt-5 border-t border-tapit-line pt-3 xl:mt-8 xl:pt-5">
            {sidebarFooter}
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-tapit-line bg-tapit-surface px-4 shadow-[0_2px_12px_rgba(27,36,51,0.035)] sm:px-5 lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {mobileHeaderActions}
          <button
            aria-controls={drawerId}
            aria-expanded={open}
            aria-label="Open navigation"
            className="inline-flex size-11 items-center justify-center rounded-[14px] border border-tapit-line bg-tapit-surface text-tapit-ink transition-colors hover:bg-tapit-soft-surface"
            onClick={() => setOpen(true)}
            ref={openerRef}
            type="button"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ☰
            </span>
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" id={drawerId}>
          <button
            aria-label="Close navigation"
            className="absolute inset-0 h-full w-full bg-tapit-ink/35 backdrop-blur-[2px]"
            onClick={close}
            type="button"
          />
          <div
            aria-label={`${title} navigation menu`}
            aria-modal="true"
            className="relative flex h-full w-[min(85vw,340px)] flex-col rounded-r-[24px] border-r border-tapit-line bg-tapit-surface px-5 py-6 shadow-[0_18px_48px_rgba(27,36,51,0.16)] sm:px-6"
            ref={drawerRef}
            role="dialog"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                aria-label="Close navigation"
                className="inline-flex size-11 items-center justify-center rounded-[14px] border border-tapit-line text-2xl text-tapit-ink transition-colors hover:bg-tapit-soft-surface"
                onClick={close}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            {eyebrow ? <p className="tapit-eyebrow mt-10 px-3">{eyebrow}</p> : null}
            <div className="mt-6 flex-1 overflow-y-auto">{renderGroups("mobile")}</div>
            {sidebarFooter ? (
              <div className="mt-8 border-t border-tapit-line pt-5">{sidebarFooter}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function NavLink({
  active,
  compact = false,
  item,
  onClose,
  onNavigate,
}: {
  active: boolean;
  compact?: boolean;
  item: ShellNavItem;
  onClose?: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <Link
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[14px] border border-transparent px-3 py-2.5 text-sm transition-colors ${compact ? "lg:justify-center lg:px-0 xl:justify-start xl:px-3" : ""} ${active ? "border-[#d7e2fa] bg-tapit-accent-soft font-semibold text-tapit-accent-strong" : "text-tapit-muted hover:border-tapit-line hover:bg-tapit-surface hover:text-tapit-ink"}`}
      href={item.href}
      onClick={(event) => {
        const wasDefaultPrevented = event.defaultPrevented;
        onNavigate(event, item.href);
        if (
          onClose &&
          !wasDefaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          new URL(item.href, window.location.href).origin === window.location.origin
        ) {
          onClose();
        }
      }}
    >
      <Icon name={item.icon} size={19} weight={active ? "fill" : "regular"} />
      <span className={compact ? "lg:sr-only xl:not-sr-only" : ""}>{item.label}</span>
    </Link>
  );
}
