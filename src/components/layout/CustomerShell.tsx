"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { AppShell } from "./AppShell";
import { DraftSaveProvider, useDraftSave } from "./DraftSaveContext";
import type { ShellNavGroup } from "./navigation";
import { Button } from "../ui/Button";
import { clearDemoSession, useDemoSession, useDemoState } from "@/lib/demo/store";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { api } from "../../../convex/_generated/api";

const customerNavGroups: ShellNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app/profile", label: "Profile", icon: "user" },
      { href: "/app/links", label: "Links", icon: "link" },
      { href: "/app/account/build-card", label: "Build card", icon: "card" },
      { href: "/app/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    label: "Personal",
    items: [{ href: "/app/account", label: "Account", icon: "gear" }],
  },
];
const adminNavGroups: ShellNavGroup[] = [
  ...customerNavGroups,
  {
    label: "Administration",
    items: [{ href: "/admin/customers", label: "Admin workspace", icon: "users" }],
  },
];

const noHydrationSubscription = () => () => {};
const clientHydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

const isDemoMode = isLocalDemoMode();

export function CustomerShell({ children }: { children: React.ReactNode }) {
  return (
    <DraftSaveProvider>
      {isDemoMode ? (
        <DemoCustomerShell>{children}</DemoCustomerShell>
      ) : (
        <LiveCustomerShell>{children}</LiveCustomerShell>
      )}
    </DraftSaveProvider>
  );
}

function DemoCustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useDemoSession();
  const state = useDemoState();
  const draftSave = useDraftSave();
  const signingOut = useRef(false);
  const beforeNavigate = useCallback(() => draftSave(), [draftSave]);
  const hydrated = useSyncExternalStore(
    noHydrationSubscription,
    clientHydratedSnapshot,
    serverHydratedSnapshot,
  );

  useEffect(() => {
    if (!hydrated || signingOut.current) return;
    if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else {
      const customer = state.customers.find((candidate) => candidate.email === session.email);
      const profile = state.profiles.find((candidate) => candidate.id === customer?.profileId);
      if (
        customer === undefined ||
        profile?.ownerId !== customer.id ||
        customer.status !== "active" ||
        customer.deletionStatus !== "active"
      ) {
        clearDemoSession();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    }
  }, [hydrated, pathname, router, session, state.customers, state.profiles]);

  const customer =
    session !== null
      ? state.customers.find((candidate) => candidate.email === session.email)
      : undefined;
  const profile = state.profiles.find((candidate) => candidate.id === customer?.profileId);
  if (
    !hydrated ||
    session === null ||
    customer === undefined ||
    profile?.ownerId !== customer.id ||
    customer.status !== "active" ||
    customer.deletionStatus !== "active"
  )
    return <div className="min-h-[100dvh] bg-tapit-paper" />;

  return (
    <AppShell
      beforeNavigate={beforeNavigate}
      eyebrow=""
      navGroups={session.role === "admin" ? adminNavGroups : customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <CustomerAccountMenu
          email={customer.email}
          onSignOut={() => {
            signingOut.current = true;
            clearDemoSession();
            router.replace("/login");
          }}
        />
      }
      title="Your Tapit profile"
    >
      {children}
    </AppShell>
  );
}

function LiveCustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const draftSave = useDraftSave();
  const beforeNavigate = useCallback(() => draftSave(), [draftSave]);

  useEffect(() => {
    if (authLoading || (isAuthenticated && access === undefined)) return;
    if (access?.accountStatus === "pending") {
      router.replace("/onboarding");
    } else if (access?.accountStatus === "invited") {
      router.replace("/login?reason=invitation-required");
    } else if (access?.accountStatus === "deleted" || access?.accountStatus === "unprovisioned") {
      router.replace("/login?reason=account-inactive");
    } else if (!isAuthenticated || access?.authenticated !== true) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (access.profileId === null) {
      router.replace("/login?reason=account-inactive");
    }
  }, [access, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    access?.authenticated !== true ||
    access.accountStatus !== "active" ||
    (access.role !== "customer" && access.role !== "admin") ||
    access.profileId === null
  ) {
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
  }

  return (
    <AppShell
      beforeNavigate={beforeNavigate}
      eyebrow=""
      navGroups={access.role === "admin" ? adminNavGroups : customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <CustomerAccountMenu
          email={access.email ?? "Account"}
          onSignOut={() => {
            void signOut().finally(() => router.replace("/login"));
          }}
        />
      }
      title="Your Tapit profile"
    >
      {children}
    </AppShell>
  );
}

function CustomerAccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
        className="absolute bottom-full left-0 z-30 mb-3 min-w-56 rounded-tapit border border-tapit-line bg-tapit-surface p-2 shadow-lg lg:left-0 xl:inset-x-0 xl:min-w-0"
        hidden={!open}
        id={menuId}
        role="group"
      >
        <p className="break-words px-3 py-2 text-sm text-tapit-ink">{email}</p>
        <Button
          className="w-full justify-start hover:bg-red-50"
          onClick={onSignOut}
          style={{ color: "var(--tapit-danger)" }}
          type="button"
          variant="quiet"
        >
          Sign out
        </Button>
      </div>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
        className="flex min-h-12 w-full items-center gap-3 rounded-tapit px-1 text-left text-sm text-tapit-muted transition-colors hover:bg-tapit-paper hover:text-tapit-ink"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-tapit-accent text-[0.65rem] font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1 truncate lg:sr-only xl:not-sr-only">{email}</span>
        <span aria-hidden="true" className="px-1 text-base leading-none lg:hidden xl:inline">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
    </div>
  );
}
