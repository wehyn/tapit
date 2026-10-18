"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { MouseEvent } from "react";

import { api } from "../../../convex/_generated/api";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession, useHydratedDemoState, type DemoSession } from "@/lib/demo/store";

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

function identityFromDemo(hydrated: boolean, session: DemoSession | null): PublicIdentity {
  if (!hydrated) return { kind: "loading" };
  if (session === null) return { kind: "guest" };
  if (session.role === "customer") return { kind: "customer" };
  if (session.role === "admin") return { kind: "admin" };
  return { kind: "restricted", reason: "inactive" };
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
  if (access.authenticated && access.accountStatus === "active") {
    if (access.role === "customer") return { kind: "customer" };
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
    return "inline-flex min-h-11 items-center text-sm font-semibold text-tapit-muted transition hover:text-tapit-ink";
  }
  if (placement === "header") {
    return "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-tapit-accent px-4 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(49,95,228,0.18)] transition-[color,background-color,border-color,box-shadow,translate,scale] duration-150 ease-out motion-safe:hover:-translate-y-px hover:bg-tapit-accent-strong focus-visible:outline-offset-4 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.96] sm:text-sm";
  }
  if (placement === "hero") {
    return "group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-tapit-accent px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(49,95,228,0.18)] transition-[color,background-color,border-color,box-shadow,translate,scale] duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:bg-tapit-accent-strong focus-visible:outline-offset-4 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.96] sm:px-6";
  }
  return "group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-tapit-accent transition-[color,background-color,border-color,box-shadow,translate,scale] duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:bg-[#e5f3eb] focus-visible:outline-offset-4 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.96] sm:px-6";
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
  const showArrow = placement === "hero" || placement === "closing";

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
      {showArrow ? (
        <ArrowRightIcon
          aria-hidden="true"
          className="transition-transform duration-150 motion-safe:group-hover:translate-x-1"
          size={18}
          weight="bold"
        />
      ) : null}
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
  const { hydrated } = useHydratedDemoState();
  const session = useDemoSession();
  return (
    <PublicAccountActionForIdentity
      hideWhenPrimaryVisible={props.placement === "account" && props.hideWhenPrimaryVisible}
      identity={identityFromDemo(hydrated, session)}
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
