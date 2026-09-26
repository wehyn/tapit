"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { SignOutIcon } from "@phosphor-icons/react";

import { clearDemoSession, useDemoSession } from "@/lib/demo/store";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { isActiveAccess } from "@/lib/auth/access";
import { AuthLoadingState } from "@/components/auth/AuthLoadingState";
import { api } from "../../../convex/_generated/api";

import { AppShell } from "./AppShell";
import type { ShellNavGroup } from "./navigation";
import { Button } from "../ui/Button";

const adminNavGroups: ShellNavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/admin/customers", label: "Customers", icon: "users" },
      { href: "/admin/profiles", label: "Profiles", icon: "profiles" },
      { href: "/admin/cards", label: "Cards", icon: "card" },
      { href: "/admin/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    label: "Governance",
    items: [
      { href: "/admin/audit-log", label: "Audit log", icon: "audit" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
  {
    label: "Personal",
    items: [{ href: "/app/profile", label: "My profile", icon: "user" }],
  },
];

const noHydrationSubscription = () => () => {};
const clientHydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

const isDemoMode = isLocalDemoMode();

export function AdminShell({ children }: { children: React.ReactNode }) {
  return isDemoMode ? (
    <DemoAdminShell>{children}</DemoAdminShell>
  ) : (
    <LiveAdminShell>{children}</LiveAdminShell>
  );
}

function DemoAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useDemoSession();
  const hydrated = useSyncExternalStore(
    noHydrationSubscription,
    clientHydratedSnapshot,
    serverHydratedSnapshot,
  );

  useEffect(() => {
    if (!hydrated) return;
    if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (session.role !== "admin") router.replace("/app/profile");
  }, [hydrated, pathname, router, session]);

  if (!hydrated || session === null || session.role !== "admin") {
    return <AuthLoadingState />;
  }

  return (
    <AppShell
      eyebrow=""
      navGroups={adminNavGroups}
      pageTitle="Administrator workspace"
      showPageIntro={false}
      sidebarFooter={
        <div className="space-y-3">
          <p className="px-1 text-sm text-tapit-muted lg:sr-only xl:not-sr-only">
            Signed in as <strong className="text-tapit-ink">{session.email}</strong>
          </p>
          <Button
            aria-label="Sign out"
            className="lg:!px-2 xl:!px-4"
            onClick={() => {
              clearDemoSession();
              router.replace("/login");
            }}
            type="button"
            variant="quiet"
          >
            <SignOutIcon aria-hidden="true" className="hidden lg:block xl:hidden" size={20} />
            <span className="lg:sr-only xl:not-sr-only">Sign out</span>
          </Button>
        </div>
      }
      title="Tapit operations"
    >
      {children}
    </AppShell>
  );
}

function LiveAdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const activeAccess = isActiveAccess(access);

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
    } else if (access.role !== "admin") {
      router.replace(access.role === "customer" ? "/app/profile" : "/login");
    }
  }, [access, activeAccess, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    !activeAccess ||
    access.role !== "admin"
  ) {
    return <AuthLoadingState />;
  }

  return (
    <AppShell
      eyebrow=""
      navGroups={adminNavGroups}
      pageTitle="Administrator workspace"
      showPageIntro={false}
      sidebarFooter={
        <div className="space-y-3">
          <p className="px-1 text-sm text-tapit-muted lg:sr-only xl:not-sr-only">
            Administrator workspace
          </p>
          <Button
            aria-label="Sign out"
            className="lg:!px-2 xl:!px-4"
            onClick={() => {
              void signOut().finally(() => router.replace("/login"));
            }}
            type="button"
            variant="quiet"
          >
            <SignOutIcon aria-hidden="true" className="hidden lg:block xl:hidden" size={20} />
            <span className="lg:sr-only xl:not-sr-only">Sign out</span>
          </Button>
        </div>
      }
      title="Tapit operations"
    >
      {children}
    </AppShell>
  );
}
