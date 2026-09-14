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
      className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10"
    >
      <p className="text-sm text-tapit-muted" role="status">
        Loading profile…
      </p>
    </main>
  );
}
