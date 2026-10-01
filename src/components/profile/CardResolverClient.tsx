"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getDemoProfileById, getDemoTheme, useHydratedDemoState } from "@/lib/demo/store";
import { projectDemoPublicProfile } from "@/lib/demo/projection";
import { isActiveAccount, validateRedirectDestination } from "@/lib/domain";
import { getAnalyticsSessionKey } from "@/lib/analytics/consent";

import {
  InactiveCardPage,
  MissingProfilePage,
  UnavailableProfilePage,
} from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";
import { AnalyticsConsent } from "./AnalyticsConsent";
import { ProfileRedirectingPage } from "./ProfileRedirectingPage";
import { UnpublishedCardClaim } from "./UnpublishedCardClaim";
import { recordLinkClick, recordProfileView } from "@/lib/demo/store";

function sourceValue(source?: string): "nfc" | "qr" | "unknown" {
  if (source === undefined) return "nfc";
  if (source === "nfc") return "nfc";
  if (source === "qr") return "qr";
  return "unknown";
}

function DemoCardResolver({ cardToken, source }: { cardToken: string; source?: string }) {
  const { hydrated, state } = useHydratedDemoState();
  if (!hydrated) {
    return <CardResolverLoading />;
  }
  const card = state.cards.find((candidate) => candidate.token === cardToken);
  if (card === undefined) return <MissingProfilePage />;
  const profile = getDemoProfileById(state, card.profileId);
  if (card.status === "claimable") return <UnpublishedCardClaim cardToken={cardToken} />;
  if (card.status !== "active" || profile === undefined) {
    return <InactiveCardPage supportUrl={state.supportUrl} />;
  }
  const owner = state.customers.find((customer) => customer.id === profile.ownerId);
  if (!isActiveAccount(owner?.status, owner?.deletionStatus)) {
    return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  }
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
        recordView={async () => {
          recordProfileView(profile.id, sourceValue(source));
        }}
      />
    );
  }
  return (
    <PublicProfile
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${projection.slug}`}
      theme={projection.theme}
      onLinkClick={(key, id) => recordLinkClick(key, id, sourceValue(source))}
      onView={(id) => recordProfileView(id, sourceValue(source))}
    />
  );
}

export function CardResolverClient({ cardToken, source }: { cardToken: string; source?: string }) {
  return !isLocalDemoMode() ? (
    <LiveCardResolver cardToken={cardToken} source={source} />
  ) : (
    <DemoCardResolver cardToken={cardToken} source={source} />
  );
}

function LiveCardResolver({ cardToken, source }: { cardToken: string; source?: string }) {
  const result = useQuery(api.cards.resolve, { token: cardToken });
  const recordView = useMutation(api.analytics.recordView);
  const recordLinkClick = useMutation(api.analytics.recordLinkClick);
  const recordProfileViewForVisit = useCallback(
    async (profileId: string) => {
      await recordView({
        profileId: profileId as Id<"profiles">,
        sessionKey: getAnalyticsSessionKey(),
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
  if (result.status === "missing") return <MissingProfilePage />;
  if (result.status === "inactive") return <InactiveCardPage />;
  if (result.status === "onboarding") return <UnpublishedCardClaim cardToken={cardToken} />;
  if (result.status === "unavailable") return <UnavailableProfilePage />;
  if (result.status !== "active" || result.profile == null) return <UnavailableProfilePage />;
  const activeResult = result;
  if (activeResult.redirectDestination !== undefined) {
    return (
      <ProfileRedirectingPage
        visitKey={cardToken}
        profileId={activeResult.profile.id}
        destination={activeResult.redirectDestination}
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
  return (
    <>
      <PublicProfile
        onLinkClick={onLinkClick}
        onView={onView}
        profile={profile}
        profileId={profile.id}
        profileUrl={`/${profile.slug}`}
        theme={profile.theme}
      />
      <AnalyticsConsent />
    </>
  );
}

function CardResolverLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-4 py-6 sm:px-8 sm:py-10"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center rounded-tapit border border-tapit-line bg-tapit-surface p-6 sm:p-9">
        <div className="h-24 w-24 animate-pulse rounded-full bg-tapit-soft-surface" />
        <div className="mt-8 h-10 w-full max-w-64 animate-pulse rounded-tapit bg-tapit-soft-surface" />
        <p className="mt-5 text-sm text-tapit-muted" role="status">
          Loading card...
        </p>
      </div>
    </main>
  );
}
