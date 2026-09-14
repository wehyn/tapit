"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { AppShell, type ShellNavItem } from "./AppShell";
import { Button } from "../ui/Button";
import { clearDemoSession, useDemoSession, useDemoState } from "@/lib/demo/store";

const customerNav: ShellNavItem[] = [
  { href: "/app/profile", label: "Profile" },
  { href: "/app/links", label: "Links" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/account", label: "Account" },
];

const noHydrationSubscription = () => () => {};
const clientHydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useDemoSession();
  const state = useDemoState();
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
    <AppShell eyebrow="Customer workspace" navItems={customerNav} title="Your Tapit profile">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 pb-2 pt-5 sm:px-8">
        <p className="text-sm text-tapit-muted">
          Signed in as <strong className="text-tapit-ink">{session.email}</strong>
        </p>
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
      {children}
    </AppShell>
  );
}
