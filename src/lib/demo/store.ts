"use client";

import { useSyncExternalStore } from "react";

import { normalizeSignupEmail, validateSignupEmail } from "../auth/signup";
import { isCardOrderLaunchEndDate, isValidReferralFixedPriceCentavos } from "../card-ordering";
import { normalizeProfileSlug, validateProfileSlug, type AnalyticsSource } from "../domain";
import {
  createDefaultDemoState,
  type AnalyticsBucket,
  type DemoCardOrder,
  type DemoCardOrderPaymentMethod,
  type DemoCardOrderReferralCode,
  type DemoCustomer,
  type DemoProfile,
  type DemoState,
  type ProfileTheme,
} from "./fixtures";
import {
  deserializeDemoState,
  serializeDemoState,
  UnsupportedDemoStorageVersionError,
} from "./storage-codec";

const STORAGE_KEY = "tapit:demo-state:v1";
const SESSION_KEY = "tapit:demo-session:v1";
export type DemoSession = {
  email: string;
  role: "customer" | "admin";
};

export type DemoAccessSnapshot = Readonly<{
  state: DemoState;
  session: DemoSession | null;
}>;

export type DemoAccessUnavailableReason =
  | "storage-unavailable"
  | "saved-demo-data-unreadable"
  | "saved-demo-data-unsupported"
  | "changed-during-refresh";

export type DemoAccessRefresh =
  | { kind: "ready"; snapshot: DemoAccessSnapshot }
  | { kind: "unavailable"; reason: DemoAccessUnavailableReason };

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
let persistedRaw: string | null = null;
let storageWriteBlock: StateWriteBlock | null = null;
let storageListenerAttached = false;
const listeners = new Set<() => void>();

type StateStorageRead =
  | { kind: "supported"; raw: string; state: DemoState }
  | { kind: "missing" }
  | { kind: "malformed"; raw: string }
  | { kind: "unsupported"; raw: string; error: UnsupportedDemoStorageVersionError }
  | { kind: "unavailable"; error: unknown };

type StateWriteBlock = Extract<
  StateStorageRead,
  { kind: "malformed" | "unsupported" | "unavailable" }
>;

type SessionStorageRead =
  | { kind: "supported"; raw: string | null; session: DemoSession | null }
  | { kind: "malformed"; raw: string }
  | { kind: "unavailable"; error: unknown };

type StorageValueRead =
  { kind: "read"; raw: string | null } | { kind: "unavailable"; error: unknown };

function notify() {
  for (const listener of listeners) listener();
}

function readStorageValue(key: string): StorageValueRead {
  if (typeof window === "undefined") return { kind: "unavailable", error: new Error() };
  try {
    return { kind: "read", raw: window.localStorage.getItem(key) };
  } catch (error) {
    return { kind: "unavailable", error };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isHttpsCardDesignUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function isCardOrderPaymentMethod(value: unknown): value is DemoCardOrderPaymentMethod {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.provider === "string" &&
    typeof value.label === "string" &&
    typeof value.accountDetails === "string" &&
    typeof value.instructions === "string" &&
    typeof value.active === "boolean" &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
  );
}

function isCardOrderReferralCode(value: unknown): value is DemoCardOrderReferralCode {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.referrerLabel === "string" &&
    (value.fixedPriceCentavos === undefined ||
      isValidReferralFixedPriceCentavos(value.fixedPriceCentavos)) &&
    typeof value.active === "boolean" &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
  );
}

