"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
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

export type WorkspaceChromeProps = {
  audience: NavAudience;
  beforeNavigate?: (href: string) => Promise<boolean>;
  children: ReactNode;
  email: string;
  live: WorkspaceLive | null;
  onSignOut: () => Promise<void>;
  showAudienceSwitch: boolean;
};

const saveStatusCopy: Record<DraftStatus, { label: string; tone: "ok" | "warn" | "neutral" }> = {
  saved: { label: "All changes saved", tone: "ok" },
  unsaved: { label: "Unsaved changes", tone: "warn" },
  saving: { label: "Saving…", tone: "neutral" },
};

export function WorkspaceChrome({
  audience,
  beforeNavigate,
  children,
  email,
  live,
  onSignOut,
  showAudienceSwitch,
}: WorkspaceChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const draftStatus = useDraftStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();
  const audienceCopy = navAudiences[audience];
  const currentItem = activeNavItemFor(audience, pathname);

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
    },
    [beforeNavigate, router],
  );

  const closeMore = useCallback(() => {
    setMoreOpen(false);
    requestAnimationFrame(() => moreButtonRef.current?.focus());
  }, []);

  const sidebarSections = sidebarSectionsFor(audience);
  const pinnedItems = navItemsFor(audience, "sidebar").filter((item) => item.section === "pinned");
  const tabItems = navItemsFor(audience, "tabs");
  const moreItems = navItemsFor(audience, "more");
  const otherAudiences = navAudienceSwitch.filter((option) => option.audience !== audience);
  const saveStatus = saveStatusCopy[draftStatus];

  return (
    <div className="min-h-dvh min-w-0 bg-tapit-paper lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:py-4 lg:pl-4">
      <aside
        aria-label={audienceCopy.label}
        className="hidden min-h-0 flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-2rem)] lg:self-start"
        data-testid="workspace-sidebar"
      >
        <Brand href={audienceCopy.home} />
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
                />
              ))}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-2">
          {live ? <LiveStatusCard live={live} /> : null}
          {pinnedItems.map((item) => (
            <NavLink
              active={isNavItemActive(item, pathname)}
              item={item}
              key={item.href}
              onNavigate={handleNavigation}
            />
          ))}
          <AccountMenu email={email} onSignOut={onSignOut} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col max-lg:[&_.fixed.inset-x-0]:bottom-20 lg:[&_.fixed.inset-x-0]:left-[264px]">
        <header className="sticky top-0 z-10 flex min-h-16 flex-wrap items-center gap-3 bg-tapit-paper px-4 py-3 sm:px-8 lg:px-8">
          <div className="lg:hidden">
            <Brand href={audienceCopy.home} />
          </div>
          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 items-center gap-2 text-sm text-tapit-muted lg:flex"
          >
            <Link
              className="inline-flex items-center text-tapit-muted hover:text-tapit-ink"
              href={audienceCopy.home}
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
            <button
              className="hidden h-11 min-w-72 items-center gap-2 rounded-control bg-tapit-surface px-4 text-left text-sm text-tapit-muted shadow-card lg:flex"
              type="button"
            >
              <Icon name="search" size={18} />
              <span className="flex-1">Search pages, links, settings</span>
              <kbd className="rounded-control bg-tapit-soft-surface px-2 text-xs font-semibold text-tapit-muted">
                ⌘K
              </kbd>
            </button>
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
                className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-control text-xs font-semibold transition-colors ${active ? "bg-tapit-accent-soft text-tapit-accent-strong" : "text-tapit-muted hover:text-tapit-ink"}`}
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
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-control text-xs font-semibold transition-colors ${moreOpen ? "bg-tapit-accent-soft text-tapit-accent-strong" : "text-tapit-muted hover:text-tapit-ink"}`}
            onClick={() => setMoreOpen(true)}
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
          onClose={closeMore}
          onNavigate={handleNavigation}
          onSignOut={onSignOut}
          otherAudiences={showAudienceSwitch ? otherAudiences : []}
          pathname={pathname}
        />
      ) : null}
    </div>
  );
}

function NavLink({
  active,
  item,
  onNavigate,
  onSelect,
}: {
  active: boolean;
  item: NavItem;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onSelect?: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-control px-3 text-sm transition-colors ${active ? "bg-tapit-accent-soft font-semibold text-tapit-accent-strong" : "font-medium text-tapit-muted hover:bg-tapit-soft-surface hover:text-tapit-ink"}`}
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
            className={`flex min-h-9 items-center justify-center rounded-control text-xs font-semibold transition-colors ${on ? "bg-tapit-surface text-tapit-ink shadow-card" : "text-tapit-muted hover:text-tapit-ink"}`}
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

function LiveStatusCard({ live }: { live: WorkspaceLive }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-tapit-soft-surface p-3">
      <Chip tone={live.published ? "ok" : "warn"}>
        <span aria-hidden="true" className="size-2 rounded-full bg-current" />
        {live.published ? "Live" : "Draft"}
      </Chip>
      <Link className="truncate text-sm font-semibold text-tapit-ink" href={`/${live.slug}`}>
        {`/${live.slug}`}
      </Link>
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

function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { error, pending, signOut } = useSignOut(onSignOut);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const initials = email.slice(0, 2).toUpperCase() || "U";

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }}
      ref={containerRef}
    >
      <div
        aria-label="Account options"
        className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-1 rounded-card bg-tapit-surface p-2 shadow-card"
        hidden={!open}
        id={menuId}
        role="group"
      >
        <p className="break-words px-3 py-2 text-sm text-tapit-ink">{email}</p>
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
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        className="flex min-h-12 w-full items-center gap-3 rounded-control px-2 text-left text-sm text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-tapit-accent text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-tapit-ink">{email}</span>
        <Icon name={open ? "caretUp" : "caretDown"} size={16} />
      </button>
    </div>
  );
}

function MoreSheet({
  audience,
  email,
  id,
  items,
  live,
  onClose,
  onNavigate,
  onSignOut,
  otherAudiences,
  pathname,
}: {
  audience: NavAudience;
  email: string;
  id: string;
  items: NavItem[];
  live: WorkspaceLive | null;
  onClose: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  onSignOut: () => Promise<void>;
  otherAudiences: { audience: NavAudience; href: string; label: string }[];
  pathname: string;
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
              className="flex min-h-14 items-center gap-3 rounded-control bg-tapit-soft-surface px-4 text-sm font-semibold text-tapit-ink"
              href={item.href}
              key={item.href}
              aria-current={isNavItemActive(item, pathname) ? "page" : undefined}
              onClick={(event) => {
                onNavigate(event, item.href);
                onClose();
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
                onClose();
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
      </div>
    </div>
  );
}
