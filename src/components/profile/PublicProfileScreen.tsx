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
import { isActiveAccount, projectPublicProfile } from "@/lib/domain";

import { MissingProfilePage, UnavailableProfilePage } from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";

export function PublicProfileScreen({ slug }: { slug: string }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return <LivePublicProfileScreen slug={slug} />;
  return <DemoPublicProfileScreen slug={slug} />;
}

function DemoPublicProfileScreen({ slug }: { slug: string }) {
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

  const projection = projectPublicProfile(profile);
  if (projection === null) return <UnavailableProfilePage supportUrl={state.supportUrl} />;

  return (
    <PublicProfile
      profile={projection}
      profileId={profile.id}
      profileUrl={`/${projection.slug}`}
      theme={getDemoTheme(state, profile.id)}
      onLinkClick={(key, id) => recordLinkClick(key, id, "direct")}
      onView={(id) => recordProfileView(id, "direct")}
    />
  );
}

function LivePublicProfileScreen({ slug }: { slug: string }) {
  const profile = useQuery(api.profiles.publicBySlug, { slug });
  const recordView = useMutation(api.analytics.recordView);
  const recordLinkClick = useMutation(api.analytics.recordLinkClick);
  const onView = useCallback(
    (profileId?: string) => {
      if (profileId === undefined) return;
      let sessionKey: string | undefined;
      try {
        const key = "tapit:analytics-session";
        sessionKey = window.sessionStorage.getItem(key) ?? crypto.randomUUID();
        window.sessionStorage.setItem(key, sessionKey);
      } catch {
        // Tracking remains best-effort when storage is unavailable.
      }
      void recordView({
        profileId: profileId as Id<"profiles">,
        sessionKey,
        source: "direct",
      });
    },
    [recordView],
  );
  const onLinkClick = useCallback(
    (linkKey: string, profileId?: string) => {
      if (profileId === undefined) return;
      void recordLinkClick({
        profileId: profileId as Id<"profiles">,
        linkKey,
        source: "direct",
      });
    },
    [recordLinkClick],
  );
  if (profile === undefined) return <PublicProfileLoading />;
  if (profile === null) return <MissingProfilePage />;
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
      className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-10"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col justify-center border-t border-b border-tapit-line py-12">
        <div className="h-24 w-24 animate-pulse rounded-full bg-tapit-soft-surface" />
        <div className="mt-8 h-10 w-64 animate-pulse rounded-tapit bg-tapit-soft-surface" />
        <p className="mt-5 text-sm text-tapit-muted" role="status">
          Loading profile...
        </p>
      </div>
    </main>
  );
}
