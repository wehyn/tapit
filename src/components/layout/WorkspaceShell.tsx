"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import {
  clearDemoSession,
  resolveDemoSessionAccess,
  useDemoSession,
  useDemoState,
} from "@/lib/demo/store";
import { resetCurrentDemoAccountData } from "@/lib/demo/card-order-assets";
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
  const account = session && state.customers.find((customer) => customer.email === session.email);
  const demoResetInProgress = account?.isDemo === true && account.demoResetInProgress === true;
  const demoOnboardingPending = account?.isDemo === true && account.demoOnboardingPending === true;
  const recoveryPath =
    access.kind === "restricted" && !demoResetInProgress && !demoOnboardingPending
      ? access.reason === "invitation"
        ? "/login?reason=invitation-required"
        : "/login?reason=account-inactive"
      : null;
  const draftSave = useDraftSave();
  const signingOut = useRef(false);
  const [sessionError, setSessionError] = useState("");
  const [resetError, setResetError] = useState("");
  const [resumingDemoReset, setResumingDemoReset] = useState(false);
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
  const hasCardOwnerFeatures = access.kind === "active" && access.hasCardOwnerFeatures;
  const hasAudienceAccess =
    access.kind === "active" && (audience === "admin" ? isAdminAccount : access.profile !== null);
  const adminRedirect =
    audience === "admin" && access.kind === "active" && !isAdminAccount ? "/app/profile" : null;

  useEffect(() => {
    if (!hydrated || signingOut.current) return;
    if (accessKind === "guest") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (demoResetInProgress) return;
    else if (demoOnboardingPending && !resumingDemoReset) router.replace("/onboarding");
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
    demoOnboardingPending,
    demoResetInProgress,
    hasProfileAccess,
    hydrated,
    pathname,
    recoveryPath,
    resumingDemoReset,
    router,
    sessionError,
  ]);

  if (!hydrated || !hasAudienceAccess || access.kind !== "active") {
    if (demoResetInProgress) {
      return (
        <div className="grid min-h-dvh place-items-center bg-tapit-paper px-4 sm:px-8">
          <div className="w-full max-w-md rounded-card bg-tapit-surface p-6 shadow-card">
            <h1 className="text-lg font-semibold text-tapit-ink">Resume Demo account reset</h1>
            <p className="mt-2 text-sm text-tapit-muted">
              Your Demo account reset did not finish. Resume it to continue to onboarding.
            </p>
            {resetError ? (
              <p className="mt-4 text-sm text-tapit-danger" role="alert">
                {resetError}
              </p>
            ) : null}
            <Button
              className="mt-6 w-full"
              loading={resumingDemoReset}
              onClick={() => {
                setResetError("");
                setResumingDemoReset(true);
                void resetCurrentDemoAccountData()
                  .then(() => router.replace("/onboarding"))
                  .catch((cause: unknown) => {
                    setResetError(
                      cause instanceof Error
                        ? cause.message
                        : "Demo account reset could not be completed. Try again.",
                    );
                    setResumingDemoReset(false);
                  });
              }}
              type="button"
            >
              Resume reset
            </Button>
          </div>
        </div>
      );
    }
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
      hasCardOwnerFeatures={hasCardOwnerFeatures}
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
      {!hasCardOwnerFeatures && (pathname === "/app/analytics" || pathname === "/app/card") ? (
        <CardOwnerAccessNotice />
      ) : (
        children
      )}
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
  const hasCardOwnerFeatures = activeAccess && access.hasCardOwnerFeatures === true;
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
      hasCardOwnerFeatures={hasCardOwnerFeatures}
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
      {!hasCardOwnerFeatures && (pathname === "/app/analytics" || pathname === "/app/card") ? (
        <CardOwnerAccessNotice />
      ) : (
        children
      )}
    </WorkspaceChrome>
  );
}

function CardOwnerAccessNotice() {
  return (
    <section
      aria-labelledby="card-owner-access-heading"
      className="max-w-2xl rounded-card bg-tapit-surface p-6 shadow-card"
    >
      <h1 className="text-xl font-semibold text-tapit-ink" id="card-owner-access-heading">
        Claim a card to unlock owner tools
      </h1>
      <p className="mt-3 text-sm text-tapit-muted">
        Order a card, then scan or open its URL and enter the one-time claim code to unlock
        analytics and card-owner tools.
      </p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
        href="/app/card/order-card"
      >
        Order a card
      </Link>
    </section>
  );
}
