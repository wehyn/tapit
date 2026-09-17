"use client";

import { useSyncExternalStore } from "react";

import { normalizeSignupEmail, validateSignupEmail } from "../auth/signup";
import { normalizeProfileSlug, validateProfileSlug, type AnalyticsSource } from "../domain";
import {
  createDefaultDemoState,
  type AnalyticsBucket,
  type DemoProfile,
  type DemoState,
  type ProfileTheme,
} from "./fixtures";

const STORAGE_KEY = "tapit:demo-state:v1";
const SESSION_KEY = "tapit:demo-session:v1";
export type DemoSession = {
  email: string;
  role: "customer" | "admin";
};

export type DemoSelfServiceAccountInput = {
  email: string;
  name: string;
  slug: string;
  passwordHash: string;
};

const serverSnapshot = createDefaultDemoState();
let state = serverSnapshot;
let session: DemoSession | null = null;
let loaded = false;
let sessionLoaded = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function loadFromStorage() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as Partial<DemoState> & { profile?: DemoProfile };
      if (parsed.profile?.id && Array.isArray(parsed.cards) && Array.isArray(parsed.customers)) {
        const fallback = createDefaultDemoState();
        const profiles =
          Array.isArray(parsed.profiles) && parsed.profiles.length > 0
            ? parsed.profiles
            : [{ ...parsed.profile, theme: parsed.theme ?? fallback.theme }];
        const cards = parsed.cards.map((card, index) => ({
          ...card,
          // Older demo records were appended in creation order and had no timestamp.
          createdAt: card.createdAt ?? index,
        }));
        const themes =
          parsed.themes ??
          Object.fromEntries(
            profiles.map((profile) => [profile.id, profile.theme ?? fallback.theme]),
          );
        state = {
          ...fallback,
          ...parsed,
          cards,
          profiles,
          themes,
          profile: parsed.profile,
          analytics: (parsed.analytics ?? fallback.analytics).map((bucket) => ({
            ...bucket,
            profileId: bucket.profileId ?? parsed.profile?.id,
          })),
        } as DemoState;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
}

function loadSession() {
  if (typeof window === "undefined" || sessionLoaded) return;
  sessionLoaded = true;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (raw !== null) {
    try {
      session = JSON.parse(raw) as DemoSession;
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }
}

function persist(nextState: DemoState) {
  if (typeof window === "undefined") return;
  const previousRaw = window.localStorage.getItem(STORAGE_KEY);
  let serialized: string;
  try {
    serialized = JSON.stringify(nextState);
  } catch (error) {
    throw persistenceError(error);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    try {
      if (previousRaw === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, previousRaw);
    } catch {
      // The in-memory state is still unchanged. Report the original write failure.
    }
    throw persistenceError(error);
  }
}

function persistenceError(error: unknown): Error {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return new Error(`Could not save Tapit data locally. Your changes were not saved.${detail}`);
}

function isPersistenceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Could not save Tapit data locally. Your changes were not saved.")
  );
}

