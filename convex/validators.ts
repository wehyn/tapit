import { v } from "convex/values";

export const MAX_PROFILE_LINKS = 100;
const MAX_PROFILE_NAME_LENGTH = 120;
const MAX_PROFILE_SLUG_LENGTH = 64;
const MAX_PROFILE_BIO_LENGTH = 140;
const MAX_PROFILE_FIELD_LENGTH = 320;
const MAX_LINK_ID_LENGTH = 160;
const MAX_LINK_LABEL_LENGTH = 120;
const MAX_DESTINATION_LENGTH = 2048;

export const linkIconValidator = v.union(
  v.literal("link"),
  v.literal("mail"),
  v.literal("phone"),
  v.literal("calendar"),
  v.literal("linkedin"),
  v.literal("instagram"),
  v.literal("globe"),
);

export const linkValidator = v.object({
  id: v.string(),
  label: v.string(),
  destination: v.string(),
  enabled: v.boolean(),
  icon: v.optional(v.string()),
});

export const profileThemeValidator = v.union(
  v.literal("paper"),
  v.literal("moss"),
  v.literal("night"),
);

export const profileContentValidator = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  theme: v.optional(profileThemeValidator),
  links: v.array(linkValidator),
});

export const profileStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("unpublished"),
  v.literal("suspended"),
);

export const publicProfileValidator = v.object({
  id: v.id("profiles"),
  slug: v.string(),
  name: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  theme: profileThemeValidator,
  links: v.array(linkValidator),
});

export function isSafeDestination(destination: string): boolean {
  if (!destination.trim()) return false;
  try {
    const parsed = new URL(destination);
    if (parsed.protocol === "https:") return parsed.hostname.length > 0;
    if (parsed.protocol === "mailto:")
      return parsed.pathname.length > 0 && !/[\s<>]/.test(parsed.pathname);
    return parsed.protocol === "tel:" && /^[0-9+().\- x#*]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function fieldTooLong(value: string, max: number): boolean {
  return value.length > max;
}

export function validateDraftSafety(content: {
  name: string;
  slug: string;
  bio?: string;
  imageUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  links: Array<{
    id: string;
    label: string;
    destination: string;
    enabled: boolean;
    icon?: string;
  }>;
}): string[] {
  const errors: string[] = [];
  if (content.links.length > MAX_PROFILE_LINKS)
    errors.push("A profile cannot contain more than 100 links.");
  if (fieldTooLong(content.name, MAX_PROFILE_NAME_LENGTH))
    errors.push("The profile name is too long.");
  if (fieldTooLong(content.slug, MAX_PROFILE_SLUG_LENGTH))
    errors.push("The profile slug is too long.");
  if (content.bio !== undefined && fieldTooLong(content.bio, MAX_PROFILE_BIO_LENGTH))
    errors.push("The profile bio is too long.");
  for (const field of [content.imageUrl, content.email, content.phone, content.website]) {
    if (field !== undefined && fieldTooLong(field, MAX_PROFILE_FIELD_LENGTH))
      errors.push("A profile field is too long.");
  }
  const seenIds = new Set<string>();
  for (const link of content.links) {
    if (!link.id.trim()) errors.push("Every link needs a valid ID.");
    if (
      link.icon !== undefined &&
      !["link", "mail", "phone", "calendar", "linkedin", "instagram", "globe"].includes(link.icon)
    )
      errors.push("Every link must use a supported icon.");
    if (fieldTooLong(link.id, MAX_LINK_ID_LENGTH)) errors.push("A link ID is too long.");
    if (fieldTooLong(link.label, MAX_LINK_LABEL_LENGTH)) errors.push("A link label is too long.");
    if (fieldTooLong(link.destination, MAX_DESTINATION_LENGTH))
      errors.push("A link destination is too long.");
    if (seenIds.has(link.id)) errors.push("Duplicate link IDs are not allowed.");
    seenIds.add(link.id);
    if (link.destination.trim() && !isSafeDestination(link.destination))
      errors.push("Every nonblank link needs a safe destination.");
  }
  return errors;
}

export function validateProfileContent(content: {
  name: string;
  slug: string;
  bio?: string;
  imageUrl?: string;
  email?: string;
  phone?: string;
  website?: string;
  links: Array<{
    id: string;
    label: string;
    destination: string;
    enabled: boolean;
    icon?: string;
  }>;
}): string[] {
  const errors = validateDraftSafety(content);
  if (!content.name.trim()) errors.push("A nonblank profile name is required.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.slug)) errors.push("The profile slug is invalid.");
  const seen = new Set<string>();
  for (const link of content.links) {
    if (!link.enabled) continue;
    if (!link.label.trim() || !isSafeDestination(link.destination))
      errors.push("Every enabled link needs a label and safe destination.");
    const normalizedDestination = link.destination.trim().toLowerCase();
    if (normalizedDestination && seen.has(normalizedDestination))
      errors.push("Duplicate link destinations are not allowed.");
    if (normalizedDestination) seen.add(normalizedDestination);
  }
  if (
    content.links.filter(
      (link) => link.enabled && link.label.trim() && isSafeDestination(link.destination),
    ).length === 0
  ) {
    errors.push("At least one valid enabled link is required.");
  }
  return errors;
}
