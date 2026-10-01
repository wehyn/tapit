"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getDemoProfiles,
  getDemoTheme,
  recordLinkClick,
  recordProfileView,
  useHydratedDemoState,
} from "@/lib/demo/store";
import { isActiveAccount, validateRedirectDestination } from "@/lib/domain";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { projectDemoPublicProfile } from "@/lib/demo/projection";
import { getAnalyticsSessionKey } from "@/lib/analytics/consent";

import { MissingProfilePage, UnavailableProfilePage } from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";
import { ProfileRedirectingPage } from "./ProfileRedirectingPage";

export function PublicProfileScreen({
  slug,
  source = "direct",
}: {
  slug: string;
  source?: "nfc" | "qr" | "direct";
}) {
  return isLocalDemoMode() ? (
    <DemoPublicProfileScreen slug={slug} source={source} />
  ) : (
    <LivePublicProfileScreen slug={slug} source={source} />
  );
}

function DemoPublicProfileScreen({
  slug,
  source,
}: {
  slug: string;
  source: "nfc" | "qr" | "direct";
}) {
  const { hydrated, state } = useHydratedDemoState();
  if (!hydrated) {
    return <PublicProfileLoading />;
  }
  const profile = getDemoProfiles(state).find((candidate) => candidate.published?.slug === slug);
  if (profile === undefined) return <MissingProfilePage />;
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
        visitKey={slug}
        profileId={profile.id}
        destination={redirectDestination}
        recordView={async () => {
          recordProfileView(profile.id, source);
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
      onLinkClick={(key, id) => recordLinkClick(key, id, source)}
      onView={(id) => recordProfileView(id, source)}
    />
  );
}

function LivePublicProfileScreen({
  slug,
  source,
}: {
  slug: string;
  source: "nfc" | "qr" | "direct";
}) {
  const profile = useQuery(api.profiles.publicBySlug, { slug });
  const recordView = useMutation(api.analytics.recordView);
  const recordLinkClick = useMutation(api.analytics.recordLinkClick);
  const onView = useCallback(
    (profileId?: string) => {
      if (profileId === undefined) return;
      void recordView({
        profileId: profileId as Id<"profiles">,
        sessionKey: getAnalyticsSessionKey(),
        source,
      });
    },
    [recordView, source],
  );
  const onLinkClick = useCallback(
    (linkKey: string, profileId?: string) => {
      if (profileId === undefined) return;
      void recordLinkClick({
        profileId: profileId as Id<"profiles">,
        linkKey,
        source,
      });
    },
    [recordLinkClick, source],
  );
  if (profile === undefined) return <PublicProfileLoading />;
  if (profile === null) return <MissingProfilePage />;
  if (
    "redirectDestination" in profile &&
    profile.redirectDestination !== undefined &&
    validateRedirectDestination(profile.redirectDestination) === null
  ) {
    return (
      <ProfileRedirectingPage
        visitKey={slug}
        profileId={profile.id}
        destination={profile.redirectDestination}
        recordView={async () => {
          await recordView({
            profileId: profile.id as Id<"profiles">,
            sessionKey: getAnalyticsSessionKey(),
            source,
          });
        }}
      />
    );
  }
  const projection = {
    ...profile,
    links: profile.links.map((link) => ({
      ...link,
      icon: link.icon as import("@/lib/domain").ProfileLink["icon"],
    })),
  };
  return (
    <PublicProfile
      onLinkClick={onLinkClick}
      onView={onView}
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${profile.slug}`}
      theme={projection.theme}
    />
  );
}

function PublicProfileLoading() {
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
          Loading profile...
        </p>
      </div>
    </main>
  );
}
