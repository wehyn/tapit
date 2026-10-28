"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from "react";

import { Brand } from "./Brand";
import { useDraftStatus, type DraftStatus } from "./DraftSaveContext";
import {
  activeNavItemFor,
  isNavItemActive,
  navAudienceSwitch,
  navAudiences,
  navItemsFor,
  sidebarSectionsFor,
  type NavAudience,
  type NavItem,
} from "./navigation";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";

export type WorkspaceLive = { slug: string; published: boolean };

type NavigationTourItem = NavItem & { tourDescription: string };
type NavigationTourLayout = {
  href: string;
  target: { top: number; left: number; width: number; height: number };
  coach: { top: number; left: number; width: number };
};

export type WorkspaceChromeProps = {
  audience: NavAudience;
  hasCardOwnerFeatures?: boolean;
  beforeNavigate?: (href: string) => Promise<boolean>;
  children: ReactNode;
  email: string;
  live: WorkspaceLive | null;
  navigationTourProfileId?: string;
  onSignOut: () => Promise<void>;
  showAudienceSwitch: boolean;
};

const saveStatusCopy: Record<DraftStatus, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  saved: { label: "All changes saved", tone: "ok" },
  unsaved: { label: "Unsaved changes", tone: "warn" },
  saving: { label: "Saving…", tone: "neutral" },
};

function findVisibleNavigationTourTarget(href: string): HTMLAnchorElement | undefined {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-tour-href]")).find(
    (link) => link.dataset.tourHref === href && link.getClientRects().length > 0,
  );
}

