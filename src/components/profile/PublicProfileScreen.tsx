"use client";

import { getDemoProfiles, getDemoTheme, useHydratedDemoState } from "@/lib/demo/store";
import { isActiveAccount, projectPublicProfile } from "@/lib/domain";

import { MissingProfilePage, UnavailableProfilePage } from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";

export function PublicProfileScreen({ slug }: { slug: string }) {
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
