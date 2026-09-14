"use client";

import { getDemoProfileById, getDemoTheme, useHydratedDemoState } from "@/lib/demo/store";
import { isActiveAccount, projectPublicProfile } from "@/lib/domain";

import {
  InactiveCardPage,
  MissingProfilePage,
  UnavailableProfilePage,
} from "@/components/state/StatePage";

import { PublicProfile } from "./PublicProfile";

export function CardResolverClient({ cardToken }: { cardToken: string }) {
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
    />
  );
}

function CardResolverLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10"
    >
      <p className="text-sm text-tapit-muted" role="status">
        Loading card…
      </p>
    </main>
  );
}
