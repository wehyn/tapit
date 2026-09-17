/** Shared, persistence-agnostic domain rules for profiles, links, cards, and access. */

import type { Id } from "../../../convex/_generated/dataModel";

export type Role = "customer" | "admin";
export type ProfileStatus = "draft" | "published" | "unpublished" | "suspended";
export type CardStatus = "registered" | "claimable" | "active" | "inactive" | "replaced";
export type AnalyticsSource = "nfc" | "qr" | "direct" | "unknown";
export type DeletionStatus = "active" | "requested" | "deleted";
export type ProfileTheme = "paper" | "moss" | "night";

export interface Actor {
  id: string;
  role: Role;
}

export type LinkIcon = "link" | "mail" | "phone" | "calendar" | "linkedin" | "instagram" | "globe";

export interface ProfileLink {
  id: string;
  label: string;
  destination: string;
  enabled: boolean;
  icon?: LinkIcon;
}

export interface ProfileRedirect {
  enabled: boolean;
  destination: string;
}

export interface ProfileContent {
  name: string;
  slug: string;
  bio?: string;
  imageUrl?: string;
  imageStorageId?: Id<"_storage">;
  email?: string;
  phone?: string;
  website?: string;
  theme?: ProfileTheme;
  redirect?: ProfileRedirect;
  links: ProfileLink[];
}

export interface PublishedProfileSnapshot extends ProfileContent {
  publishedAt: string;
}

export interface ProfileRecord {
  id: string;
  ownerId: string;
  status: ProfileStatus;
  draft: ProfileContent;
  published: PublishedProfileSnapshot | null;
}

export interface PublicProfileProjection {
  id: string;
  slug: string;
  name: string;
  bio?: string;
  imageUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  theme: ProfileTheme;
  links: ProfileLink[];
}

export interface CardRecord {
  id: string;
  cardUrl: string;
  status: CardStatus;
  profileId?: string;
  replacedByCardId?: string;
}

export interface DeletionAuditPayload {
  action: "account.deletion";
  actorId: string;
  accountId: string;
  profileId: string;
  occurredAt: string;
  before: {
    profileStatus: ProfileStatus;
    cardIds: string[];
  };
  after: {
    profileStatus: "unpublished";
    cardStatus: "inactive";
    cardIds: string[];
  };
}

export interface DeletionTransition {
  profile: ProfileRecord;
  cards: CardRecord[];
}

export interface ProfileSlugValidationOptions {
  existingSlugs?: readonly string[];
  immutableSlug?: string;
}

export const MAX_PROFILE_SLUG_LENGTH = 64;
export const RESERVED_PROFILE_SLUGS = new Set(["admin", "api", "app", "c", "login", "setup"]);

export type AccountStatus = "invited" | "active" | "deleted";

const LINK_SCHEMES = new Set(["https:", "mailto:", "tel:"]);
const INVALID_REDIRECT_DESTINATION =
  "Redirect destination must be a valid HTTPS URL without credentials.";

function nonblank(value: string): boolean {
  return value.trim().length > 0;
}

const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeProfileSlug(value: string): string {
  return value.trim().toLowerCase();
}

/** Returns a contract-compatible error for an invalid, duplicate, or changed slug. */
export function validateProfileSlug(
  slug: string,
  options: ProfileSlugValidationOptions = {},
): string | null {
  if (
    slug.length === 0 ||
    slug.length > MAX_PROFILE_SLUG_LENGTH ||
    !PROFILE_SLUG_PATTERN.test(slug)
  )
    return "The profile slug is invalid.";
  if (RESERVED_PROFILE_SLUGS.has(slug)) return "That profile slug is reserved.";
  if (options.immutableSlug !== undefined && slug !== options.immutableSlug) {
    return "The profile slug cannot change after first publication.";
  }
  if (options.existingSlugs?.some((existingSlug) => existingSlug === slug)) {
    return "That profile slug is already in use.";
  }
  return null;
}

export function isActiveAccount(
  accountStatus: AccountStatus | undefined,
  deletionStatus: DeletionStatus | undefined,
): boolean {
  return accountStatus === "active" && deletionStatus === "active";
}

