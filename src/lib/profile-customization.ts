import type { ProfileLink } from "./domain";

export type ProfileAccent = "coral" | "jade" | "ink";
export type ProfileIdentityColorPreset = "default" | "coral" | "jade" | "ink";
export type ProfileIdentityColor = ProfileIdentityColorPreset | { custom: string };
export interface ProfileIdentityColors {
  name?: ProfileIdentityColor;
  bio?: ProfileIdentityColor;
}
export type ProfileTypeScale = "compact" | "comfortable" | "editorial";
export type ProfileLinkTreatment = "filled" | "outlined";
export type ProfileContentOrder = "links-first" | "section-first";

export type ProfileSection =
  { kind: "about"; body: string } | { kind: "services"; body: string; items?: string[] };

export interface ContactAction {
  kind: "email" | "phone" | "website";
  href: string;
  label: "Email" | "Phone" | "Website";
}

export interface ProfileCustomization {
  preset: "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  contentOrder: ProfileContentOrder;
  identityColors?: ProfileIdentityColors;
  featuredLinkId?: string;
  section?: ProfileSection;
}

export interface ResolvedProfileAppearance {
  mode: "legacy" | "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  nameColor: string;
  bioColor: string;
}

export const DEFAULT_WARM_STUDIO_CUSTOMIZATION: ProfileCustomization = {
  preset: "warm-studio",
  accent: "coral",
  typeScale: "comfortable",
  linkTreatment: "filled",
  contentOrder: "links-first",
};

/** Returns only a complete, render-safe customization object from runtime data. */
export function normalizeProfileCustomization(value: unknown): ProfileCustomization | undefined {
  if (!isRecord(value)) return undefined;
  const baseCustomization = { ...value, section: undefined, identityColors: undefined };
  if (validateProfileCustomization(baseCustomization as unknown as ProfileCustomization).length > 0)
    return undefined;

  const normalized: ProfileCustomization = {
    preset: "warm-studio",
    accent: value.accent as ProfileAccent,
    typeScale: value.typeScale as ProfileTypeScale,
    linkTreatment: value.linkTreatment as ProfileLinkTreatment,
    contentOrder: value.contentOrder as ProfileContentOrder,
  };
  const identityColors = normalizeIdentityColors(value.identityColors);
  if (identityColors !== undefined) normalized.identityColors = identityColors;
  if (typeof value.featuredLinkId === "string") normalized.featuredLinkId = value.featuredLinkId;
  if (isRecord(value.section) && sectionErrors(value.section).length === 0) {
    if (value.section.kind === "about") {
      normalized.section = { kind: "about", body: value.section.body as string };
    } else {
      normalized.section = {
        kind: "services",
        body: value.section.body as string,
        ...(value.section.items === undefined
          ? {}
          : { items: [...(value.section.items as string[])] }),
      };
    }
  }
  return normalized;
}

export function resolveProfileAppearance(
  customization: ProfileCustomization | undefined,
): ResolvedProfileAppearance {
  if (customization === undefined) {
    return {
      mode: "legacy",
      accent: "coral",
      typeScale: "comfortable",
      linkTreatment: "filled",
      nameColor: IDENTITY_COLOR_DEFAULTS.name,
      bioColor: IDENTITY_COLOR_DEFAULTS.bio,
    };
  }

  const value = isRecord(customization) ? customization : undefined;
  return {
    mode: "warm-studio",
    accent:
      value?.preset === "warm-studio" && PROFILE_ACCENTS.has(value.accent as ProfileAccent)
        ? (value.accent as ProfileAccent)
        : DEFAULT_WARM_STUDIO_CUSTOMIZATION.accent,
    typeScale:
      value?.preset === "warm-studio" &&
      PROFILE_TYPE_SCALES.has(value.typeScale as ProfileTypeScale)
        ? (value.typeScale as ProfileTypeScale)
        : DEFAULT_WARM_STUDIO_CUSTOMIZATION.typeScale,
    linkTreatment:
      value?.preset === "warm-studio" &&
      PROFILE_LINK_TREATMENTS.has(value.linkTreatment as ProfileLinkTreatment)
        ? (value.linkTreatment as ProfileLinkTreatment)
        : DEFAULT_WARM_STUDIO_CUSTOMIZATION.linkTreatment,
    nameColor: resolveIdentityColor(value?.identityColors, "name"),
    bioColor: resolveIdentityColor(value?.identityColors, "bio"),
  };
}