export function subscribeDemoState(listener: () => void): () => void {
  loadFromStorage();
  loadSession();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getStateSnapshot(): DemoState {
  return state;
}

export function getDemoState(): DemoState {
  loadFromStorage();
  return state;
}

export function getDemoProfiles(current: DemoState): DemoProfile[] {
  return current.profiles.length > 0
    ? current.profiles
    : [{ ...current.profile, theme: current.theme }];
}

export function getDemoProfileById(
  current: DemoState,
  profileId: string | undefined,
): DemoProfile | undefined {
  if (profileId === undefined) return undefined;
  return getDemoProfiles(current).find((profile) => profile.id === profileId);
}

export function getDemoProfileForSession(
  current: DemoState,
  currentSession: DemoSession | null,
): DemoProfile {
  if (currentSession?.role === "customer") {
    const customer = current.customers.find(
      (candidate) => candidate.email === currentSession.email,
    );
    const profile = getDemoProfileById(current, customer?.profileId);
    if (profile !== undefined) return profile;
  }
  return getDemoProfiles(current)[0] ?? { ...current.profile, theme: current.theme };
}

export function getDemoTheme(current: DemoState, profileId: string): ProfileTheme {
  return (
    current.themes[profileId] ?? getDemoProfileById(current, profileId)?.theme ?? current.theme
  );
}

export function updateDemoProfile(
  current: DemoState,
  profileId: string,
  updater: (profile: DemoProfile) => DemoProfile,
): DemoState {
  const existing = getDemoProfileById(current, profileId);
  if (existing === undefined) return current;
  const updated = updater(existing);
  const profiles = getDemoProfiles(current).map((profile) =>
    profile.id === profileId ? updated : profile,
  );
  return {
    ...current,
    profiles,
    profile: current.profile.id === profileId ? updated : current.profile,
    themes: { ...current.themes, [profileId]: updated.theme },
  };
}

export function updateDemoTheme(
  current: DemoState,
  profileId: string,
  theme: ProfileTheme,
): DemoState {
  return updateDemoProfile(current, profileId, (profile) => ({ ...profile, theme }));
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(subscribeDemoState, getStateSnapshot, () => serverSnapshot);
}

export function useHydratedDemoState(): { hydrated: boolean; state: DemoState } {
  const state = useDemoState();
  const hydrated = useSyncExternalStore(
    subscribeDemoState,
    () => loaded,
    () => false,
  );
  return { hydrated, state };
}

export function updateDemoState(updater: (current: DemoState) => DemoState): void {
  loadFromStorage();
  const nextState = updater(state);
  persist(nextState);
  state = nextState;
  notify();
}

export function createDemoSelfServiceAccount(input: DemoSelfServiceAccountInput): {
  customerId: string;
  profileId: string;
  slug: string;
} {
  const email = normalizeSignupEmail(input.email);
  const name = input.name.trim();
  const slug = normalizeProfileSlug(input.slug);
  const emailError = validateSignupEmail(email);
  if (emailError !== null) throw new Error(emailError);
  if (name.length === 0) throw new Error("Enter your display name.");
  if (name.length > 120) throw new Error("Your display name is too long.");

  const customerId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const auditId = crypto.randomUUID();

  updateDemoState((current) => {
    if (current.customers.some((customer) => customer.email === email)) {
      throw new Error(
        "That email already has a Tapit account or invitation. Sign in or use the setup link.",
      );
    }
    const slugError = validateProfileSlug(slug, {
      existingSlugs: getDemoProfiles(current).map((profile) => profile.draft.slug),
    });
    if (slugError !== null) throw new Error(slugError);

    const profile: DemoProfile = {
      id: profileId,
      ownerId: customerId,
      status: "draft",
      theme: "paper",
      draft: { name, slug, email, links: [] },
      published: null,
    };
    const customer = {
      id: customerId,
      email,
      role: "customer" as const,
      profileId,
      status: "active" as const,
      deletionStatus: "active" as const,
      passwordHash: input.passwordHash,
    };
    return {
      ...current,
      customers: [...current.customers, customer],
      profiles: [...getDemoProfiles(current), profile],
      themes: { ...current.themes, [profileId]: profile.theme },
      audits: [
        ...current.audits,
        {
          id: auditId,
          actor: name,
          action: "customer.self_service_created",
          target: `${email} / ${slug}`,
          occurredAt: new Date().toISOString(),
        },
      ],
    };
  });

  return { customerId, profileId, slug };
}

export function resetDemoState(): void {
  const nextState = createDefaultDemoState();
  persist(nextState);
  state = nextState;
  notify();
}

export function getDemoSession(): DemoSession | null {
  loadSession();
  return session;
}

export function setDemoSession(nextSession: DemoSession): void {
  session = nextSession;
  sessionLoaded = true;
  if (typeof window !== "undefined")
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify();
}

export function clearDemoSession(): void {
  session = null;
  sessionLoaded = true;
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
  notify();
}

export function useDemoSession(): DemoSession | null {
  return useSyncExternalStore(
    subscribeDemoState,
    () => session,
    () => null,
  );
}

function todayBucket(): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime();
}

function updateBucket(
  buckets: AnalyticsBucket[],
  profileId: string,
  source: AnalyticsSource,
  update: (bucket: AnalyticsBucket) => AnalyticsBucket,
): AnalyticsBucket[] {
  const bucketStart = todayBucket();
  const existing = buckets.find(
    (bucket) =>
      bucket.profileId === profileId &&
      bucket.bucketStart === bucketStart &&
      (bucket.source ?? "unknown") === source,
  );
  if (existing !== undefined) {
    return buckets.map((bucket) =>
      bucket.profileId === profileId &&
      bucket.bucketStart === bucketStart &&
      (bucket.source ?? "unknown") === source
        ? update(bucket)
        : bucket,
    );
  }
  return [
    ...buckets,
    update({ profileId, bucketStart, source, views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} }),
  ];
}

