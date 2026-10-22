"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

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

import { DraftSaveProvider, useDraftSave, type DraftSaveOutcome } from "./DraftSaveContext";
import { WorkspaceChrome, type WorkspaceLive } from "./WorkspaceNav";
import type { NavAudience } from "./navigation";
import { Button } from "../ui/Button";

const noHydrationSubscription = () => () => {};
const clientHydratedSnapshot = () => true;
const serverHydratedSnapshot = () => false;

const isDemoMode = isLocalDemoMode();

function signOutSaveFailureMessage(outcome: Exclude<DraftSaveOutcome, { kind: "saved" }>): string {
  return outcome.kind === "deferred" && outcome.reason === "pending-save"
    ? "Your draft is still saving. Try signing out again when it finishes. You are still signed in."
    : "Your draft could not be saved. You are still signed in.";
}

export function WorkspaceShell({
  audience,
  children,
}: {
  audience: NavAudience;
  children: ReactNode;
}) {
  return (
    <DraftSaveProvider>
      {isDemoMode ? (
        <DemoWorkspaceShell audience={audience}>{children}</DemoWorkspaceShell>
      ) : (
        <LiveWorkspaceShell audience={audience}>{children}</LiveWorkspaceShell>
      )}
    </DraftSaveProvider>
  );
}

function DemoWorkspaceShell({
  audience,
  children,
}: {
  audience: NavAudience;
  children: ReactNode;
}) {
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
  const isAdminAccount = access.kind === "active" && access.account.role === "admin";
  const hasAudienceAccess =
    access.kind === "active" && (audience === "admin" ? isAdminAccount : access.profile !== null);
  const adminRedirect =
    audience === "admin" && access.kind === "active" && !isAdminAccount ? "/app/profile" : null;

  useEffect(() => {
    if (!hydrated || signingOut.current) return;
    if (accessKind === "guest") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (audience === "admin") {
      if (accessKind === "restricted" && recoveryPath !== null) router.replace(recoveryPath);
      else if (adminRedirect !== null) router.replace(adminRedirect);
    } else if (!hasProfileAccess && !sessionError) {
      signingOut.current = recoveryPath !== null;
      if (!clearDemoSession()) {
        signingOut.current = false;
        queueMicrotask(() => setSessionError("Could not clear the saved demo session. Try again."));
      } else if (recoveryPath !== null) router.replace(recoveryPath);
    }
  }, [
    accessKind,
    adminRedirect,
    audience,
    hasProfileAccess,
    hydrated,
    pathname,
    recoveryPath,
    router,
    sessionError,
  ]);

  if (!hydrated || !hasAudienceAccess || access.kind !== "active") {
    if (sessionError) {
      return (
        <div className="grid min-h-dvh place-items-center bg-tapit-paper px-4 sm:px-8">
          <div className="w-full max-w-md rounded-card bg-tapit-surface p-6 shadow-card">
            <p className="text-sm text-tapit-danger" role="alert">
              {sessionError}
            </p>
            <Button className="mt-6" onClick={clearInvalidSession} type="button" variant="quiet">
              Return to sign in
            </Button>
          </div>
        </div>
      );
    }
    return <AuthLoadingState />;
  }

  const live: WorkspaceLive | null =
    audience === "customer" && access.profile !== null
      ? {
          slug: access.profile.draft.slug,
          published: access.profile.status === "published",
        }
      : null;

  return (
    <WorkspaceChrome
      audience={audience}
      beforeNavigate={beforeNavigate}
      email={access.account.email}
      live={live}
      onSignOut={async () => {
        const outcome = await draftSave();
        if (outcome.kind !== "saved") throw new Error(signOutSaveFailureMessage(outcome));
        if (!clearDemoSession()) {
          throw new Error(
            audience === "admin"
              ? "Could not sign out. Try again."
              : "Could not end the session. You are still signed in.",
          );
        }
        signingOut.current = true;
        router.replace("/login");
      }}
      showAudienceSwitch={isAdminAccount}
    >
      {children}
    </WorkspaceChrome>
  );
}

function LiveWorkspaceShell({
  audience,
  children,
}: {
  audience: NavAudience;
  children: ReactNode;
}) {
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
  const ownsProfile = audience === "customer" && activeAccess && access?.profileId != null;
  const profile = useQuery(api.profiles.mine, ownsProfile ? {} : "skip");

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
    } else if (audience === "admin") {
      if (access.role !== "admin") {
        router.replace(access.role === "customer" ? "/app/profile" : "/login");
      }
    } else if (access.profileId === null) {
      router.replace("/login?reason=account-inactive");
    }
  }, [access, activeAccess, audience, authLoading, isAuthenticated, pathname, router]);

  if (
    authLoading ||
    (isAuthenticated && access === undefined) ||
    !isAuthenticated ||
    !activeAccess ||
    (audience === "admin"
      ? access.role !== "admin"
      : (access.role !== "customer" && access.role !== "admin") || access.profileId === null)
  ) {
    return <AuthLoadingState />;
  }

  const live: WorkspaceLive | null =
    audience === "customer" && profile
      ? { slug: profile.draft.slug, published: profile.status === "published" }
      : null;

  return (
    <WorkspaceChrome
      audience={audience}
      beforeNavigate={beforeNavigate}
      email={access.email ?? (audience === "admin" ? "Administrator" : "Account")}
      live={live}
      onSignOut={async () => {
        const outcome = await draftSave();
        if (outcome.kind !== "saved") throw new Error(signOutSaveFailureMessage(outcome));
        await signOut();
        router.replace("/login");
      }}
      showAudienceSwitch={access.role === "admin"}
    >
      {children}
    </WorkspaceChrome>
  );
}