const PROFILE_ACCENTS = new Set<ProfileAccent>(["coral", "jade", "ink"]);
const PROFILE_TYPE_SCALES = new Set<ProfileTypeScale>(["compact", "comfortable", "editorial"]);
const PROFILE_LINK_TREATMENTS = new Set<ProfileLinkTreatment>(["filled", "outlined"]);
const PROFILE_CONTENT_ORDERS = new Set<ProfileContentOrder>(["links-first", "section-first"]);
const PROFILE_IDENTITY_COLOR_PRESETS = new Set<ProfileIdentityColorPreset>([
  "default",
  "coral",
  "jade",
  "ink",
]);
const IDENTITY_COLOR_DEFAULTS = { name: "#2c2420", bio: "#74665d" } as const;
const IDENTITY_COLOR_PALETTE = {
  default: IDENTITY_COLOR_DEFAULTS,
  coral: { name: "#a84431", bio: "#a84431" },
  jade: { name: "#3e806d", bio: "#3e806d" },
  ink: { name: "#2c2420", bio: "#2c2420" },
} as const;
const IDENTITY_SURFACES = { name: "#fbf6ef", bio: "#fffdf9" } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sectionErrors(section: unknown): string[] {
  if (!isRecord(section)) return ["A profile section is invalid."];
  const errors: string[] = [];
  const kind = section.kind;
  const body = section.body;
  if (kind !== "about" && kind !== "services") errors.push("A profile section kind is invalid.");
  if (typeof body !== "string" || body.trim().length === 0) {
    errors.push("A profile section body must be nonblank.");
  } else if (kind === "about" && body.length > 280) {
    errors.push("An About section body can contain at most 280 characters.");
  } else if (kind === "services" && body.length > 160) {
    errors.push("A Services section body can contain at most 160 characters.");
  }
  if (kind === "about" && section.items !== undefined) {
    errors.push("An About section cannot contain service items.");
  }
  if (kind === "services" && section.items !== undefined) {
    if (!Array.isArray(section.items)) {
      errors.push("Services items must be a list.");
    } else {
      if (section.items.length > 3)
        errors.push("A Services section can contain at most three items.");
      section.items.forEach((item) => {
        if (typeof item !== "string" || item.trim().length === 0) {
          errors.push("Every service item must be nonblank.");
        } else if (item.length > 60) {
          errors.push("A service item can contain at most 60 characters.");
        }
      });
    }
  }
  return errors;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function meetsContrast(color: string, surface: string): boolean {
  const colorLuminance = relativeLuminance(color);
  const surfaceLuminance = relativeLuminance(surface);
  return (
    (Math.max(colorLuminance, surfaceLuminance) + 0.05) /
      (Math.min(colorLuminance, surfaceLuminance) + 0.05) >=
    4.5
  );
}

function identityColorError(field: "name" | "bio"): string {
  return field === "name"
    ? "The profile name color is invalid."
    : "The profile bio color is invalid.";
}

function identityColorValue(
  value: unknown,
):
  | { kind: "preset"; value: ProfileIdentityColorPreset }
  | { kind: "custom"; value: string }
  | undefined {
  if (
    typeof value === "string" &&
    PROFILE_IDENTITY_COLOR_PRESETS.has(value as ProfileIdentityColorPreset)
  ) {
    return { kind: "preset", value: value as ProfileIdentityColorPreset };
  }
  if (isRecord(value) && Object.keys(value).length === 1 && isHexColor(value.custom)) {
    return { kind: "custom", value: value.custom.toLowerCase() };
  }
  return undefined;
}

function identityColorErrors(field: "name" | "bio", value: unknown): string[] {
  if (value === undefined) return [];
  const parsed = identityColorValue(value);
  if (parsed === undefined) return [identityColorError(field)];
  if (parsed.kind === "custom" && !meetsContrast(parsed.value, IDENTITY_SURFACES[field])) {
    return [
      field === "name"
        ? "The profile name custom color does not meet contrast requirements."
        : "The profile bio custom color does not meet contrast requirements.",
    ];
  }
  return [];
}

function identityColorsErrors(value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [identityColorError("name"), identityColorError("bio")];
  const errors = [
    ...identityColorErrors("name", value.name),
    ...identityColorErrors("bio", value.bio),
  ];
  for (const key of Object.keys(value)) {
    if (key !== "name" && key !== "bio") errors.push(identityColorError("name"));
  }
  return errors;
}

function normalizeIdentityColors(value: unknown): ProfileIdentityColors | undefined {
  if (!isRecord(value)) return undefined;
  const normalized: ProfileIdentityColors = {};
  for (const field of ["name", "bio"] as const) {
    const parsed = identityColorValue(value[field]);
    if (parsed === undefined || (parsed.kind === "preset" && parsed.value === "default")) continue;
    normalized[field] = parsed.kind === "custom" ? { custom: parsed.value } : parsed.value;
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

function resolveIdentityColor(value: unknown, field: "name" | "bio"): string {
  const parsed = isRecord(value) ? identityColorValue(value[field]) : undefined;
  if (parsed === undefined) return IDENTITY_COLOR_DEFAULTS[field];
  return parsed.kind === "custom" ? parsed.value : IDENTITY_COLOR_PALETTE[parsed.value][field];
}

/** Returns publication-blocking customization errors. Featured links are intentionally advisory. */
export function validateProfileCustomization(
  customization: ProfileCustomization | undefined,
  _links: readonly ProfileLink[] = [],
): string[] {
  if (customization === undefined) return [];
  const value: Record<string, unknown> = isRecord(customization) ? customization : {};
  const errors: string[] = [];
  if (value.preset !== "warm-studio") errors.push("The profile customization preset is invalid.");
  if (!PROFILE_ACCENTS.has(value.accent as ProfileAccent))
    errors.push("The profile customization accent is invalid.");
  if (!PROFILE_TYPE_SCALES.has(value.typeScale as ProfileTypeScale))
    errors.push("The profile customization type scale is invalid.");
  if (!PROFILE_LINK_TREATMENTS.has(value.linkTreatment as ProfileLinkTreatment))
    errors.push("The profile customization link treatment is invalid.");
  if (!PROFILE_CONTENT_ORDERS.has(value.contentOrder as ProfileContentOrder))
    errors.push("The profile customization content order is invalid.");
  if (value.featuredLinkId !== undefined && typeof value.featuredLinkId !== "string") {
    errors.push("The featured link id is invalid.");
  }
  errors.push(...identityColorsErrors(value.identityColors));
  if (value.section !== undefined) errors.push(...sectionErrors(value.section));
  return errors;
}

function httpsWebsite(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.trim().length === 0) return undefined;
  try {
    const url = new URL(value);
    return url.protocol.toLowerCase() === "https:" &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
      ? value.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function safePhone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const phone = value.trim();
  return /^[0-9+().\- x#*]+$/.test(phone) ? phone : undefined;
}

function ordinaryEmail(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9!$&'*+/=^_`{|}~-]+(?:\.[A-Za-z0-9!$&'*+/=^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(
      value,
    )
  ) {
    return undefined;
  }
  return value;
}

export function getAutomaticContactActions(fields: {
  email?: string;
  phone?: string;
  website?: string;
}): ContactAction[] {
  const actions: ContactAction[] = [];
  const email = ordinaryEmail(fields.email);
  if (email) actions.push({ kind: "email", href: `mailto:${email}`, label: "Email" });
  const phone = safePhone(fields.phone);
  if (phone) actions.push({ kind: "phone", href: `tel:${phone}`, label: "Phone" });
  const website = fields.website === undefined ? undefined : httpsWebsite(fields.website);
  if (website !== undefined) actions.push({ kind: "website", href: website, label: "Website" });
  return actions;
}

export function getFeaturedProfileLink(
  links: readonly ProfileLink[],
  featuredLinkId: string | undefined,
): ProfileLink | undefined {
  if (featuredLinkId === undefined) return undefined;
  return links.find((link) => link.id === featuredLinkId && link.enabled);
}
