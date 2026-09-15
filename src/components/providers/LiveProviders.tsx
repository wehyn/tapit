"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { useConvexAuth } from "@convex-dev/auth/react";
import { ConvexReactClient, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { api } from "../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function LiveProviders({ children }: { children: ReactNode }) {
  if (convex === null) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in live mode.");
  }
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <AuthBoundary>{children}</AuthBoundary>
    </ConvexAuthNextjsProvider>
  );
}

function AuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess);
  const isProtectedPage = pathname.startsWith("/app") || pathname.startsWith("/admin");
  const accessLoading = isAuthenticated && access === undefined;
  let redirectPath: string | null = null;

  if (!authLoading && !accessLoading) {
    if (isProtectedPage && !isAuthenticated) {
      redirectPath = `/login?next=${encodeURIComponent(pathname)}`;
    } else if (isProtectedPage && access?.authenticated !== true) {
      redirectPath = "/login";
    } else if (isProtectedPage) {
      const requiredRole = pathname.startsWith("/admin") ? "admin" : "customer";
      if (access?.role !== requiredRole) {
        redirectPath = access?.role === "admin" ? "/admin/customers" : "/app/profile";
      }
    } else if (pathname === "/login" && access?.authenticated === true) {
      redirectPath = access.role === "admin" ? "/admin/customers" : "/app/profile";
    }
  }

  useEffect(() => {
    if (redirectPath !== null) router.replace(redirectPath);
  }, [redirectPath, router]);

  if (authLoading || accessLoading) {
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
  }

  if (redirectPath !== null) {
    return <div className="min-h-[100dvh] bg-tapit-paper" />;
  }

  return children;
}