function isCardOrder(value: unknown): value is DemoCardOrder {
  if (!isRecord(value) || !isRecord(value.paymentSnapshot) || !isRecord(value.designSource)) {
    return false;
  }

  const { designSource, backDesignSource, paymentSnapshot, referralSnapshot } = value;
  const isCardOrderDesignSource = (source: unknown): boolean => {
    if (!isRecord(source)) return false;
    return (
      (source.kind === "upload" &&
        !("url" in source) &&
        typeof source.assetKey === "string" &&
        typeof source.fileName === "string" &&
        (source.contentType === "image/jpeg" || source.contentType === "image/png") &&
        isNonNegativeSafeInteger(source.byteSize)) ||
      (source.kind === "url" &&
        !("assetKey" in source) &&
        !("fileName" in source) &&
        !("contentType" in source) &&
        !("byteSize" in source) &&
        isHttpsCardDesignUrl(source.url))
    );
  };
  const hasValidReferralSnapshot =
    referralSnapshot === undefined ||
    (isRecord(referralSnapshot) &&
      typeof referralSnapshot.code === "string" &&
      typeof referralSnapshot.referrerLabel === "string");

  return (
    typeof value.id === "string" &&
    typeof value.customerId === "string" &&
    value.quantity === 1 &&
    isCardOrderDesignSource(designSource) &&
    (backDesignSource === undefined || isCardOrderDesignSource(backDesignSource)) &&
    typeof value.deliveryName === "string" &&
    typeof value.deliveryPhone === "string" &&
    typeof value.deliveryAddress === "string" &&
    isNonNegativeSafeInteger(value.cardPriceCentavos) &&
    isNonNegativeSafeInteger(value.discountCentavos) &&
    (value.shippingQuoteCentavos === undefined ||
      isNonNegativeSafeInteger(value.shippingQuoteCentavos)) &&
    typeof value.paymentMethodId === "string" &&
    typeof paymentSnapshot.provider === "string" &&
    typeof paymentSnapshot.label === "string" &&
    typeof paymentSnapshot.accountDetails === "string" &&
    typeof paymentSnapshot.instructions === "string" &&
    (value.referralCodeId === undefined || typeof value.referralCodeId === "string") &&
    hasValidReferralSnapshot &&
    (value.paymentStatus === "unpaid" ||
      value.paymentStatus === "received" ||
      value.paymentStatus === "refunded") &&
    (value.fulfillmentStatus === "awaiting_shipping_quote" ||
      value.fulfillmentStatus === "awaiting_payment" ||
      value.fulfillmentStatus === "processing" ||
      value.fulfillmentStatus === "delivered" ||
      value.fulfillmentStatus === "cancelled") &&
    (value.commissionStatus === "none" ||
      value.commissionStatus === "pending" ||
      value.commissionStatus === "eligible" ||
      value.commissionStatus === "paid" ||
      value.commissionStatus === "void") &&
    isNonNegativeSafeInteger(value.commissionCentavos) &&
    (value.payoutReference === undefined || typeof value.payoutReference === "string") &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
  );
}

function normalizeCollection<T>(value: unknown, isItem: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(isItem) : [];
}

function normalizeStoredState(raw: string): StateStorageRead {
  let decoded: unknown;
  try {
    decoded = deserializeDemoState(raw);
  } catch (error) {
    return error instanceof UnsupportedDemoStorageVersionError
      ? { kind: "unsupported", raw, error }
      : { kind: "malformed", raw };
  }

  if (
    !isRecord(decoded) ||
    !isRecord(decoded.profile) ||
    typeof decoded.profile.id !== "string" ||
    !Array.isArray(decoded.cards) ||
    !Array.isArray(decoded.customers)
  ) {
    return { kind: "malformed", raw };
  }

  const parsed = decoded as Partial<DemoState> & {
    profile: DemoProfile;
    cards: DemoState["cards"];
    customers: DemoState["customers"];
  };
  const fallback = createDefaultDemoState();
  const profiles =
    Array.isArray(parsed.profiles) && parsed.profiles.length > 0
      ? parsed.profiles
      : [{ ...parsed.profile, theme: parsed.theme ?? fallback.theme }];
  const adminProfile = fallback.profiles.find((profile) => profile.ownerId === "admin-demo");
  if (adminProfile && !profiles.some((profile) => profile.ownerId === "admin-demo")) {
    profiles.push(adminProfile);
  }
  const customers = parsed.customers.map((customer) =>
    customer.id === "admin-demo" && !customer.profileId
      ? { ...customer, profileId: adminProfile?.id }
      : customer,
  );
  const cards = parsed.cards.map((card, index) => ({
    ...card,
    // Older demo records were appended in creation order and had no timestamp.
    createdAt: card.createdAt ?? index,
  }));
  const themes =
    parsed.themes ??
    Object.fromEntries(profiles.map((profile) => [profile.id, profile.theme ?? fallback.theme]));
  const nextState = {
    ...fallback,
    ...parsed,
    cards,
    cardOrderLaunchEndDate: isCardOrderLaunchEndDate(parsed.cardOrderLaunchEndDate)
      ? parsed.cardOrderLaunchEndDate
      : null,
    cardOrderPaymentMethods: normalizeCollection(
      parsed.cardOrderPaymentMethods,
      isCardOrderPaymentMethod,
    ),
    cardOrderReferralCodes: normalizeCollection(
      parsed.cardOrderReferralCodes,
      isCardOrderReferralCode,
    ),
    cardOrders: normalizeCollection(parsed.cardOrders, isCardOrder),
    customers,
    profiles,
    themes: { ...fallback.themes, ...themes },
    profile: parsed.profile,
    analytics: (parsed.analytics ?? fallback.analytics).map((bucket) => ({
      ...bucket,
      profileId: bucket.profileId ?? parsed.profile?.id,
    })),
  } as DemoState;

  return { kind: "supported", raw, state: nextState };
}

