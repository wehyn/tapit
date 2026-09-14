/** Shared, persistence-agnostic domain rules for profiles, links, cards, and access. */

export type Role = "customer" | "admin";
export type ProfileStatus = "draft" | "published" | "unpublished" | "suspended";
export type CardStatus = "registered" | "active" | "inactive" | "replaced";
export type DeletionStatus = "active" | "requested" | "deleted";

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

export interface ProfileContent {
  name: string;
  slug: string;
  bio?: string;
  imageUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
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

const LINK_SCHEMES = new Set(["https:", "mailto:", "tel:"]);

function nonblank(value: string): boolean {
  return value.trim().length > 0;
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

export function validEnabledLinks(links: readonly ProfileLink[]): ProfileLink[] {
  return links.filter(
    (link) => link.enabled && nonblank(link.label) && isAllowedLinkDestination(link.destination),
  );
}

export function validatePublication(
  draft: ProfileContent,
  previous: PublishedProfileSnapshot | null,
): string[] {
  const errors: string[] = [];
  if (!nonblank(draft.name)) errors.push("A nonblank profile name is required.");
  if (!nonblank(draft.slug)) errors.push("A profile slug is required.");
  if (validEnabledLinks(draft.links).length === 0) {
    errors.push("At least one valid enabled link is required.");
  }
  if (previous !== null && draft.slug !== previous.slug) {
    errors.push("The profile slug cannot change after first publication.");
  }
  return errors;
}

/** Promotes a valid draft while retaining the previous snapshot until success. */
export function publishProfile(profile: ProfileRecord, publishedAt: string): ProfileRecord {
  const errors = validatePublication(profile.draft, profile.published);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const snapshot: PublishedProfileSnapshot = {
    ...profile.draft,
    links: profile.draft.links.map((link) => ({ ...link })),
    publishedAt,
  };
  return { ...profile, status: "published", published: snapshot };
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
  registered: ["active"],
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
