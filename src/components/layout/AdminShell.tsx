"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { clearDemoSession, useDemoSession } from "@/lib/demo/store";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { api } from "../../../convex/_generated/api";

import { AppShell, type ShellNavItem } from "./AppShell";
import { Button } from "../ui/Button";

const adminNav: ShellNavItem[] = [
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/profiles", label: "Profiles" },
  { href: "/admin/cards", label: "Cards" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/settings", label: "Settings" },
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
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
  }

  return (
    <AppShell eyebrow="Administrator console" navItems={adminNav} title="Tapit operations">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-5 sm:px-8">
        <p className="text-sm text-tapit-muted">
          Signed in as <strong className="text-tapit-ink">{session.email}</strong>
        </p>
        <Button
          onClick={() => {
            clearDemoSession();
            router.replace("/login");
          }}
          type="button"
          variant="quiet"
        >
          Sign out
        </Button>
      </div>
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

  useEffect(() => {
    if (authLoading || (isAuthenticated && access === undefined)) return;
    if (!isAuthenticated || access?.authenticated !== true) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (access.role !== "admin") {
      router.replace(access.role === "customer" ? "/app/profile" : "/login");
    }
  }, [access, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    access?.authenticated !== true ||
    access.role !== "admin"
  ) {
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
  }

  return (
    <AppShell eyebrow="Administrator console" navItems={adminNav} title="Tapit operations">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 pb-2 pt-5 sm:px-8">
        <p className="text-sm text-tapit-muted">Administrator workspace</p>
        <Button
          onClick={() => {
            void signOut().finally(() => router.replace("/login"));
          }}
          type="button"
          variant="quiet"
        >
          Sign out
        </Button>
      </div>
      {children}
    </AppShell>
  );
}
