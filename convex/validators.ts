import { v } from "convex/values";
import {
  validateProfileCustomization,
  type ProfileAppearanceTheme,
} from "../src/lib/profile-customization";
import { validateProfileMedia } from "../src/lib/profile-media";

export const MAX_PROFILE_LINKS = 100;
export const CLAIM_CODE_LENGTH = 8;
export const cardStatusValidator = v.union(
  v.literal("registered"),
  v.literal("claimable"),
  v.literal("active"),
  v.literal("inactive"),
  v.literal("replaced"),
);
export const analyticsSourceValidator = v.union(
  v.literal("nfc"),
  v.literal("qr"),
  v.literal("direct"),
  v.literal("unknown"),
);
const MAX_PROFILE_NAME_LENGTH = 120;
export const MAX_PROFILE_SLUG_LENGTH = 64;
export const RESERVED_PROFILE_SLUGS = new Set(["admin", "api", "app", "c", "login", "setup"]);
const MAX_PROFILE_BIO_LENGTH = 140;
const MAX_PROFILE_FIELD_LENGTH = 320;
const MAX_LINK_ID_LENGTH = 160;
const MAX_LINK_LABEL_LENGTH = 120;
const MAX_DESTINATION_LENGTH = 2048;
const WEBSITE_ERROR = "A profile website must be a valid HTTPS URL without credentials.";

function hasBackgroundMedia(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "background" in value &&
    (value as { background?: unknown }).background !== undefined
  );
}

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
  v.literal("custom"),
);

const profileCustomizationSectionValidator = v.union(
  v.object({ kind: v.literal("about"), body: v.string() }),
  v.object({
    kind: v.literal("services"),
    body: v.string(),
    items: v.optional(v.array(v.string())),
  }),
);

const profileIdentityColorPresetValidator = v.union(
  v.literal("default"),
  v.literal("coral"),
  v.literal("jade"),
  v.literal("ink"),
);

const profileIdentityColorValidator = v.union(
  v.object({ kind: v.literal("preset"), value: profileIdentityColorPresetValidator }),
  v.object({ kind: v.literal("custom"), hex: v.string() }),
);

const profileIdentityColorsValidator = v.object({
  name: v.optional(profileIdentityColorValidator),
  bio: v.optional(profileIdentityColorValidator),
});

export const profileCustomizationValidator = v.object({
  preset: v.union(
    v.literal("paper"),
    v.literal("moss"),
    v.literal("night"),
    v.literal("warm-studio"),
    v.literal("custom"),
  ),
  accent: v.union(v.literal("coral"), v.literal("jade"), v.literal("ink")),
  typeScale: v.union(v.literal("compact"), v.literal("comfortable"), v.literal("editorial")),
  linkTreatment: v.union(v.literal("filled"), v.literal("outlined")),
  contentOrder: v.union(v.literal("links-first"), v.literal("section-first")),
  contactDisplay: v.optional(
    v.union(v.literal("labels"), v.literal("icons-circle"), v.literal("icons-soft-square")),
  ),
  customColors: v.optional(
    v.object({
      canvas: v.string(),
      surface: v.string(),
      ink: v.string(),
      accent: v.string(),
    }),
  ),
  identityColors: v.optional(profileIdentityColorsValidator),
  featuredLinkId: v.optional(v.string()),
  section: v.optional(profileCustomizationSectionValidator),
});

export const profileRedirectValidator = v.object({
  enabled: v.boolean(),
  destination: v.string(),
});

const profileMediaPersistedImageValidator = v.object({
  assetId: v.id("profileMediaAssets"),
  altText: v.string(),
});
export const profileMediaPersistedValidator = v.object({
  background: v.optional(
    v.object({
      assetId: v.id("profileMediaAssets"),
      altText: v.string(),
      positionX: v.number(),
      positionY: v.number(),
    }),
  ),
  heroHeight: v.number(),
  slideshow: v.array(profileMediaPersistedImageValidator),
  autoplay: v.boolean(),
});
const profileMediaOwnerImageValidator = v.object({
  assetId: v.id("profileMediaAssets"),
  altText: v.string(),
  url: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
});
export const profileMediaValidator = v.object({
  background: v.optional(
    v.object({
      assetId: v.id("profileMediaAssets"),
      altText: v.string(),
      positionX: v.number(),
      positionY: v.number(),
      url: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
    }),
  ),
  heroHeight: v.number(),
  slideshow: v.array(profileMediaOwnerImageValidator),
  autoplay: v.boolean(),
});
const publicProfileMediaImageValidator = v.object({ src: v.string(), alt: v.string() });
export const publicProfileMediaValidator = v.object({
  background: v.optional(
    publicProfileMediaImageValidator.extend({ positionX: v.number(), positionY: v.number() }),
  ),
  heroHeight: v.number(),
  slideshow: v.array(publicProfileMediaImageValidator),
  autoplay: v.boolean(),
});