export function recordProfileView(
  profileId = "profile-mara",
  source: AnalyticsSource = "unknown",
): void {
  try {
    updateDemoState((current) => ({
      ...current,
      analytics: updateBucket(current.analytics, profileId, source, (bucket) => ({
        ...bucket,
        views: bucket.views + 1,
        uniqueViews: bucket.uniqueViews + (bucket.views === 0 ? 1 : 0),
      })),
    }));
  } catch (error) {
    if (!isPersistenceError(error)) throw error;
  }
}

export function recordLinkClick(
  linkId: string,
  profileId = "profile-mara",
  source: AnalyticsSource = "unknown",
): void {
  try {
    updateDemoState((current) => ({
      ...current,
      analytics: updateBucket(current.analytics, profileId, source, (bucket) => ({
        ...bucket,
        clicks: bucket.clicks + 1,
        linkClicks: {
          ...bucket.linkClicks,
          [linkId]: (bucket.linkClicks[linkId] ?? 0) + 1,
        },
      })),
    }));
  } catch (error) {
    if (!isPersistenceError(error)) throw error;
  }
}

export function verifyDemoCardClaim(cardToken: string, code: string): string {
  const card = getDemoState().cards.find((candidate) => candidate.token === cardToken);
  if (
    card?.status !== "claimable" ||
    card.claimCode !== code ||
    card.claimCodeInvalidatedAt !== undefined ||
    (card.claimCodeExpiresAt !== undefined && card.claimCodeExpiresAt <= Date.now())
  ) {
    throw new Error("That code is invalid or expired.");
  }
  const challenge = crypto.randomUUID();
  updateDemoState((current) => ({
    ...current,
    cards: current.cards.map((candidate) =>
      candidate.id === card.id
        ? {
            ...candidate,
            claimChallenge: challenge,
            claimChallengeExpiresAt: Date.now() + 10 * 60 * 1000,
          }
        : candidate,
    ),
  }));
  return challenge;
}

export function completeDemoCardClaim(cardToken: string, challenge: string, email: string): void {
  if (!challenge || !email) throw new Error("The card claim is invalid.");
  const card = getDemoState().cards.find((candidate) => candidate.token === cardToken);
  const profile =
    card === undefined ? undefined : getDemoProfileById(getDemoState(), card.profileId);
  const owner =
    profile === undefined
      ? undefined
      : getDemoState().customers.find((candidate) => candidate.id === profile.ownerId);
  if (
    card?.status !== "claimable" ||
    card.claimedAt !== undefined ||
    owner?.email !== email ||
    card.claimChallenge !== challenge ||
    (card.claimChallengeExpiresAt !== undefined && card.claimChallengeExpiresAt <= Date.now())
  )
    throw new Error("The card claim is not available for this account.");
  const claimedAt = Date.now();
  updateDemoState((current) => ({
    ...current,
    cards: current.cards.map((candidate) =>
      candidate.id === card.id
        ? {
            ...candidate,
            claimCode: undefined,
            claimCodeExpiresAt: undefined,
            claimCodeInvalidatedAt: undefined,
            claimChallenge: undefined,
            claimChallengeExpiresAt: undefined,
            claimedAt,
            status: profile?.status === "published" ? "active" : "claimable",
          }
        : candidate,
    ),
    customers: current.customers.map((candidate) =>
      candidate.id === owner.id
        ? { ...candidate, claimedCardIds: [...(candidate.claimedCardIds ?? []), card.id] }
        : candidate,
    ),
  }));
}

export type AnalyticsRange = "lifetime" | "7d" | "30d" | "90d";

export function aggregateAnalytics(
  buckets: AnalyticsBucket[],
  range: AnalyticsRange,
  profileId?: string,
): { views: number; uniqueViews: number; clicks: number; linkClicks: Record<string, number> } {
  const days = range === "lifetime" ? Number.POSITIVE_INFINITY : Number(range.slice(0, -1));
  const cutoff = Number.isFinite(days) ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
  return buckets
    .filter(
      (bucket) =>
        (profileId === undefined || bucket.profileId === profileId) && bucket.bucketStart >= cutoff,
    )
    .reduce<{
      views: number;
      uniqueViews: number;
      clicks: number;
      linkClicks: Record<string, number>;
    }>(
      (total, bucket) => ({
        views: total.views + bucket.views,
        uniqueViews: total.uniqueViews + bucket.uniqueViews,
        clicks: total.clicks + bucket.clicks,
        linkClicks: Object.entries(bucket.linkClicks).reduce(
          (links, [linkId, count]) => ({ ...links, [linkId]: (links[linkId] ?? 0) + count }),
          total.linkClicks,
        ),
      }),
      { views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} },
    );
}
