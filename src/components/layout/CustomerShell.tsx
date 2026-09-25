"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { AppShell } from "./AppShell";
import { DraftSaveProvider, useDraftSave } from "./DraftSaveContext";
import type { ShellNavGroup } from "./navigation";
import { Button } from "../ui/Button";
import { clearDemoSession, useDemoSession, useDemoState } from "@/lib/demo/store";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { isActiveAccess } from "@/lib/auth/access";
import { AuthLoadingState } from "@/components/auth/AuthLoadingState";
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
    return <AuthLoadingState />;

  return (
    <AppShell
      beforeNavigate={beforeNavigate}
      eyebrow=""
      navGroups={customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <div className="space-y-3">
          <p className="px-1 text-sm text-tapit-muted">{customer.email}</p>
          <Button
            onClick={() => {
              signingOut.current = true;
              clearDemoSession();
              router.replace("/login");
            }}
            variant="quiet"
            type="button"
          >
            Sign out
          </Button>
        </div>
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
  const beforeNavigate = useCallback(() => draftSave(), [draftSave]);

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
      navGroups={customerNavGroups}
      showPageIntro={false}
      sidebarFooter={
        <div className="space-y-3">
          <Button
            onClick={() => {
              void signOut().finally(() => router.replace("/login"));
            }}
            variant="quiet"
            type="button"
          >
            Sign out
          </Button>
        </div>
      }
      title="Your Tapit profile"
    >
      {children}
    </AppShell>
  );
}
