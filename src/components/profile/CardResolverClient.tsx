"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { getDemoProfileById, getDemoTheme, useHydratedDemoState } from "@/lib/demo/store";
import { isActiveAccount, projectPublicProfile, validateRedirectDestination } from "@/lib/domain";

import {
  InactiveCardPage,
  MissingProfilePage,
  UnavailableProfilePage,
} from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";
import { UnpublishedCardClaim } from "./UnpublishedCardClaim";
import { recordLinkClick, recordProfileView } from "@/lib/demo/store";

function sourceValue(source?: string): "nfc" | "qr" | "unknown" {
  if (source === undefined) return "nfc";
  if (source === "nfc") return "nfc";
  if (source === "qr") return "qr";
  return "unknown";
}

function getAnalyticsSessionKey(): string | undefined {
  try {
    const key = "tapit:analytics-session";
    const sessionKey = window.sessionStorage.getItem(key) ?? crypto.randomUUID();
    window.sessionStorage.setItem(key, sessionKey);
    return sessionKey;
  } catch {
    // Tracking remains best-effort when storage is unavailable.
    return undefined;
  }
}

function RedirectingCard({
  profileId,
  destination,
  recordView,
}: {
  profileId: string;
  destination: string;
  recordView: () => Promise<void>;
}) {
  const redirectAttempt = useRef<{ profileId: string; analytics: Promise<void> } | undefined>(
    undefined,
  );
  const recordViewRef = useRef(recordView);
  useEffect(() => {
    recordViewRef.current = recordView;
  }, [recordView]);
  useEffect(() => {
    const analytics =
      redirectAttempt.current?.profileId === profileId
        ? redirectAttempt.current.analytics
        : recordViewRef.current();
    redirectAttempt.current = { profileId, analytics };
    let cancelled = false;
    void analytics
      .catch(() => {
        // Redirects must not be blocked by best-effort analytics.
      })
      .finally(() => {
        if (!cancelled) window.location.replace(destination);
      });
    return () => {
      cancelled = true;
    };
  }, [destination, profileId]);

  return <CardRedirectLoading />;
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
  const projection = projectPublicProfile(profile);
  if (projection === null) return <UnavailableProfilePage supportUrl={state.supportUrl} />;
  const redirect = profile.published?.redirect;
  const redirectDestination =
    redirect?.enabled === true && validateRedirectDestination(redirect.destination) === null
      ? redirect.destination.trim()
      : undefined;
  if (redirectDestination !== undefined) {
    return (
      <RedirectingCard
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
      theme={getDemoTheme(state, profile.id)}
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
      <RedirectingCard
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

function CardRedirectLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-10"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col justify-center border-t border-b border-tapit-line py-12">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-tapit-accent-soft">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tapit-line border-t-tapit-accent" />
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-tapit-ink">Redirecting</h1>
        <p className="mt-3 text-sm text-tapit-muted" role="status">
          Taking you to the destination...
        </p>
      </div>
    </main>
  );
}