function readStoredState(): StateStorageRead {
  const stored = readStorageValue(STORAGE_KEY);
  if (stored.kind === "unavailable") return stored;
  if (stored.raw === null) return { kind: "missing" };
  if (stored.raw === persistedRaw && storageWriteBlock === null) {
    return { kind: "supported", raw: stored.raw, state };
  }
  return normalizeStoredState(stored.raw);
}

function isDemoSession(value: unknown): value is DemoSession {
  return (
    isRecord(value) &&
    typeof value.email === "string" &&
    value.email === value.email.trim().toLowerCase() &&
    value.email.includes("@") &&
    (value.role === "customer" || value.role === "admin")
  );
}

function readStoredSession(): SessionStorageRead {
  const stored = readStorageValue(SESSION_KEY);
  if (stored.kind === "unavailable") return stored;
  if (stored.raw === null) return { kind: "supported", raw: null, session: null };
  try {
    const parsed: unknown = JSON.parse(stored.raw);
    return isDemoSession(parsed)
      ? { kind: "supported", raw: stored.raw, session: parsed }
      : { kind: "malformed", raw: stored.raw };
  } catch {
    return { kind: "malformed", raw: stored.raw };
  }
}

function safeDemoState(): DemoState {
  return { ...createDefaultDemoState(), customers: [] };
}

function isSameStorageBlock(previous: StateWriteBlock | null, next: StateWriteBlock): boolean {
  if (previous === null || previous.kind !== next.kind) return false;
  if ("raw" in previous && "raw" in next) return previous.raw === next.raw;
  return true;
}

function installStoredState(read: StateStorageRead): boolean {
  if (read.kind === "supported") {
    const changed = read.raw !== persistedRaw || storageWriteBlock !== null;
    if (changed) state = read.state;
    persistedRaw = read.raw;
    storageWriteBlock = null;
    return changed;
  }
  if (read.kind === "missing") {
    const changed = persistedRaw !== null || storageWriteBlock !== null || state !== serverSnapshot;
    state = serverSnapshot;
    persistedRaw = null;
    storageWriteBlock = null;
    return changed;
  }

  const changed = !isSameStorageBlock(storageWriteBlock, read);
  const safeStateChanged = changed || state.customers.length > 0;
  storageWriteBlock = read;
  if (safeStateChanged) state = safeDemoState();
  return safeStateChanged;
}

function sameSession(left: DemoSession | null, right: DemoSession | null): boolean {
  return (
    left === right ||
    (left !== null && right !== null && left.email === right.email && left.role === right.role)
  );
}

function installStoredSession(read: SessionStorageRead): boolean {
  const nextSession = read.kind === "supported" ? read.session : null;
  const changed = !sameSession(session, nextSession);
  if (changed) session = nextSession;
  sessionLoaded = true;
  return changed;
}

function loadFromStorage() {
  if (typeof window === "undefined" || loaded) return;
  loaded = true;
  installStoredState(readStoredState());
}

function loadSession() {
  if (typeof window === "undefined" || sessionLoaded) return;
  sessionLoaded = true;
  installStoredSession(readStoredSession());
}

function reconcileStoredState(): boolean {
  return installStoredState(readStoredState());
}

