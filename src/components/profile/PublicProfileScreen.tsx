"use client";

import { getDemoProfiles, getDemoTheme, useDemoState } from "@/lib/demo/store";
import { projectPublicProfile } from "@/lib/domain";

import { MissingProfilePage, UnavailableProfilePage } from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";

export function PublicProfileScreen({ slug }: { slug: string }) {
  const state = useDemoState();
  const profile = getDemoProfiles(state).find(
    (candidate) => candidate.published?.slug === slug || candidate.draft.slug === slug,
  );
  if (profile === undefined) return <MissingProfilePage />;

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