/** Returns true only for non-empty HTTPS, mailto, or tel destinations. */
export function isAllowedLinkDestination(destination: string): boolean {
  if (!nonblank(destination)) return false;

  let parsed: URL;
  try {
    parsed = new URL(destination);
  } catch {
    return false;
  }

  if (!LINK_SCHEMES.has(parsed.protocol.toLowerCase())) return false;
  if (parsed.protocol.toLowerCase() === "https:") return nonblank(parsed.hostname);
  if (parsed.protocol.toLowerCase() === "mailto:") {
    return nonblank(parsed.pathname) && !/[\s<>]/.test(parsed.pathname);
  }
  return nonblank(parsed.pathname) && /^[0-9+().\- x#*]+$/.test(parsed.pathname);
}

export function validateLinkDestination(destination: string): string | null {
  return isAllowedLinkDestination(destination)
    ? null
    : "Link destination must be a valid HTTPS, mailto, or tel address.";
}

export function validateRedirectDestination(destination: string): string | null {
  if (!nonblank(destination)) return INVALID_REDIRECT_DESTINATION;

  try {
    const parsed = new URL(destination);
    if (
      parsed.protocol.toLowerCase() !== "https:" ||
      !nonblank(parsed.hostname) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return INVALID_REDIRECT_DESTINATION;
    }
  } catch {
    return INVALID_REDIRECT_DESTINATION;
  }

  return null;
}

export function validateProfileRedirect(redirect: ProfileRedirect | undefined): string | null {
  if (redirect === undefined || !redirect.enabled) return null;
  return validateRedirectDestination(redirect.destination);
}

export function validatePublicationAccess(
  profileStatus: ProfileStatus,
  accountStatus: AccountStatus | undefined,
  deletionStatus: DeletionStatus | undefined,
): string[] {
  return [
    ...(accountStatus !== "active" || deletionStatus !== "active"
      ? [
          "Your customer account is inactive or pending deletion. Contact support before publishing.",
        ]
      : []),
    ...(profileStatus === "suspended"
      ? ["This profile is suspended. Contact an administrator before publishing."]
      : []),
  ];
}

export function validEnabledLinks(links: readonly ProfileLink[]): ProfileLink[] {
  return links.filter(
    (link) => link.enabled && nonblank(link.label) && isAllowedLinkDestination(link.destination),
  );
}

function invalidEnabledLinks(links: readonly ProfileLink[]): boolean {
  return links.some(
    (link) =>
      link.enabled && (!nonblank(link.label) || !isAllowedLinkDestination(link.destination)),
  );
}

function duplicateEnabledLinkDestinations(links: readonly ProfileLink[]): boolean {
  const destinations = new Set<string>();
  for (const link of links) {
    if (!link.enabled) continue;
    const destination = link.destination.trim().toLowerCase();
    if (destination.length === 0) continue;
    if (destinations.has(destination)) return true;
    destinations.add(destination);
  }
  return false;
}

export function validatePublication(
  draft: ProfileContent,
  previous: PublishedProfileSnapshot | null,
  options: ProfileSlugValidationOptions = {},
): string[] {
  const errors: string[] = [];
  if (!nonblank(draft.name)) errors.push("A nonblank profile name is required.");
  if (!nonblank(draft.slug)) {
    errors.push("A profile slug is required.");
  } else {
    const slugError = validateProfileSlug(draft.slug, {
      ...options,
      immutableSlug: previous?.slug ?? options.immutableSlug,
    });
    if (slugError !== null) errors.push(slugError);
  }
  if (validEnabledLinks(draft.links).length === 0) {
    errors.push("At least one valid enabled link is required.");
  }
  if (invalidEnabledLinks(draft.links)) {
    errors.push("Every enabled link needs a label and safe destination.");
  }
  if (duplicateEnabledLinkDestinations(draft.links)) {
    errors.push("Duplicate enabled link destinations are not allowed.");
  }
  const redirectError = validateProfileRedirect(draft.redirect);
  if (redirectError !== null) errors.push(redirectError);
  return errors;
}

/** Promotes a valid draft while retaining the previous snapshot until success. */
export function publishProfile(
  profile: ProfileRecord,
  publishedAt: string,
  options: ProfileSlugValidationOptions = {},
): ProfileRecord {
  const errors = validatePublication(profile.draft, profile.published, options);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const snapshot: PublishedProfileSnapshot = {
    ...profile.draft,
    links: profile.draft.links.map((link) => ({ ...link })),
    ...(profile.draft.redirect === undefined
      ? {}
      : { redirect: { ...profile.draft.redirect } }),
    publishedAt,
  };
  return { ...profile, status: "published", published: snapshot };
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function hasUnpublishedChanges(
  draft: ProfileContent,
  published: PublishedProfileSnapshot | null | undefined,
): boolean {
  if (published === null || published === undefined) return true;
  const publishedContent = Object.fromEntries(
    Object.entries(published).filter(([key]) => key !== "publishedAt"),
  );
  return stableSerialize(draft) !== stableSerialize(publishedContent);
}

/** Projects only the last published snapshot; draft fields can never leak here. */
export function projectPublicProfile(profile: ProfileRecord): PublicProfileProjection | null {
  if (profile.status !== "published" || profile.published === null) return null;
  const snapshot = profile.published;
  return {
    id: profile.id,
    slug: snapshot.slug,
    name: snapshot.name,
    ...(snapshot.bio === undefined ? {} : { bio: snapshot.bio }),
    ...(snapshot.imageUrl === undefined ? {} : { imageUrl: snapshot.imageUrl }),
    ...(snapshot.email === undefined ? {} : { email: snapshot.email }),
    ...(snapshot.phone === undefined ? {} : { phone: snapshot.phone }),
    ...(snapshot.website === undefined ? {} : { website: snapshot.website }),
    theme: snapshot.theme ?? "paper",
    links: snapshot.links.filter((link) => link.enabled).map((link) => ({ ...link })),
  };
}

export function isAdministrator(actor: Actor): boolean {
  return actor.role === "admin";
}

export function ownsProfile(actor: Actor, profile: ProfileRecord): boolean {
  return actor.role === "customer" && actor.id === profile.ownerId;
}

export const isProfileOwner = ownsProfile;

export function canEditProfile(actor: Actor, profile: ProfileRecord): boolean {
  return isAdministrator(actor) || ownsProfile(actor, profile);
}

export function canPublishProfile(actor: Actor, profile: ProfileRecord): boolean {
  return canEditProfile(actor, profile);
}

export function canManageCard(actor: Actor): boolean {
  return isAdministrator(actor);
}

const CARD_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  registered: ["claimable"],
  claimable: ["active"],
  active: ["inactive", "replaced"],
  inactive: [],
  replaced: [],
};

export function canTransitionCard(from: CardStatus, to: CardStatus): boolean {
  return CARD_TRANSITIONS[from].includes(to);
}

export function transitionCard(
  card: CardRecord,
  to: CardStatus,
  profileId?: string,
  replacedByCardId?: string,
): CardRecord {
  if (!canTransitionCard(card.status, to)) {
    throw new Error(`Invalid card transition: ${card.status} -> ${to}.`);
  }
  if (to === "active" && (!profileId || !nonblank(profileId))) {
    throw new Error("An active card must be assigned to a profile.");
  }
  if (to === "replaced" && (!replacedByCardId || !nonblank(replacedByCardId))) {
    throw new Error("A replaced card must identify its replacement.");
  }
  return {
    ...card,
    status: to,
    ...(to === "active" ? { profileId } : {}),
    ...(to === "replaced" ? { replacedByCardId } : {}),
  };
}

export function requestDeletion(status: DeletionStatus): DeletionStatus {
  if (status !== "active") throw new Error("Only an active account can request deletion.");
  return "requested";
}

export function approveDeletion(status: DeletionStatus): DeletionStatus {
  if (status !== "requested") throw new Error("Deletion must be requested before approval.");
  return "deleted";
}

/** Immediately hides a profile and retires every card assigned to it. */
export function applyDeletion(
  profile: ProfileRecord,
  cards: readonly CardRecord[],
): DeletionTransition {
  return {
    profile: { ...profile, status: "unpublished" },
    cards: cards.map((card) =>
      card.profileId === profile.id && (card.status === "active" || card.status === "registered")
        ? { ...card, status: "inactive" }
        : { ...card },
    ),
  };
}

export function createDeletionAuditPayload(
  actor: Actor,
  accountId: string,
  profile: ProfileRecord,
  cards: readonly CardRecord[],
  occurredAt: string,
): DeletionAuditPayload {
  if (!isAdministrator(actor)) throw new Error("Only an administrator can approve deletion.");
  return {
    action: "account.deletion",
    actorId: actor.id,
    accountId,
    profileId: profile.id,
    occurredAt,
    before: { profileStatus: profile.status, cardIds: cards.map((card) => card.id) },
    after: {
      profileStatus: "unpublished",
      cardStatus: "inactive",
      cardIds: cards.map((card) => card.id),
    },
  };
}