function reconcileStoredSession(): boolean {
  return installStoredSession(readStoredSession());
}

function onDemoStorage(event: StorageEvent) {
  if (typeof window === "undefined") return;
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  if (event.storageArea !== storage) return;

  let changed = false;
  if (event.key === null || event.key === STORAGE_KEY) {
    changed = reconcileStoredState() || changed;
  }
  if (event.key === null || event.key === SESSION_KEY) {
    changed = reconcileStoredSession() || changed;
  }
  if (changed) notify();
}

function blockError(block: StateWriteBlock): Error {
  switch (block.kind) {
    case "malformed":
      return new Error("Saved demo data is malformed.");
    case "unsupported":
      return block.error;
    case "unavailable":
      return block.error instanceof Error
        ? block.error
        : new Error("Saved demo data is unavailable.");
  }
}

function refreshFailureReason(
  stateRead: StateStorageRead,
  sessionRead: SessionStorageRead,
): DemoAccessUnavailableReason | null {
  if (stateRead.kind === "unsupported") return "saved-demo-data-unsupported";
  if (stateRead.kind === "malformed" || sessionRead.kind === "malformed") {
    return "saved-demo-data-unreadable";
  }
  if (stateRead.kind === "unavailable" || sessionRead.kind === "unavailable") {
    return "storage-unavailable";
  }
  return null;
}

export function refreshDemoAccessSnapshot(): DemoAccessRefresh {
  loadFromStorage();
  loadSession();
  const stateRead = readStoredState();
  const sessionRead = readStoredSession();
  const failureReason = refreshFailureReason(stateRead, sessionRead);
  if (failureReason !== null) {
    let changed = false;
    if (stateRead.kind !== "supported" && stateRead.kind !== "missing") {
      changed = installStoredState(stateRead) || changed;
    }
    if (sessionRead.kind !== "supported") {
      changed = installStoredSession(sessionRead) || changed;
    }
    if (changed) notify();
    return { kind: "unavailable", reason: failureReason };
  }
  if (stateRead.kind !== "supported" && stateRead.kind !== "missing") {
    return { kind: "unavailable", reason: "storage-unavailable" };
  }
  if (sessionRead.kind !== "supported") {
    return { kind: "unavailable", reason: "storage-unavailable" };
  }

  const expectedStateRaw = stateRead.kind === "supported" ? stateRead.raw : null;
  const currentState = readStorageValue(STORAGE_KEY);
  const currentSession = readStorageValue(SESSION_KEY);
  if (currentState.kind === "unavailable" || currentSession.kind === "unavailable") {
    return { kind: "unavailable", reason: "storage-unavailable" };
  }
  if (currentState.raw !== expectedStateRaw || currentSession.raw !== sessionRead.raw) {
    return { kind: "unavailable", reason: "changed-during-refresh" };
  }

  const stateChanged = installStoredState(stateRead);
  const sessionChanged = installStoredSession(sessionRead);
  if (stateChanged || sessionChanged) notify();
  return { kind: "ready", snapshot: { state, session } };
}

