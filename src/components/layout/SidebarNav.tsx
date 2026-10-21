"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Brand } from "./Brand";
import type { ShellNavGroup, ShellNavItem } from "./navigation";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";

const drawerId = "authenticated-navigation-drawer";

declare global {
  interface Window {
    tapitStartNavigationTour?: () => void;
  }
}

type TourItem = ShellNavItem & { tourDescription: string };
type TourLayout = {
  target: { top: number; left: number; width: number; height: number };
  coach: { top: number; left: number; width: number };
};

export function SidebarNav({
  activeHref,
  eyebrow,
  groups,
  mobileHeaderActions,
  navigationTourStorageKey,
  canReplayNavigationTour = false,
  onNavigate,
  sidebarFooter,
  title,
}: {
  activeHref?: string;
  eyebrow: string;
  groups: ShellNavGroup[];
  mobileHeaderActions?: ReactNode;
  navigationTourStorageKey?: string;
  canReplayNavigationTour?: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  sidebarFooter?: ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [tourLayout, setTourLayout] = useState<TourLayout | null>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tourId = useId();
  const tourItems = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter((item): item is TourItem => Boolean(item.tourDescription)),
    [groups],
  );
  const tourItem = tourIndex === null ? undefined : tourItems[tourIndex];
  const startNavigationTour = useCallback(() => {
    const desktopSidebar = document.querySelector<HTMLElement>('[data-testid="workspace-sidebar"]');
    if (desktopSidebar?.getClientRects().length === 0) setOpen(true);
    setTourIndex(0);
  }, []);

  useEffect(() => {
    if (!canReplayNavigationTour || tourItems.length === 0) return;
    window.tapitStartNavigationTour = startNavigationTour;
    return () => {
      if (window.tapitStartNavigationTour === startNavigationTour) {
        delete window.tapitStartNavigationTour;
      }
    };
  }, [canReplayNavigationTour, startNavigationTour, tourItems.length]);

  const finishTour = useCallback(
    (closeDrawer = false) => {
      const target = !open
        ? Array.from(
            document.querySelectorAll<HTMLAnchorElement>('[data-tour-target="true"]'),
          ).find((link) => link.getClientRects().length > 0)
        : undefined;
      if (navigationTourStorageKey) {
        try {
          window.localStorage.setItem(navigationTourStorageKey, "done");
        } catch {
          // Storage can be unavailable in privacy-restricted browsers.
        }
      }
      setTourIndex(null);
      setTourLayout(null);
      if (closeDrawer) {
        setOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
      } else if (target) {
        requestAnimationFrame(() => target.focus());
      }
    },
    [navigationTourStorageKey, open],
  );

  const close = useCallback(() => {
    finishTour();
    setOpen(false);
    requestAnimationFrame(() => openerRef.current?.focus());
  }, [finishTour]);

  useEffect(() => {
    if (!navigationTourStorageKey || tourItems.length === 0) return;
    try {
      if (window.localStorage.getItem(navigationTourStorageKey) === "done") return;
    } catch {
      // Continue with the tour when storage is unavailable.
    }

    const desktopSidebar = document.querySelector<HTMLElement>('[data-testid="workspace-sidebar"]');
    const frame = requestAnimationFrame(() => {
      if (desktopSidebar?.getClientRects().length === 0) setOpen(true);
      setTourIndex(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationTourStorageKey, tourItems]);

  const updateTourLayout = useCallback(() => {
    const item = tourIndex === null ? undefined : tourItems[tourIndex];
    if (!item) return;

    const target = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("[data-tour-href]"),
    ).find((link) => link.dataset.tourHref === item.href && link.getClientRects().length > 0);
    if (!target) return;

    target.scrollIntoView({ block: "nearest" });
    const rect = target.getBoundingClientRect();
    const margin = 16;
    const coachHeight = 190;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - coachHeight - margin);
    const left = open
      ? Math.min(Math.max(margin, rect.left), maxLeft)
      : Math.min(Math.max(margin, rect.right + 12), maxLeft);
    let top: number;

    if (open) {
      const below = rect.bottom + 12;
      const above = rect.top - coachHeight - 12;
      if (below + coachHeight <= window.innerHeight - margin) top = below;
      else if (above >= margin) top = above;
      else top = maxTop;
    } else {
      const above = rect.top - coachHeight - 12;
      if (rect.top + coachHeight > window.innerHeight - margin && above >= margin) top = above;
      else top = Math.min(Math.max(margin, rect.top), maxTop);
    }

    setTourLayout({
      target: {
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      },
      coach: { top, left, width },
    });
  }, [open, tourIndex, tourItems]);

  useEffect(() => {
    if (tourIndex === null) return;

    const frame = requestAnimationFrame(updateTourLayout);
    window.addEventListener("resize", updateTourLayout);
    document.addEventListener("scroll", updateTourLayout, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTourLayout);
      document.removeEventListener("scroll", updateTourLayout, true);
    };
  }, [tourIndex, updateTourLayout]);

  useEffect(() => {
    if (tourIndex === null || open) return;

    const closeTourOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      finishTour();
    };
    document.addEventListener("keydown", closeTourOnEscape);
    return () => document.removeEventListener("keydown", closeTourOnEscape);
  }, [finishTour, open, tourIndex]);

  const renderTour = () => {
    if (!tourItem || !tourLayout || tourIndex === null) return null;

    return (
      <>
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] rounded-[18px] border-2 border-white"
          data-testid="navigation-tour-spotlight"
          style={{
            top: tourLayout.target.top,
            left: tourLayout.target.left,
            width: tourLayout.target.width,
            height: tourLayout.target.height,
            boxShadow: "0 0 18px 4px rgb(63 109 232 / 55%), 0 0 0 100vmax rgb(17 24 39 / 62%)",
          }}
        />
        <div
          aria-label="Customer navigation tour"
          className="fixed z-[70] flex flex-col gap-3 rounded-2xl border border-tapit-line bg-tapit-surface p-4 text-tapit-ink shadow-[0_18px_48px_rgba(27,36,51,0.2)]"
          data-testid="navigation-tour-coach-mark"
          role="group"
          style={{
            top: tourLayout.coach.top,
            left: tourLayout.coach.left,
            width: tourLayout.coach.width,
          }}
        >
          <div aria-atomic="true" aria-live="polite" role="status">
            <h2 className="text-sm font-semibold">{tourItem.label}</h2>
            <p className="mt-1 text-sm leading-5 text-tapit-muted" id={tourId}>
              {tourItem.tourDescription}
            </p>
            <p className="mt-2 text-xs font-medium text-tapit-muted">
              Step {tourIndex + 1} of {tourItems.length}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              className="!min-h-10 !px-2.5"
              onClick={() => finishTour(open)}
              type="button"
              variant="quiet"
            >
              Skip tour
            </Button>
            <Button
              className="!min-h-10 !px-3"
              onClick={() => {
                if (tourIndex === tourItems.length - 1) finishTour(open);
                else setTourIndex(tourIndex + 1);
              }}
              type="button"
            >
              Next
            </Button>
          </div>
        </div>
      </>
    );
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
  }, [close, open]);

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
                tourDescriptionId={tourId}
                tourTarget={item.href === tourItem?.href}
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
        <div className="mt-7 flex-1 overflow-y-auto overscroll-contain">
          {renderGroups("desktop")}
        </div>
        {sidebarFooter ? (
          <div className="mt-5 border-t border-tapit-line pt-3 xl:mt-8 xl:pt-5">
            {sidebarFooter}
          </div>
        ) : null}
      </aside>
      {!open ? renderTour() : null}

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
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
          </button>
        </div>
      </header>

      {open ? (
        <div
          className={`fixed inset-0 ${tourIndex === null ? "z-40" : "z-[60]"} lg:hidden`}
          id={drawerId}
        >
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
                className="inline-flex size-11 items-center justify-center rounded-[14px] border border-tapit-line text-xl text-tapit-ink transition-colors hover:bg-tapit-soft-surface"
                onClick={close}
                ref={closeButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            {eyebrow ? <p className="tapit-eyebrow mt-10 px-3">{eyebrow}</p> : null}
            <div className="mt-6 flex-1 overflow-y-auto overscroll-contain">
              {renderGroups("mobile")}
            </div>
            {sidebarFooter ? (
              <div className="mt-8 border-t border-tapit-line pt-5">{sidebarFooter}</div>
            ) : null}
            {renderTour()}
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
  tourDescriptionId,
  tourTarget,
}: {
  active: boolean;
  compact?: boolean;
  item: ShellNavItem;
  onClose?: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  tourDescriptionId: string;
  tourTarget: boolean;
}) {
  return (
    <Link
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      aria-describedby={tourTarget ? tourDescriptionId : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[14px] border border-transparent px-3 py-2.5 text-sm transition-colors ${compact ? "lg:justify-center lg:px-0 xl:justify-start xl:px-3" : ""} ${active ? "border-[#d7e2fa] bg-tapit-accent-soft font-semibold text-tapit-accent-strong" : "text-tapit-muted hover:border-tapit-line hover:bg-tapit-surface hover:text-tapit-ink"}`}
      data-tour-href={item.tourDescription ? item.href : undefined}
      data-tour-target={tourTarget ? "true" : undefined}
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
