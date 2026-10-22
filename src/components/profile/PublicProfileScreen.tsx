"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { useCallback } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  getDemoProfiles,
  getDemoTheme,
  recordLinkClick,
  recordProfileView,
  useDemoSession,
  useHydratedDemoState,
} from "@/lib/demo/store";
import { isActiveAccount, validateRedirectDestination } from "@/lib/domain";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { projectDemoPublicProfile } from "@/lib/demo/projection";
import { getVisitorSessionKey } from "@/lib/analytics/visitor-session";
import { matchesOwnedProfileQuery } from "@/lib/profile-ownership";

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
  const session = useDemoSession();
  if (!hydrated) {
    return <PublicProfileLoading />;
  }
  const normalizedSlug = slug.trim().toLowerCase();
  const profile = getDemoProfiles(state).find(
    (candidate) => candidate.published?.slug === normalizedSlug,
  );
  if (profile === undefined) return <MissingProfilePage />;
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
      mobileLayout
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${projection.slug}`}
      showOwnerShortcut={showOwnerShortcut}
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
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.publicBySlug, { slug });
  const ownedProfile = useQuery_experimental({
    query: api.profiles.mine,
    args: isAuthenticated && !authLoading ? {} : "skip",
  });
  const recordView = useMutation(api.analytics.recordView);
  const recordLinkClick = useMutation(api.analytics.recordLinkClick);
  const onView = useCallback(
    (profileId?: string) => {
      if (profileId === undefined) return;
      void recordView({
        profileId: profileId as Id<"profiles">,
        sessionKey: getVisitorSessionKey(),
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
            sessionKey: getVisitorSessionKey(),
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
  const showOwnerShortcut =
    !authLoading && isAuthenticated && matchesOwnedProfileQuery(ownedProfile, profile.id);
  return (
    <PublicProfile
      mobileLayout
      onLinkClick={onLinkClick}
      onView={onView}
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${profile.slug}`}
      showOwnerShortcut={showOwnerShortcut}
      theme={projection.theme}
    />
  );
}

function PublicProfileLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="min-h-[100dvh] bg-tapit-paper">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col">
        <div aria-hidden="true" className="grid h-[180px] grid-cols-3 gap-1 p-1">
          <span className="rounded-control bg-tapit-accent-soft" />
          <span className="rounded-control bg-tapit-soft-surface" />
          <span className="rounded-control bg-tapit-warm/50" />
        </div>
        <div aria-hidden="true" className="relative -mt-12 flex flex-col items-center gap-4 px-4">
          <div className="size-[104px] animate-pulse rounded-full bg-tapit-soft-surface ring-4 ring-tapit-paper" />
          <div className="h-8 w-full max-w-64 animate-pulse rounded-control bg-tapit-soft-surface" />
          <div className="h-4 w-full max-w-48 animate-pulse rounded-control bg-tapit-soft-surface" />
          <div className="flex gap-2">
            <span className="size-11 animate-pulse rounded-control bg-tapit-soft-surface" />
            <span className="size-11 animate-pulse rounded-control bg-tapit-soft-surface" />
            <span className="size-11 animate-pulse rounded-control bg-tapit-soft-surface" />
          </div>
        </div>
        <div aria-hidden="true" className="mt-4 grid gap-3 px-4">
          <div className="grid grid-cols-2 gap-2">
            <span className="h-14 animate-pulse rounded-control bg-tapit-soft-surface" />
            <span className="h-14 animate-pulse rounded-control bg-tapit-soft-surface" />
          </div>
          <span className="h-[52px] animate-pulse rounded-control bg-tapit-soft-surface" />
          <span className="h-[52px] animate-pulse rounded-control bg-tapit-soft-surface" />
        </div>
        <p className="mt-4 px-4 text-center text-sm text-tapit-muted" role="status">
          Loading profile...
        </p>
      </div>
    </main>
  );
}