function persist(nextState: DemoState, allowChangedStorage = false) {
  if (typeof window === "undefined") return;
  if (!loaded) loadFromStorage();
  if (!allowChangedStorage && storageWriteBlock !== null) {
    throw persistenceError(blockError(storageWriteBlock));
  }
  let storage: Storage;
  let previousRaw: string | null;
  try {
    storage = window.localStorage;
    previousRaw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    throw persistenceError(error);
  }
  if (allowChangedStorage) {
    const currentRead: StateStorageRead =
      previousRaw === null ? { kind: "missing" } : normalizeStoredState(previousRaw);
    if (
      currentRead.kind === "malformed" ||
      currentRead.kind === "unsupported" ||
      currentRead.kind === "unavailable"
    ) {
      if (installStoredState(currentRead)) notify();
      throw persistenceError(blockError(currentRead));
    }
    storageWriteBlock = null;
  }
  if (!allowChangedStorage && previousRaw !== persistedRaw) {
    throw persistenceError(new Error("Saved data changed in another tab. Reload before saving."));
  }
  let serialized: string;
  try {
    serialized = serializeDemoState(nextState);
  } catch (error) {
    throw persistenceError(error);
  }
  if (!allowChangedStorage) {
    let currentRaw: string | null;
    try {
      currentRaw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      throw persistenceError(error);
    }
    if (currentRaw !== previousRaw) {
      throw persistenceError(new Error("Saved data changed in another tab. Reload before saving."));
    }
  }
  try {
    storage.setItem(STORAGE_KEY, serialized);
    persistedRaw = serialized;
  } catch (error) {
    try {
      if (previousRaw === null) storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, previousRaw);
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
  const isFirstSubscriber = listeners.size === 0;
  listeners.add(listener);
  if (isFirstSubscriber && typeof window !== "undefined") {
    window.addEventListener("storage", onDemoStorage);
    storageListenerAttached = true;
    const stateChanged = reconcileStoredState();
    const sessionChanged = reconcileStoredSession();
    if (stateChanged || sessionChanged) notify();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && storageListenerAttached && typeof window !== "undefined") {
      window.removeEventListener("storage", onDemoStorage);
      storageListenerAttached = false;
    }
  };
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

export type DemoSessionResolution =
  | { kind: "guest" }
  | {
      kind: "active";
      account: DemoCustomer & { role: "customer" };
      profile: DemoProfile;
    }
  | {
      kind: "active";
      account: DemoCustomer & { role: "admin" };
      profile: DemoProfile | null;
    }
  | { kind: "restricted"; reason: "invitation" | "inactive" };

export function resolveDemoSessionAccess(
  current: DemoState,
  currentSession: DemoSession | null,
): DemoSessionResolution {
  if (currentSession === null) return { kind: "guest" };

  const account = current.customers.find((candidate) => candidate.email === currentSession.email);
  if (account === undefined) return { kind: "restricted", reason: "inactive" };
  if (account.deletionStatus !== "active" || account.status === "deleted") {
    return { kind: "restricted", reason: "inactive" };
  }
  if (account.status === "invited") return { kind: "restricted", reason: "invitation" };
  if (account.status !== "active") return { kind: "restricted", reason: "inactive" };

  const profile = getDemoProfileById(current, account.profileId);
  if (account.profileId !== undefined && profile?.ownerId !== account.id) {
    return { kind: "restricted", reason: "inactive" };
  }
  if (account.role === "customer") {
    if (profile === undefined || profile.ownerId !== account.id) {
      return { kind: "restricted", reason: "inactive" };
    }
    const customer = { ...account, role: "customer" } satisfies DemoCustomer & {
      role: "customer";
    };
    return { kind: "active", account: customer, profile };
  }
  if (account.role === "admin") {
    const admin = { ...account, role: "admin" } satisfies DemoCustomer & { role: "admin" };
    return { kind: "active", account: admin, profile: profile ?? null };
  }
  return { kind: "restricted", reason: "inactive" };
}

export function getDemoProfileForSession(
  current: DemoState,
  currentSession: DemoSession | null,
): DemoProfile {
  const access = resolveDemoSessionAccess(current, currentSession);
  if (access.kind === "active" && access.profile !== null) return access.profile;
  throw new Error("Personal profile access denied.");
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
    themes: current.themes,
  };
}

export function updateDemoTheme(
  current: DemoState,
  profileId: string,
  theme: ProfileTheme,
): DemoState {
  const existing = getDemoProfileById(current, profileId);
  if (existing === undefined) return current;
  const profiles = getDemoProfiles(current).map((profile) =>
    profile.id === profileId ? { ...profile, theme } : profile,
  );
  return {
    ...current,
    profiles,
    profile: current.profile.id === profileId ? { ...current.profile, theme } : current.profile,
    themes: { ...current.themes, [profileId]: theme },
  };
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
      draft: {
        name,
        slug,
        email,
        links: [],
      },
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
  persist(nextState, true);
  state = nextState;
  notify();
}

export function getDemoSession(): DemoSession | null {
  loadSession();
  return session;
}

export function setDemoSession(nextSession: DemoSession): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } catch (error) {
      throw persistenceError(error);
    }
  }
  session = nextSession;
  sessionLoaded = true;
  notify();
}

export function clearDemoSession(): boolean {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      return false;
    }
  }
  session = null;
  sessionLoaded = true;
  notify();
  return true;
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
