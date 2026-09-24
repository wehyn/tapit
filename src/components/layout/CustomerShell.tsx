"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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
  const beforeNavigate = useCallback(() => draftSave(), [draftSave]);
  const hydrated = useSyncExternalStore(
    noHydrationSubscription,
    clientHydratedSnapshot,
    serverHydratedSnapshot,
  );

  useEffect(() => {
    if (!hydrated) return;
    if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (session.role !== "customer") router.replace("/admin/customers");
    else {
      const customer = state.customers.find((candidate) => candidate.email === session.email);
      if (
        customer === undefined ||
        customer.status !== "active" ||
        customer.deletionStatus !== "active"
      ) {
        clearDemoSession();
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    }
  }, [hydrated, pathname, router, session, state.customers]);

  const customer =
    session?.role === "customer"
      ? state.customers.find((candidate) => candidate.email === session.email)
      : undefined;
  if (
    !hydrated ||
    session === null ||
    session.role !== "customer" ||
    customer === undefined ||
    customer.status !== "active" ||
    customer.deletionStatus !== "active"
  )
    return <div className="min-h-[100dvh] bg-tapit-paper" />;

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
  const draftSave = useDraftSave();
  const beforeNavigate = useCallback(() => draftSave(), [draftSave]);

  useEffect(() => {
    if (authLoading || (isAuthenticated && access === undefined)) return;
    if (!isAuthenticated || access?.authenticated !== true) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (access.role !== "customer") {
      router.replace(access.role === "admin" ? "/admin/customers" : "/login");
    }
  }, [access, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    access?.authenticated !== true ||
    access.role !== "customer"
  ) {
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
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