export function WorkspaceChrome({
  audience,
  hasCardOwnerFeatures = true,
  beforeNavigate,
  children,
  email,
  live,
  navigationTourProfileId,
  onSignOut,
  showAudienceSwitch,
}: WorkspaceChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const draftStatus = useDraftStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [navigationBlocked, setNavigationBlocked] = useState(false);
  const [desktopViewport, setDesktopViewport] = useState(false);
  const [tourProgress, setTourProgress] = useState<{ profileId: string; index: number } | null>(
    null,
  );
  const [tourLayout, setTourLayout] = useState<NavigationTourLayout | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuButtonRef = useRef<HTMLButtonElement>(null);
  const tourStartedForProfileRef = useRef<string | null>(null);
  const navigationTourDescriptionId = useId();
  const sheetId = useId();
  const audienceCopy = navAudiences[audience];
  const currentItem = activeNavItemFor(audience, pathname, hasCardOwnerFeatures);
  const tourItems = useMemo(
    () =>
      navItemsFor("customer", "sidebar", hasCardOwnerFeatures).filter(
        (item): item is NavigationTourItem => Boolean(item.tourDescription),
      ),
    [hasCardOwnerFeatures],
  );
  const tourIndex =
    tourProgress !== null && tourProgress.profileId === navigationTourProfileId
      ? tourProgress.index
      : null;
  const tourItem = tourIndex === null ? undefined : tourItems[tourIndex];
  const tourInMore = Boolean(tourItem && !desktopViewport && !tourItem.surfaces.includes("tabs"));
  const tourWaitsForMoreClose = !desktopViewport && moreOpen && !tourInMore;
  const tourInAccountMenu = Boolean(desktopViewport && tourItem?.section === "pinned");
  const tourIsActive =
    audience === "customer" && navigationTourProfileId !== undefined && tourItem !== undefined;

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => setDesktopViewport(desktop.matches);
    updateViewport();
    desktop.addEventListener("change", updateViewport);
    return () => desktop.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (audience !== "customer" || navigationTourProfileId === undefined) {
      tourStartedForProfileRef.current = null;
      return;
    }

    const storageKey = `tapit:customer-navigation-tour:${navigationTourProfileId}`;
    try {
      if (window.localStorage.getItem(storageKey) === "done") {
        tourStartedForProfileRef.current = navigationTourProfileId;
        return;
      }
    } catch {
      // Continue with the tour when storage is unavailable.
    }

    if (tourStartedForProfileRef.current === navigationTourProfileId) return;
    let started = tourStartedForProfileRef.current === navigationTourProfileId;
    const startWhenReady = () => {
      if (started) return;
      if (
        pathname === "/app/profile" &&
        document.querySelector('[data-navigation-tour-ready="true"]') === null
      ) {
        return;
      }
      started = true;
      tourStartedForProfileRef.current = navigationTourProfileId;
      setTourLayout(null);
      setTourProgress({ profileId: navigationTourProfileId, index: 0 });
    };
    const observer = new MutationObserver(startWhenReady);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-navigation-tour-ready"],
      childList: true,
      subtree: true,
    });
    const frame = requestAnimationFrame(startWhenReady);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [audience, navigationTourProfileId, pathname]);

  const finishTour = useCallback(() => {
    if (navigationTourProfileId !== undefined) {
      try {
        window.localStorage.setItem(
          `tapit:customer-navigation-tour:${navigationTourProfileId}`,
          "done",
        );
      } catch {
        // Storage can be unavailable in privacy-restricted browsers.
      }
    }
    const activeHref = tourItem?.href;
    const focusMore = !desktopViewport && tourInMore;
    const focusAccountMenu = desktopViewport && tourInAccountMenu;
    setTourProgress(null);
    setTourLayout(null);
    setMoreOpen(false);
    setAccountMenuOpen(false);
    setNavigationBlocked(false);
    requestAnimationFrame(() => {
      if (focusMore) moreButtonRef.current?.focus();
      else if (focusAccountMenu) accountMenuButtonRef.current?.focus();
      else if (activeHref) findVisibleNavigationTourTarget(activeHref)?.focus();
    });
  }, [desktopViewport, navigationTourProfileId, tourInAccountMenu, tourInMore, tourItem]);

  const closeMore = useCallback(
    (dismissTour = true) => {
      if (dismissTour && tourIsActive) finishTour();
      else {
        setMoreOpen(false);
        setNavigationBlocked(false);
        requestAnimationFrame(() => moreButtonRef.current?.focus());
      }
    },
    [finishTour, tourIsActive],
  );

  useEffect(() => {
    if (!tourIsActive || tourIndex === null || tourItem === undefined) return;
    if (!desktopViewport && !tourItem.surfaces.includes("tabs")) {
      const frame = requestAnimationFrame(() => setMoreOpen(true));
      return () => cancelAnimationFrame(frame);
    }
    if (moreOpen) {
      const frame = requestAnimationFrame(() => closeMore(false));
      return () => cancelAnimationFrame(frame);
    }
    return;
  }, [closeMore, desktopViewport, moreOpen, tourIndex, tourIsActive, tourItem]);

  useEffect(() => {
    if (!moreOpen) return;

    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      setMoreOpen(false);
      setNavigationBlocked(false);
    };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [moreOpen]);

  const updateTourLayout = useCallback(() => {
    if (!tourIsActive || tourIndex === null || tourItem === undefined) return;
    const target = findVisibleNavigationTourTarget(tourItem.href);
    if (!target) return;

    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = target.getBoundingClientRect();
    const margin = 16;
    const coachHeight = 180;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - coachHeight - margin);
    const left = desktopViewport
      ? Math.min(Math.max(margin, rect.right + 12), maxLeft)
      : Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), maxLeft);
    const above = rect.top - coachHeight - 12;
    const below = rect.bottom + 12;
    const top =
      desktopViewport || above >= margin
        ? Math.min(Math.max(margin, desktopViewport ? rect.top : above), maxTop)
        : below + coachHeight <= window.innerHeight - margin
          ? below
          : margin;

    setTourLayout({
      href: tourItem.href,
      target: {
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      },
      coach: { top, left, width },
    });
  }, [desktopViewport, tourIndex, tourIsActive, tourItem]);

  useEffect(() => {
    if (!tourIsActive || tourIndex === null) return;
    const frame = requestAnimationFrame(updateTourLayout);
    window.addEventListener("resize", updateTourLayout);
    document.addEventListener("scroll", updateTourLayout, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateTourLayout);
      document.removeEventListener("scroll", updateTourLayout, true);
    };
  }, [moreOpen, tourIndex, tourIsActive, updateTourLayout]);

  useEffect(() => {
    if (!tourIsActive || tourIndex === null || tourInMore) return;
    const closeTourOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      finishTour();
    };
    document.addEventListener("keydown", closeTourOnEscape);
    return () => document.removeEventListener("keydown", closeTourOnEscape);
  }, [finishTour, tourIndex, tourInMore, tourIsActive]);

  const renderNavigationTourSpotlight = () => {
    if (
      !tourIsActive ||
      tourItem === undefined ||
      tourIndex === null ||
      tourLayout?.href !== tourItem.href
    ) {
      return null;
    }

    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-50 rounded-control outline-2 outline-tapit-surface"
        data-testid="navigation-tour-spotlight"
        style={{
          top: tourLayout.target.top,
          left: tourLayout.target.left,
          width: tourLayout.target.width,
          height: tourLayout.target.height,
          boxShadow: "0 0 0 100vmax rgb(27 36 51 / 62%)",
        }}
      />
    );
  };

  const renderNavigationTourCoach = () => {
    if (
      !tourIsActive ||
      tourItem === undefined ||
      tourIndex === null ||
      tourLayout?.href !== tourItem.href
    ) {
      return null;
    }

    return (
      <div
        aria-label="Customer navigation tour"
        className="fixed z-50 flex flex-col gap-2 rounded-card bg-tapit-surface p-4 text-tapit-ink shadow-card"
        data-testid="navigation-tour-coach-mark"
        data-navigation-tour-controls="true"
        role="group"
        style={{
          top: tourLayout.coach.top,
          left: tourLayout.coach.left,
          width: tourLayout.coach.width,
          zIndex: 51,
        }}
      >
        <div aria-atomic="true" aria-live="polite" role="status">
          <h2 className="text-sm font-semibold">{tourItem.label}</h2>
          <p className="mt-1 text-sm leading-5 text-tapit-muted" id={navigationTourDescriptionId}>
            {tourItem.tourDescription}
          </p>
          <p className="mt-2 text-xs font-medium text-tapit-muted">
            Step {tourIndex + 1} of {tourItems.length}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button onClick={finishTour} type="button" variant="quiet">
            Skip tour
          </Button>
          <Button
            autoFocus
            onClick={() => {
              if (tourIndex === tourItems.length - 1) finishTour();
              else if (navigationTourProfileId !== undefined) {
                setTourProgress({ profileId: navigationTourProfileId, index: tourIndex + 1 });
              }
            }}
            type="button"
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  const handleNavigation = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, href: string) => {
      if (
        beforeNavigate === undefined ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        if (moreOpen) closeMore();
        return;
      }

      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin) {
        if (moreOpen) closeMore();
        return;
      }

      event.preventDefault();
      if (moreOpen) setNavigationBlocked(false);
      void beforeNavigate(href).then(
        (shouldNavigate) => {
          if (shouldNavigate) {
            router.push(href);
            if (moreOpen) closeMore();
          } else if (moreOpen) {
            setNavigationBlocked(true);
          }
        },
        () => {
          if (moreOpen) setNavigationBlocked(true);
        },
      );
    },
    [beforeNavigate, closeMore, moreOpen, router],
  );

  const sidebarSections = sidebarSectionsFor(audience, hasCardOwnerFeatures);
  const pinnedItems = navItemsFor(audience, "sidebar", hasCardOwnerFeatures).filter(
    (item) => item.section === "pinned",
  );
  const tabItems = navItemsFor(audience, "tabs", hasCardOwnerFeatures);
  const moreItems = navItemsFor(audience, "more", hasCardOwnerFeatures);
  const otherAudiences = navAudienceSwitch.filter((option) => option.audience !== audience);
  const saveStatus = saveStatusCopy[draftStatus];
  const activeTourHref = tourIsActive ? tourItem.href : undefined;

  return (
    <div className="min-h-dvh min-w-0 bg-tapit-paper lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:py-4 lg:pl-4">
      <aside
        aria-label={audienceCopy.label}
        className="hidden min-h-0 flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:self-start"
        data-testid="workspace-sidebar"
      >
        <Brand
          href={audienceCopy.home}
          onClick={(event) => handleNavigation(event, audienceCopy.home)}
        />
        {showAudienceSwitch ? (
          <AudienceSwitch audience={audience} onNavigate={handleNavigation} />
        ) : null}
        <nav
          aria-label={audienceCopy.navLabel}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain"
        >
          {sidebarSections.map((section) => (
            <div className="flex flex-col gap-1" key={section.section}>
              <h2 className="px-3 pb-1 text-xs font-semibold text-tapit-muted">{section.label}</h2>
              {section.items.map((item) => (
                <NavLink
                  active={isNavItemActive(item, pathname)}
                  item={item}
                  key={item.href}
                  onNavigate={handleNavigation}
                  activeTourHref={activeTourHref}
                  tourDescriptionId={navigationTourDescriptionId}
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          <AccountMenu
            activeTourHref={activeTourHref}
            email={email}
            isActive={(item) => isNavItemActive(item, pathname)}
            items={pinnedItems}
            onOpenChange={setAccountMenuOpen}
            onNavigate={handleNavigation}
            onSignOut={onSignOut}
            onTourDismiss={finishTour}
            open={accountMenuOpen || tourInAccountMenu}
            tourDescriptionId={navigationTourDescriptionId}
            tourOpen={tourInAccountMenu && tourIsActive}
            triggerRef={accountMenuButtonRef}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col max-lg:[&_.fixed.inset-x-0]:bottom-20 lg:[&_.fixed.inset-x-0]:left-[264px]">
        <header className="flex min-h-16 flex-wrap items-center gap-3 bg-tapit-paper px-4 py-3 sm:px-8 lg:px-8">
          <div className="lg:hidden">
            <Brand
              href={audienceCopy.home}
              onClick={(event) => handleNavigation(event, audienceCopy.home)}
            />
          </div>
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-2 text-sm text-tapit-muted lg:flex"
          >
            <Link
              className="inline-flex items-center text-tapit-muted hover:text-tapit-ink"
              href={audienceCopy.home}
              onClick={(event) => handleNavigation(event, audienceCopy.home)}
            >
              {audienceCopy.breadcrumbRoot}
            </Link>
            {currentItem ? (
              <>
                <Icon name="caretRight" size={16} />
                <span aria-current="page" className="font-semibold text-tapit-ink">
                  {currentItem.label}
                </span>
              </>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span role="status" aria-live="polite">
              <Chip tone={saveStatus.tone}>
                <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                {saveStatus.label}
              </Chip>
            </span>
          </div>
        </header>
        <main className="min-w-0 px-4 sm:px-8 lg:px-8 lg:pb-12">{children}</main>
        <div aria-hidden="true" className="h-20 lg:hidden" />
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-4 lg:hidden"
      >
        <div className="mx-auto flex max-w-md gap-1 rounded-card bg-tapit-surface p-2 shadow-card">
          {tabItems.map((item) => {
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                aria-describedby={
                  item.href === activeTourHref ? navigationTourDescriptionId : undefined
                }
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-control text-xs font-semibold transition-colors ${active ? "bg-tapit-accent-soft text-tapit-accent-strong" : "text-tapit-muted hover:text-tapit-ink"}`}
                data-tour-href={item.tourDescription ? item.href : undefined}
                href={item.href}
                key={item.href}
                onClick={(event) => handleNavigation(event, item.href)}
              >
                <Icon name={item.icon} size={20} weight={active ? "fill" : "regular"} />
                {item.tabLabel ?? item.label}
              </Link>
            );
          })}
          <button
            aria-controls={sheetId}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-control text-xs font-semibold transition-colors ${moreOpen ? "bg-tapit-accent-soft text-tapit-accent-strong" : "text-tapit-muted hover:text-tapit-ink"}`}
            onClick={() => {
              setNavigationBlocked(false);
              setMoreOpen(true);
            }}
            ref={moreButtonRef}
            type="button"
          >
            <Icon name="more" size={20} />
            More
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <MoreSheet
          audience={audience}
          email={email}
          id={sheetId}
          items={moreItems}
          live={live}
          navigationBlocked={navigationBlocked}
          onClose={closeMore}
          onNavigate={handleNavigation}
          onSignOut={onSignOut}
          otherAudiences={showAudienceSwitch ? otherAudiences : []}
          pathname={pathname}
          activeTourHref={activeTourHref}
          tourCoach={tourInMore ? renderNavigationTourCoach() : null}
          tourDescriptionId={navigationTourDescriptionId}
          tourSpotlight={tourInMore ? renderNavigationTourSpotlight() : null}
        />
      ) : null}
      {!tourInMore && !tourWaitsForMoreClose ? (
        <>
          {renderNavigationTourSpotlight()}
          {renderNavigationTourCoach()}
        </>
      ) : null}
    </div>
  );
}

function NavLink({
  active,
  item,
  onNavigate,
  onSelect,
  activeTourHref,
  tourDescriptionId,
}: {
  active: boolean;
  item: NavItem;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onSelect?: () => void;
  activeTourHref?: string;
  tourDescriptionId: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-describedby={item.href === activeTourHref ? tourDescriptionId : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors ${active ? "bg-tapit-accent-soft font-semibold text-tapit-accent-strong" : "font-medium text-tapit-muted hover:bg-tapit-soft-surface hover:text-tapit-ink"}`}
      data-tour-href={item.tourDescription ? item.href : undefined}
      href={item.href}
      onClick={(event) => {
        onNavigate(event, item.href);
        onSelect?.();
      }}
    >
      <Icon name={item.icon} size={20} weight={active ? "fill" : "regular"} />
      {item.label}
    </Link>
  );
}

function AudienceSwitch({
  audience,
  onNavigate,
}: {
  audience: NavAudience;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-1 rounded-control bg-tapit-soft-surface p-1"
      role="group"
      aria-label="Workspace"
    >
      {navAudienceSwitch.map((option) => {
        const on = option.audience === audience;
        return (
          <Link
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-control text-xs font-semibold transition-colors ${on ? "bg-tapit-surface text-tapit-ink shadow-card" : "text-tapit-muted hover:text-tapit-ink"}`}
            href={option.href}
            key={option.audience}
            onClick={(event) => onNavigate(event, option.href)}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}

function useSignOut(onSignOut: () => Promise<void>) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setError("");
    setPending(true);
    try {
      await onSignOut();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign out. Try again.");
    } finally {
      setPending(false);
    }
  }

  return { error, pending, signOut };
}

function AccountMenu({
  activeTourHref,
  email,
  isActive,
  items,
  open,
  onNavigate,
  onOpenChange,
  onSignOut,
  onTourDismiss,
  tourDescriptionId,
  tourOpen,
  triggerRef,
}: {
  activeTourHref?: string;
  email: string;
  isActive: (item: NavItem) => boolean;
  items: readonly NavItem[];
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => Promise<void>;
  open: boolean;
  onTourDismiss: () => void;
  tourDescriptionId: string;
  tourOpen: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const { error, pending, signOut } = useSignOut(onSignOut);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      const isTourControl =
        tourOpen && target instanceof Element && target.closest("[data-navigation-tour-controls]");
      if (target instanceof Node && !containerRef.current?.contains(target) && !isTourControl) {
        if (tourOpen) onTourDismiss();
        else onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [onOpenChange, onTourDismiss, open, tourOpen]);

  const initials = email.slice(0, 2).toUpperCase() || "U";

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        if (tourOpen) onTourDismiss();
        else {
          onOpenChange(false);
          triggerRef.current?.focus();
        }
      }}
      ref={containerRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        className="flex min-h-11 w-full items-center gap-3 rounded-control px-2 text-left text-sm text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink"
        onClick={() => {
          if (tourOpen) onTourDismiss();
          else onOpenChange(!open);
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-tapit-accent text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-tapit-ink">{email}</span>
        <Icon name={open ? "caretUp" : "caretDown"} size={16} />
      </button>
      <div
        aria-label="Account options"
        className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1 rounded-card bg-tapit-surface p-2 shadow-card"
        hidden={!open}
        id={menuId}
        role="group"
      >
        <p className="break-words px-3 py-2 text-sm text-tapit-ink">{email}</p>
        {items.map((item) => (
          <NavLink
            active={isActive(item)}
            item={item}
            key={item.href}
            onNavigate={onNavigate}
            activeTourHref={activeTourHref}
            tourDescriptionId={tourDescriptionId}
            onSelect={() => {
              if (tourOpen) onTourDismiss();
              else onOpenChange(false);
            }}
          />
        ))}
        <Button
          className="w-full justify-start"
          disabled={pending}
          onClick={() => void signOut()}
          type="button"
          variant="danger-soft"
        >
          <Icon name="signOut" size={18} />
          Sign out
        </Button>
        {error ? (
          <p className="px-3 py-2 text-sm text-tapit-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MoreSheet({
  activeTourHref,
  audience,
  email,
  id,
  items,
  live,
  navigationBlocked,
  onClose,
  onNavigate,
  onSignOut,
  otherAudiences,
  pathname,
  tourCoach,
  tourDescriptionId,
  tourSpotlight,
}: {
  activeTourHref?: string;
  audience: NavAudience;
  email: string;
  id: string;
  items: NavItem[];
  live: WorkspaceLive | null;
  navigationBlocked: boolean;
  onClose: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onSignOut: () => Promise<void>;
  otherAudiences: { audience: NavAudience; href: string; label: string }[];
  pathname: string;
  tourCoach: ReactNode;
  tourDescriptionId: string;
  tourSpotlight: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { error, pending, signOut } = useSignOut(onSignOut);
  const initials = email.slice(0, 2).toUpperCase() || "U";

  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const dialog = dialogRef.current;
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
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
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" id={id}>
      <div aria-hidden="true" className="absolute inset-0 bg-tapit-ink/40" onClick={onClose} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex max-h-[calc(100dvh-4rem)] flex-col gap-4 overflow-y-auto rounded-t-card bg-tapit-surface px-4 pt-3 pb-6 shadow-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-tapit-muted/40" />
        <h2 className="sr-only" id={titleId}>
          More
        </h2>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-tapit-accent text-sm font-semibold text-white">
            {initials}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-sm font-semibold text-tapit-ink">{email}</p>
            <p className="text-xs text-tapit-muted">{navAudiences[audience].label} workspace</p>
          </div>
          {live ? (
            <Chip tone={live.published ? "ok" : "warn"}>{live.published ? "Live" : "Draft"}</Chip>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Link
              aria-describedby={item.href === activeTourHref ? tourDescriptionId : undefined}
              className="flex min-h-14 items-center gap-3 rounded-control bg-tapit-soft-surface px-4 text-sm font-semibold text-tapit-ink"
              data-tour-href={item.tourDescription ? item.href : undefined}
              href={item.href}
              key={item.href}
              aria-current={isNavItemActive(item, pathname) ? "page" : undefined}
              onClick={(event) => {
                onNavigate(event, item.href);
              }}
            >
              <span className="grid size-10 place-items-center rounded-control bg-tapit-surface">
                <Icon name={item.icon} size={20} />
              </span>
              <span className="flex-1">{item.label}</span>
              <Icon name="caretRight" size={16} />
            </Link>
          ))}
          {otherAudiences.map((option) => (
            <Link
              className="flex min-h-14 items-center gap-3 rounded-control bg-tapit-soft-surface px-4 text-sm font-semibold text-tapit-ink"
              href={option.href}
              key={option.audience}
              onClick={(event) => {
                onNavigate(event, option.href);
              }}
            >
              <span className="grid size-10 place-items-center rounded-control bg-tapit-surface">
                <Icon name="users" size={20} />
              </span>
              <span className="flex-1">Switch to {option.label}</span>
              <Icon name="caretRight" size={16} />
            </Link>
          ))}
        </div>
        {navigationBlocked ? (
          <p className="text-sm text-tapit-danger" role="alert">
            Your draft could not be saved. You are still on this page.
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-tapit-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onClose} type="button" variant="secondary">
            Close
          </Button>
          <Button
            disabled={pending}
            onClick={() => void signOut()}
            type="button"
            variant="danger-soft"
          >
            <Icon name="signOut" size={18} />
            Sign out
          </Button>
        </div>
        {tourSpotlight}
        {tourCoach}
      </div>
    </div>
  );
}
