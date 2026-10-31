"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { useCallback } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getDemoProfileById,
  getDemoTheme,
  recordLinkClick,
  recordProfileView,
  useDemoSession,
  useHydratedDemoState,
} from "@/lib/demo/store";
import { projectDemoPublicProfile } from "@/lib/demo/projection";
import { isActiveAccount, validateRedirectDestination } from "@/lib/domain";
import { getVisitorSessionKey } from "@/lib/analytics/visitor-session";
import { matchesOwnedProfileQuery } from "@/lib/profile-ownership";
import { DEFAULT_SUPPORT_URL } from "@/lib/support";

import { LostCardPage, UnavailableProfilePage } from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";
import { ProfileRedirectingPage } from "./ProfileRedirectingPage";
import { CardSetupFlow } from "./CardSetupFlow";

function sourceValue(source?: string): "nfc" | "qr" | "unknown" {
  if (source === undefined) return "nfc";
  if (source === "nfc") return "nfc";
  if (source === "qr") return "qr";
  return "unknown";
}

function DemoCardResolver({
  cardToken,
  returnHref,
  source,
}: {
  cardToken: string;
  returnHref?: string;
  source?: string;
}) {
  const { hydrated, state } = useHydratedDemoState();
  const session = useDemoSession();
  const card = state.cards.find((candidate) => candidate.token === cardToken);
  if (!hydrated) {
    return <CardResolverLoading />;
  }
  if (card === undefined) return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  if (card.status === "lost" && card.lostCardResolution === "inactive")
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  if (card.status === "lost")
    return (
      <LostCardPage instructions={state.lostCardReturnInstructions} supportUrl={state.supportUrl} />
    );
  if (
    state.cardCorrectionRequests?.some(
      (request) => request.token === cardToken && request.status === "pending",
    )
  )
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  if (card.status === "claimable" && card.claimedAt !== undefined) {
    const profile = getDemoProfileById(state, card.profileId);
    const owner = profile && state.customers.find((customer) => customer.id === profile.ownerId);
    const viewer = session && state.customers.find((customer) => customer.email === session.email);
    if (
      profile &&
      isActiveAccount(owner?.status, owner?.deletionStatus) &&
      viewer?.id === owner?.id
    )
      return <CardSetupFlow cardToken={cardToken} codeFree />;
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  }
  if (card.status === "registered" && card.profileId === undefined)
    return <CardSetupFlow cardToken={cardToken} returnHref={returnHref} />;
  if (
    (card.status === "claimable" || card.status === "active") &&
    card.claimedAt === undefined &&
    card.claimCodeInvalidatedAt === undefined
  ) {
    if (card.status === "active") {
      const profile = getDemoProfileById(state, card.profileId);
      const owner = profile && state.customers.find((customer) => customer.id === profile.ownerId);
      if (!profile || !isActiveAccount(owner?.status, owner?.deletionStatus))
        return <UnavailableProfilePage supportUrl={state.supportUrl} />;
    }
    return (
      <CardSetupFlow
        cardToken={cardToken}
        returnHref={returnHref}
        correction={card.profileId !== undefined}
      />
    );
  }
  if (card.status === "claimable") return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  if (card.status === "active" && card.claimedAt === undefined)
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  const profile = getDemoProfileById(state, card.profileId);
  if (card.status !== "active" || profile === undefined) {
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  }
  const claimHref = undefined;
  const owner = state.customers.find((customer) => customer.id === profile.ownerId);
  if (!isActiveAccount(owner?.status, owner?.deletionStatus)) {
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  }
  const viewer = session
    ? state.customers.find((customer) => customer.email === session.email)
    : undefined;
  const showOwnerShortcut =
    viewer !== undefined &&
    isActiveAccount(viewer.status, viewer.deletionStatus) &&
    viewer.id === profile.ownerId;
  const projection = projectDemoPublicProfile(
    profile,
    profile.published,
    getDemoTheme(state, profile.id),
  );
  if (projection === null) return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  const redirect = profile.published?.redirect;
  const redirectDestination =
    redirect?.enabled === true && validateRedirectDestination(redirect.destination) === null
      ? redirect.destination.trim()
      : undefined;
  if (redirectDestination !== undefined) {
    return (
      <ProfileRedirectingPage
        visitKey={cardToken}
        profileId={profile.id}
        destination={redirectDestination}
        claimHref={claimHref}
        recordView={async () => {
          recordProfileView(profile.id, sourceValue(source));
        }}
      />
    );
  }
  return (
    <PublicProfile
      mobileLayout
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${projection.slug}`}
      showOwnerShortcut={showOwnerShortcut}
      claimHref={claimHref}
      theme={projection.theme}
      onLinkClick={(key, id) => recordLinkClick(key, id, sourceValue(source))}
      onView={(id) => recordProfileView(id, sourceValue(source))}
    />
  );
}

export function CardResolverClient({
  cardToken,
  source,
  returnHref,
}: {
  cardToken: string;
  source?: string;
  returnHref?: string;
}) {
  return !isLocalDemoMode() ? (
    <LiveCardResolver cardToken={cardToken} source={source} returnHref={returnHref} />
  ) : (
    <DemoCardResolver cardToken={cardToken} source={source} returnHref={returnHref} />
  );
}

function LiveCardResolver({
  cardToken,
  source,
  returnHref,
}: {
  cardToken: string;
  source?: string;
  returnHref?: string;
}) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const result = useQuery(api.cards.resolve, { token: cardToken });
  const ownedProfile = useQuery_experimental({
    query: api.profiles.mine,
    args: result?.status === "active" && isAuthenticated && !authLoading ? {} : "skip",
  });
  const recordView = useMutation(api.analytics.recordView);
  const recordLinkClick = useMutation(api.analytics.recordLinkClick);
  const recordProfileViewForVisit = useCallback(
    async (profileId: string) => {
      await recordView({
        profileId: profileId as Id<"profiles">,
        sessionKey: getVisitorSessionKey(),
        source: sourceValue(source),
      });
    },
    [recordView, source],
  );
  const onView = useCallback(
    (profileId?: string) => {
      if (profileId === undefined) return;
      void recordProfileViewForVisit(profileId).catch(() => {
        // Tracking remains best-effort.
      });
    },
    [recordProfileViewForVisit],
  );
  const onLinkClick = useCallback(
    (linkKey: string, profileId?: string) => {
      if (profileId === undefined) return;
      void recordLinkClick({
        profileId: profileId as Id<"profiles">,
        linkKey,
        source: sourceValue(source),
      });
    },
    [recordLinkClick, source],
  );
  if (result === undefined) return <CardResolverLoading />;
  if (result.status === "missing" || result.status === "inactive")
    return <UnavailableProfilePage />;
  if (result.status === "lost")
    return (
      <LostCardPage
        instructions={result.instructions}
        supportUrl={result.supportUrl ?? DEFAULT_SUPPORT_URL}
      />
    );
  if (result.status === "ownerSetup") return <CardSetupFlow cardToken={cardToken} codeFree />;
  if (result.status === "setup")
    return <CardSetupFlow cardToken={cardToken} returnHref={returnHref} />;
  if (result.status === "claim")
    return <CardSetupFlow cardToken={cardToken} returnHref={returnHref} correction />;
  if (result.status === "unavailable") return <UnavailableProfilePage />;
  if (result.status !== "active" || result.profile == null) return <UnavailableProfilePage />;
  const activeResult = result;
  const claimHref = undefined;
  if (activeResult.redirectDestination !== undefined) {
    return (
      <ProfileRedirectingPage
        visitKey={cardToken}
        profileId={activeResult.profile.id}
        destination={activeResult.redirectDestination}
        claimHref={claimHref}
        recordView={() => recordProfileViewForVisit(activeResult.profile.id)}
      />
    );
  }
  const profile = {
    ...activeResult.profile,
    links: activeResult.profile.links.map((link) => ({
      ...link,
      icon: link.icon as import("@/lib/domain").ProfileLink["icon"],
    })),
  };
  const showOwnerShortcut =
    !authLoading && isAuthenticated && matchesOwnedProfileQuery(ownedProfile, profile.id);
  return (
    <PublicProfile
      mobileLayout
      onLinkClick={onLinkClick}
      onView={onView}
      profile={profile}
      profileId={profile.id}
      profileUrl={`/${profile.slug}`}
      showOwnerShortcut={showOwnerShortcut}
      claimHref={claimHref}
      theme={profile.theme}
    />
  );
}

function CardResolverLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-4 py-6 sm:px-8 sm:py-12"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center rounded-card bg-tapit-surface p-6 shadow-card">
        <div className="h-24 w-24 animate-pulse rounded-full bg-tapit-soft-surface" />
        <div className="mt-8 h-10 w-full max-w-64 animate-pulse rounded-card bg-tapit-soft-surface" />
        <p className="mt-6 text-sm text-tapit-muted" role="status">
          Loading card...
        </p>
      </div>
    </main>
  );
}