export const profileContentValidator = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  imageStorageId: v.optional(v.id("_storage")),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  theme: v.optional(profileThemeValidator),
  customization: v.optional(profileCustomizationValidator),
  media: v.optional(profileMediaValidator),
  redirect: v.optional(profileRedirectValidator),
  links: v.array(linkValidator),
});

// Save-draft callers may explicitly clear media with null. Persisted profile
// content remains URL-free and represents absence by omitting this field.
export const saveDraftContentValidator = profileContentValidator.extend({
  media: v.optional(v.union(v.null(), profileMediaValidator)),
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
  imageSrcSet: v.optional(v.string()),
  media: v.optional(publicProfileMediaValidator),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  redirectDestination: v.optional(v.string()),
  theme: profileThemeValidator,
  customization: v.optional(profileCustomizationValidator),
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

const REDIRECT_DESTINATION_ERROR =
  "Redirect destination must be a valid HTTPS URL without credentials.";

function isSafeRedirectDestination(destination: string): boolean {
  if (!destination.trim()) return false;
  try {
    const parsed = new URL(destination);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
}

export function validateRedirectDestination(destination: string): string | null {
  return isSafeRedirectDestination(destination) ? null : REDIRECT_DESTINATION_ERROR;
}

function isSafeWebsite(website: string): boolean {
  if (!website.trim()) return true;
  try {
    const parsed = new URL(website);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0
    );
  } catch {
    return false;
  }
}

export function normalizeProfileSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function validateProfileSlugValue(
  value: string,
  options: { existingSlugs?: readonly string[]; immutableSlug?: string } = {},
): string | null {
  const slug = normalizeProfileSlug(value);
  if (
    slug.length === 0 ||
    slug.length > MAX_PROFILE_SLUG_LENGTH ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  )
    return "The profile slug is invalid.";
  if (RESERVED_PROFILE_SLUGS.has(slug)) return "That profile slug is reserved.";
  if (options.immutableSlug !== undefined && slug !== options.immutableSlug)
    return "The assigned profile slug cannot change except through an administrator.";
  if (options.existingSlugs?.some((existingSlug) => existingSlug === slug))
    return "That profile slug is already in use.";
  return null;
}

function fieldTooLong(value: string, max: number): boolean {
  return value.length > max;
}

export function validateDraftSafety(content: {
  name: string;
  slug: string;
  bio?: string;
  imageUrl?: string;
  imageStorageId?: string;
  email?: string;
  phone?: string;
  website?: string;
  theme?: ProfileAppearanceTheme;
  redirect?: { enabled: boolean; destination: string };
  customization?: unknown;
  media?: unknown;
  links: Array<{
    id: string;
    label: string;
    destination: string;
    enabled: boolean;
    icon?: string;
  }>;
}): string[] {
  const errors: string[] = [];
  if (content.redirect?.enabled) {
    const redirectError = validateRedirectDestination(content.redirect.destination);
    if (redirectError !== null) errors.push(redirectError);
  }
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
  if (content.website !== undefined && !isSafeWebsite(content.website)) errors.push(WEBSITE_ERROR);
  errors.push(
    ...validateProfileCustomization(
      content.customization as Parameters<typeof validateProfileCustomization>[0],
      [],
      { allowWhite: hasBackgroundMedia(content.media), activeTheme: content.theme },
    ),
  );
  errors.push(...validateProfileMedia(content.media));
  const seenIds = new Set<string>();
  for (const link of content.links) {
    if (!link.id.trim()) errors.push("Every link needs a valid ID.");
    if (
      link.icon !== undefined &&
      ![
        "link",
        "mail",
        "phone",
        "calendar",
        "linkedin",
        "instagram",
        "globe",
        "briefcase",
        "images",
        "palette",
        "code",
        "camera",
        "github",
      ].includes(link.icon)
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
  redirect?: { enabled: boolean; destination: string };
  customization?: unknown;
  media?: unknown;
  links: Array<{
    id: string;
    label: string;
    destination: string;
    enabled: boolean;
    icon?: string;
  }>;
}): string[] {
  const errors: string[] = [];
  const slugError = validateProfileSlugValue(content.slug);
  if (slugError !== null) errors.push(slugError);
  errors.push(...validateDraftSafety(content));
  if (!content.name.trim()) errors.push("A nonblank profile name is required.");
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
