"use client";

import { useSyncExternalStore } from "react";

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
        const themes =
          parsed.themes ??
          Object.fromEntries(
            profiles.map((profile) => [profile.id, profile.theme ?? fallback.theme]),
          );
        state = {
          ...fallback,
          ...parsed,
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
  update: (bucket: AnalyticsBucket) => AnalyticsBucket,
): AnalyticsBucket[] {
  const bucketStart = todayBucket();
  const existing = buckets.find(
    (bucket) => bucket.profileId === profileId && bucket.bucketStart === bucketStart,
  );
  if (existing !== undefined) {
    return buckets.map((bucket) =>
      bucket.profileId === profileId && bucket.bucketStart === bucketStart
        ? update(bucket)
        : bucket,
    );
  }
  return [
    ...buckets,
    update({ profileId, bucketStart, views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} }),
  ];
}

export function recordProfileView(profileId = "profile-mara"): void {
  try {
    updateDemoState((current) => ({
      ...current,
      analytics: updateBucket(current.analytics, profileId, (bucket) => ({
        ...bucket,
        views: bucket.views + 1,
        uniqueViews: bucket.uniqueViews + (bucket.views === 0 ? 1 : 0),
      })),
    }));
  } catch (error) {
    if (!isPersistenceError(error)) throw error;
  }
}

export function recordLinkClick(linkId: string, profileId = "profile-mara"): void {
  try {
    updateDemoState((current) => ({
      ...current,
      analytics: updateBucket(current.analytics, profileId, (bucket) => ({
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
