"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getDemoProfileById, getDemoTheme, useHydratedDemoState } from "@/lib/demo/store";
import { isActiveAccount, projectPublicProfile } from "@/lib/domain";

import {
  InactiveCardPage,
  MissingProfilePage,
  UnavailableProfilePage,
} from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";
import { recordLinkClick, recordProfileView } from "@/lib/demo/store";

function DemoCardResolver({ cardToken }: { cardToken: string }) {
  const { hydrated, state } = useHydratedDemoState();
  if (!hydrated) {
    return <CardResolverLoading />;
  }
  const card = state.cards.find((candidate) => candidate.token === cardToken);
  if (card === undefined) return <MissingProfilePage />;
  const profile = getDemoProfileById(state, card.profileId);
  if (card.status !== "active" || profile === undefined) {
    return <InactiveCardPage supportUrl={state.supportUrl} />;
  }
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
      onLinkClick={recordLinkClick}
      onView={recordProfileView}
    />
  );
}

export function CardResolverClient({ cardToken }: { cardToken: string }) {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
    <LiveCardResolver cardToken={cardToken} />
  ) : (
    <DemoCardResolver cardToken={cardToken} />
  );
}

function LiveCardResolver({ cardToken }: { cardToken: string }) {
  const result = useQuery(api.cards.resolve, { token: cardToken });
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
      void recordView({ profileId: profileId as Id<"profiles">, sessionKey });
    },
    [recordView],
  );
  const onLinkClick = useCallback(
    (linkKey: string, profileId?: string) => {
      if (profileId === undefined) return;
      void recordLinkClick({
        profileId: profileId as Id<"profiles">,
        linkKey,
      });
    },
    [recordLinkClick],
  );
  if (result === undefined) return <CardResolverLoading />;
  if (result.status === "missing") return <MissingProfilePage />;
  if (result.status === "inactive") return <InactiveCardPage />;
  if (result.status === "unavailable" || result.profile === null) return <UnavailableProfilePage />;
  const profile = {
    ...result.profile,
    links: result.profile.links.map((link) => ({
      ...link,
      icon: link.icon as import("@/lib/domain").ProfileLink["icon"],
    })),
  };
  return (
    <PublicProfile
      onLinkClick={onLinkClick}
      onView={onView}
      profile={profile}
      profileId={profile.id}
      profileUrl={`/${profile.slug}`}
      theme={profile.theme}
    />
  );
}

function CardResolverLoading() {
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
          Loading card...
        </p>
      </div>
    </main>
  );
}
