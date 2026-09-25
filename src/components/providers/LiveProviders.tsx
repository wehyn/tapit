"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexAuthProvider, useConvexAuth } from "@convex-dev/auth/react";
import { ConvexReactClient, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Suspense, type ReactNode } from "react";

import { api } from "../../../convex/_generated/api";
import { AuthLoadingState } from "@/components/auth/AuthLoadingState";
import { isHostedDemoMode } from "@/lib/demo/mode";
import { isActiveAccess } from "@/lib/auth/access";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;
const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;
export function LiveProviders({ children }: { children: ReactNode }) {
  if (convex === null) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in live mode.");
  }
  const authProvider = isHostedDemoMode() ? (
    <ConvexAuthProvider client={convex}>
      <Suspense fallback={<AuthLoadingState />}>
        <AuthBoundary>{children}</AuthBoundary>
      </Suspense>
    </ConvexAuthProvider>
  ) : (
    <ConvexAuthNextjsProvider client={convex}>
      <Suspense fallback={<AuthLoadingState />}>
        <AuthBoundary>{children}</AuthBoundary>
      </Suspense>
    </ConvexAuthNextjsProvider>
  );
  return authProvider;
}

function AuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
  const isProtectedPage =
    pathname.startsWith("/app") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/onboarding");
  const isSetupPage = pathname.startsWith("/setup/");
  const accessLoading = isAuthenticated && access === undefined;
  const activeAccess = isActiveAccess(access);
  let redirectPath: string | null = null;

  if (!authLoading && !accessLoading) {
    if (isProtectedPage && !isAuthenticated) {
      redirectPath = `/login?next=${encodeURIComponent(pathname)}`;
    } else if (!isAuthenticated || isSetupPage) {
      redirectPath = null;
    } else if (access?.accountStatus === "pending") {
      redirectPath = pathname === "/onboarding" ? null : "/onboarding";
    } else if (access?.accountStatus === "invited") {
      redirectPath = pathname === "/login" ? null : "/login?reason=invitation-required";
    } else if (access?.accountStatus === "deleted" || access?.accountStatus === "unprovisioned") {
      redirectPath = pathname === "/login" ? null : "/login?reason=account-inactive";
    } else if (isProtectedPage && !activeAccess) {
      redirectPath = `/login?next=${encodeURIComponent(pathname)}`;
    } else if (isProtectedPage) {
      if (pathname.startsWith("/admin") && access?.role !== "admin") {
        redirectPath = "/app/profile";
      } else if (
        pathname.startsWith("/app") &&
        ((access?.role !== "customer" && access?.role !== "admin") || access.profileId === null)
      ) {
        redirectPath = "/login?reason=account-inactive";
      }
    } else if (pathname === "/login" && activeAccess) {
      redirectPath =
        access.role === "admin" ? "/admin" : access.profileId === null ? null : "/app/profile";
    }
  }

  useEffect(() => {
    if (redirectPath !== null) router.replace(redirectPath);
  }, [redirectPath, router]);

  if (!hydrated || authLoading || accessLoading) {
    return <AuthLoadingState />;
  }

  if (redirectPath !== null) {
    return <AuthLoadingState />;
  }

  return children;
}
