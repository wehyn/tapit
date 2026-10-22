"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { MouseEvent } from "react";

import { api } from "../../../convex/_generated/api";
import { isActiveAccess } from "@/lib/auth/access";
import { isLocalDemoMode } from "@/lib/demo/mode";
import type { DemoState } from "@/lib/demo/fixtures";
import {
  resolveDemoSessionAccess,
  useDemoSession,
  useHydratedDemoState,
  type DemoSession,
} from "@/lib/demo/store";

type PublicIdentity =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "customer" }
  | { kind: "admin" }
  | { kind: "pending" }
  | { kind: "restricted"; reason: "invitation" | "inactive" };

type Placement = "header" | "hero" | "closing" | "account";

type PublicAccountActionProps =
  | { placement: Exclude<Placement, "account"> }
  | { placement: "account"; hideWhenPrimaryVisible: boolean };

type ActionHref =
  | "/login?mode=signup"
  | "/login"
  | "/login?reason=invitation-required"
  | "/login?reason=account-inactive"
  | "/app/profile"
  | "/admin/customers"
  | "/onboarding";

type ActionLabel =
  | "Create your profile"
  | "Go to your profile"
  | "Profile"
  | "Dashboard"
  | "Finish your profile"
  | "Finish profile"
  | "Sign in";

type PublicAction =
  | { kind: "link"; href: ActionHref; label: ActionLabel }
  | { kind: "loading"; href: "/login?mode=signup"; label: "Create your profile" }
  | { kind: "hidden" };

type CurrentAccess = FunctionReturnType<typeof api.admin.currentAccess>;

const primaryActions = {
  guest: { kind: "link", href: "/login?mode=signup", label: "Create your profile" },
  customer: { kind: "link", href: "/app/profile", label: "Go to your profile" },
  admin: { kind: "link", href: "/admin/customers", label: "Dashboard" },
  pending: { kind: "link", href: "/onboarding", label: "Finish your profile" },
} as const satisfies Record<"guest" | "customer" | "admin" | "pending", PublicAction>;

function identityFromDemo(
  hydrated: boolean,
  state: DemoState,
  session: DemoSession | null,
): PublicIdentity {
  if (!hydrated) return { kind: "loading" };
  const access = resolveDemoSessionAccess(state, session);
  if (access.kind === "guest") return { kind: "guest" };
  if (access.kind === "restricted") return access;
  return access.account.role === "customer" ? { kind: "customer" } : { kind: "admin" };
}

function identityFromLive(
  authLoading: boolean,
  isAuthenticated: boolean,
  access: CurrentAccess | undefined,
): PublicIdentity {
  if (authLoading) return { kind: "loading" };
  if (!isAuthenticated) return { kind: "guest" };
  if (access === undefined) return { kind: "loading" };
  if (access.accountStatus === "pending") return { kind: "pending" };
  if (isActiveAccess(access)) {
    if (access.role === "customer") {
      return access.profileId === null
        ? { kind: "restricted", reason: "inactive" }
        : { kind: "customer" };
    }
    if (access.role === "admin") return { kind: "admin" };
  }
  return {
    kind: "restricted",
    reason: access.accountStatus === "invited" ? "invitation" : "inactive",
  };
}

function restrictedAction(reason: "invitation" | "inactive"): PublicAction {
  return {
    kind: "link",
    href:
      reason === "invitation"
        ? "/login?reason=invitation-required"
        : "/login?reason=account-inactive",
    label: "Sign in",
  };
}

function resolvePublicAction(
  identity: PublicIdentity,
  props: PublicAccountActionProps,
): PublicAction {
  if (props.placement === "account") {
    if (props.hideWhenPrimaryVisible && identity.kind !== "loading" && identity.kind !== "guest") {
      return { kind: "hidden" };
    }

    switch (identity.kind) {
      case "loading":
      case "guest":
        return { kind: "link", href: "/login", label: "Sign in" };
      case "customer":
        return { kind: "link", href: "/app/profile", label: "Profile" };
      case "admin":
        return primaryActions.admin;
      case "pending":
        return { kind: "link", href: "/onboarding", label: "Finish profile" };
      case "restricted":
        return restrictedAction(identity.reason);
      default: {
        const exhaustive: never = identity;
        return exhaustive;
      }
    }
  }

  switch (identity.kind) {
    case "loading":
      return { kind: "loading", href: "/login?mode=signup", label: "Create your profile" };
    case "guest":
      return primaryActions.guest;
    case "customer":
      return primaryActions.customer;
    case "admin":
      return primaryActions.admin;
    case "pending":
      return primaryActions.pending;
    case "restricted":
      return restrictedAction(identity.reason);
    default: {
      const exhaustive: never = identity;
      return exhaustive;
    }
  }
}

function classNameForPlacement(placement: Placement): string {
  if (placement === "account") {
    return "inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink";
  }
  if (placement === "header") {
    return "inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-tapit-accent-strong";
  }
  return "inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-tapit-accent px-6 text-base font-semibold text-white transition-colors hover:bg-tapit-accent-strong";
}

function visibleLabel(placement: Placement, label: ActionLabel) {
  if (placement !== "header") return label;
  if (label === "Create your profile") {
    return (
      <>
        <span className="sm:hidden">Create profile</span>
        <span className="hidden sm:inline">Create your profile</span>
      </>
    );
  }
  if (label === "Go to your profile") {
    return (
      <>
        <span className="sm:hidden">Profile</span>
        <span className="hidden sm:inline">Go to your profile</span>
      </>
    );
  }
  return label;
}

function PublicAccountActionLink({
  action,
  placement,
}: {
  action: Exclude<PublicAction, { kind: "hidden" }>;
  placement: Placement;
}) {
  const loading = action.kind === "loading";

  return (
    <Link
      aria-busy={loading}
      aria-label={action.label}
      className={classNameForPlacement(placement)}
      href={action.href}
      onClick={
        loading ? (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault() : undefined
      }
    >
      {visibleLabel(placement, action.label)}
    </Link>
  );
}

function PublicAccountActionForIdentity({
  identity,
  placement,
  hideWhenPrimaryVisible,
}: {
  identity: PublicIdentity;
  placement: Placement;
  hideWhenPrimaryVisible: boolean;
}) {
  const props: PublicAccountActionProps =
    placement === "account" ? { placement, hideWhenPrimaryVisible } : { placement };
  const action = resolvePublicAction(identity, props);
  if (action.kind === "hidden") return null;
  return <PublicAccountActionLink action={action} placement={placement} />;
}

function DemoPublicAccountAction(props: PublicAccountActionProps) {
  const { hydrated, state } = useHydratedDemoState();
  const session = useDemoSession();
  return (
    <PublicAccountActionForIdentity
      hideWhenPrimaryVisible={props.placement === "account" && props.hideWhenPrimaryVisible}
      identity={identityFromDemo(hydrated, state, session)}
      placement={props.placement}
    />
  );
}

function LivePublicAccountAction(props: PublicAccountActionProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  return (
    <PublicAccountActionForIdentity
      hideWhenPrimaryVisible={props.placement === "account" && props.hideWhenPrimaryVisible}
      identity={identityFromLive(isLoading, isAuthenticated, access)}
      placement={props.placement}
    />
  );
}

export function PublicAccountAction(props: PublicAccountActionProps) {
  return isLocalDemoMode() ? (
    <DemoPublicAccountAction {...props} />
  ) : (
    <LivePublicAccountAction {...props} />
  );
}
