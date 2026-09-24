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
          <h2 className="mb-2 px-3 text-[0.68rem] font-semibold tracking-[0.18em] text-tapit-muted uppercase">
            {group.label}
          </h2>
          <div className="space-y-1">
            {group.items.map((item) => (
              <NavLink
                active={item.href === activeHref}
                item={item}
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[285px] flex-col border-r border-tapit-line bg-tapit-surface px-6 py-7 lg:flex">
        <Brand />
        {eyebrow ? (
          <p className="mt-10 px-3 text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-6 flex-1 overflow-y-auto">{renderGroups("desktop")}</div>
        {sidebarFooter ? (
          <div className="mt-8 border-t border-tapit-line pt-5">{sidebarFooter}</div>
        ) : null}
      </aside>

      <header className="flex min-h-16 items-center justify-between border-b border-tapit-line bg-tapit-surface px-5 lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {mobileHeaderActions}
          <button
            aria-controls={drawerId}
            aria-expanded={open}
            aria-label="Open navigation"
            className="inline-flex size-11 items-center justify-center rounded-tapit border border-tapit-line text-tapit-ink"
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
            className="absolute inset-0 h-full w-full bg-tapit-ink/30"
            onClick={close}
            type="button"
          />
          <div
            aria-label={`${title} navigation menu`}
            aria-modal="true"
            className="relative flex h-full w-[min(85vw,340px)] flex-col border-r border-tapit-line bg-tapit-surface px-6 py-7"
            ref={drawerRef}
            role="dialog"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                aria-label="Close navigation"
                className="inline-flex size-11 items-center justify-center rounded-tapit border border-tapit-line text-2xl text-tapit-ink"
                onClick={close}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            {eyebrow ? (
              <p className="mt-10 px-3 text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
                {eyebrow}
              </p>
            ) : null}
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
  item,
  onClose,
  onNavigate,
}: {
  active: boolean;
  item: ShellNavItem;
  onClose?: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-tapit px-3 py-2.5 text-sm transition-colors ${active ? "bg-tapit-accent-soft font-semibold text-tapit-accent" : "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink"}`}
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
      <span>{item.label}</span>
    </Link>
  );
}
