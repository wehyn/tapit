"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { AppShell } from "./AppShell";
import { DraftSaveProvider, useDraftSave, type DraftSaveOutcome } from "./DraftSaveContext";
import type { ShellNavGroup } from "./navigation";
import { Button } from "../ui/Button";
import {
  clearDemoSession,
  resolveDemoSessionAccess,
  useDemoSession,
  useDemoState,
} from "@/lib/demo/store";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { isActiveAccess } from "@/lib/auth/access";
import { AuthLoadingState } from "@/components/auth/AuthLoadingState";
import { api } from "../../../convex/_generated/api";

const customerNavGroups: ShellNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/app/profile", label: "Profile", icon: "user" },
      { href: "/app/customize", label: "Customize", icon: "fingerprint" },
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

const adminNavGroupsForCustomer: ShellNavGroup[] = adminNavGroups;

const noHydrationSubscription = () => () => {};
const clientHydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

const isDemoMode = isLocalDemoMode();

function signOutSaveFailureMessage(outcome: Exclude<DraftSaveOutcome, { kind: "saved" }>): string {
  return outcome.kind === "deferred" && outcome.reason === "pending-save"
    ? "Your draft is still saving. Try signing out again when it finishes. You are still signed in."
    : "Your draft could not be saved. You are still signed in.";
}

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
  const access = resolveDemoSessionAccess(state, session);
  const recoveryPath =
    access.kind === "restricted"
      ? access.reason === "invitation"
        ? "/login?reason=invitation-required"
        : "/login?reason=account-inactive"
      : null;
  const draftSave = useDraftSave();
  const signingOut = useRef(false);
  const [sessionError, setSessionError] = useState("");
  const beforeNavigate = useCallback(
    async (href: string) => (await draftSave(href)).kind === "saved",
    [draftSave],
  );
  const clearInvalidSession = useCallback(() => {
    signingOut.current = recoveryPath !== null;
    if (!clearDemoSession()) {
      signingOut.current = false;
      setSessionError("Could not clear the saved demo session. Try again.");
      return;
    }
    router.replace(recoveryPath ?? `/login?next=${encodeURIComponent(pathname)}`);
  }, [pathname, recoveryPath, router]);
  const hydrated = useSyncExternalStore(
    noHydrationSubscription,
    clientHydratedSnapshot,
    serverHydratedSnapshot,
  );
  const accessKind = access.kind;
  const hasProfileAccess = access.kind === "active" && access.profile !== null;

  useEffect(() => {
    if (!hydrated || signingOut.current) return;
    if (accessKind === "guest") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!hasProfileAccess && !sessionError) {
      signingOut.current = recoveryPath !== null;
      if (!clearDemoSession()) {
        signingOut.current = false;
        queueMicrotask(() => setSessionError("Could not clear the saved demo session. Try again."));
      } else if (recoveryPath !== null) router.replace(recoveryPath);
    }
  }, [accessKind, hasProfileAccess, hydrated, pathname, recoveryPath, router, sessionError]);

  if (!hydrated || access.kind !== "active" || access.profile === null) {
    if (sessionError) {
      return (
        <div className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5">
          <div className="w-full max-w-md rounded-tapit border border-tapit-line bg-tapit-surface p-6 sm:p-8">
            <p className="text-sm text-tapit-danger" role="alert">
              {sessionError}
            </p>
            <Button className="mt-5" onClick={clearInvalidSession} type="button" variant="quiet">
              Return to sign in
            </Button>
          </div>
        </div>
      );
    }
    return <AuthLoadingState />;
  }

  return (
    <AppShell
      beforeNavigate={beforeNavigate}
      eyebrow=""
      navGroups={access.account.role === "admin" ? adminNavGroupsForCustomer : customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <CustomerAccountMenu
          email={access.account.email}
          onSignOut={async () => {
            const outcome = await draftSave();
            if (outcome.kind !== "saved") throw new Error(signOutSaveFailureMessage(outcome));
            if (!clearDemoSession()) {
              throw new Error("Could not end the session. You are still signed in.");
            }
            signingOut.current = true;
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
  const activeAccess = isActiveAccess(access);
  const draftSave = useDraftSave();
  const beforeNavigate = useCallback(
    async (href: string) => (await draftSave(href)).kind === "saved",
    [draftSave],
  );

  useEffect(() => {
    if (authLoading || (isAuthenticated && access === undefined)) return;
    if (access?.accountStatus === "pending") {
      router.replace("/onboarding");
    } else if (access?.accountStatus === "invited") {
      router.replace("/login?reason=invitation-required");
    } else if (access?.accountStatus === "deleted" || access?.accountStatus === "unprovisioned") {
      router.replace("/login?reason=account-inactive");
    } else if (!isAuthenticated || !activeAccess) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (access.profileId === null) {
      router.replace("/login?reason=account-inactive");
    }
  }, [access, activeAccess, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    !activeAccess ||
    (access.role !== "customer" && access.role !== "admin") ||
    access.profileId === null
  ) {
    return <AuthLoadingState />;
  }

  return (
    <AppShell
      beforeNavigate={beforeNavigate}
      eyebrow=""
      navGroups={access.role === "admin" ? adminNavGroupsForCustomer : customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <CustomerAccountMenu
          email={access.email ?? "Account"}
          onSignOut={async () => {
            const outcome = await draftSave();
            if (outcome.kind !== "saved") throw new Error(signOutSaveFailureMessage(outcome));
            await signOut();
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

function CustomerAccountMenu({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [signOutPending, setSignOutPending] = useState(false);
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

  async function signOut() {
    if (signOutPending) return;
    setSignOutError("");
    setSignOutPending(true);
    try {
      await onSignOut();
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Could not sign out. Try again.");
    } finally {
      setSignOutPending(false);
    }
  }

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
          disabled={signOutPending}
          onClick={() => void signOut()}
          style={{ color: "var(--tapit-danger)" }}
          type="button"
          variant="quiet"
        >
          Sign out
        </Button>
        {signOutError ? (
          <p className="px-3 py-2 text-sm text-tapit-danger" role="alert">
            {signOutError}
          </p>
        ) : null}
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
