import type { ProfileLink } from "./domain";

export type ProfileAccent = "coral" | "jade" | "ink";
export type ProfileIdentityColorPreset = "default" | "coral" | "jade" | "ink";
export type ProfileIdentityColor =
  { kind: "preset"; value: ProfileIdentityColorPreset } | { kind: "custom"; hex: string };
export type ProfileIdentityField = "name" | "bio";
export interface ProfileIdentityColors {
  name?: ProfileIdentityColor;
  bio?: ProfileIdentityColor;
}
export interface ProfileIdentityColorValidationOptions {
  allowWhite?: boolean;
}
export type ProfileAppearanceTheme = "paper" | "moss" | "night" | "custom";
export interface ProfileCustomizationValidationOptions extends ProfileIdentityColorValidationOptions {
  activeTheme?: ProfileAppearanceTheme;
  allowInvalidCustomPaletteContrast?: boolean;
}
export type ProfileTypeScale = "compact" | "comfortable" | "editorial";
export type ProfileLinkTreatment = "filled" | "outlined";
export type ProfileContentOrder = "links-first" | "section-first";
export type ProfileContactDisplay = "labels" | "icons-circle" | "icons-soft-square";
export interface ProfileThemeColors {
  canvas: string;
  surface: string;
  ink: string;
  accent: string;
}

export type ProfileSection =
  { kind: "about"; body: string } | { kind: "services"; body: string; items?: string[] };

export interface ContactAction {
  kind: "email" | "phone" | "website";
  href: string;
  label: "Email" | "Phone" | "Website";
}

export interface ProfileCustomization {
  preset: "warm-studio" | "custom";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  contentOrder: ProfileContentOrder;
  contactDisplay?: ProfileContactDisplay;
  customColors?: ProfileThemeColors;
  identityColors?: ProfileIdentityColors;
  featuredLinkId?: string;
  section?: ProfileSection;
}

export interface ResolvedProfileAppearance {
  mode: "legacy" | "warm-studio" | "custom";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
  nameColor: string;
  bioColor: string;
  customColors?: ProfileThemeColors;
}

export const DEFAULT_CUSTOM_PROFILE_COLORS: ProfileThemeColors = {
  canvas: "#f4f6fa",
  surface: "#ffffff",
  ink: "#1b2433",
  accent: "#3f6de8",
};

export const DEFAULT_CUSTOM_PROFILE_CUSTOMIZATION: ProfileCustomization = {
  preset: "custom",
  accent: "ink",
  typeScale: "comfortable",
  linkTreatment: "outlined",
  contentOrder: "links-first",
  customColors: DEFAULT_CUSTOM_PROFILE_COLORS,
};

export const DEFAULT_WARM_STUDIO_CUSTOMIZATION: ProfileCustomization = {
  preset: "warm-studio",
  accent: "jade",
  typeScale: "comfortable",
  linkTreatment: "filled",
  contentOrder: "links-first",
  contactDisplay: "labels",
};

/** Returns only a complete, render-safe customization object from runtime data. */
export function normalizeProfileCustomization(
  value: unknown,
  theme?: ProfileAppearanceTheme,
): ProfileCustomization | undefined {
  if (!isRecord(value)) return undefined;
  const baseCustomization = {
    ...value,
    section: undefined,
    identityColors: undefined,
    contactDisplay: undefined,
  };
  if (
    validateProfileCustomization(baseCustomization as unknown as ProfileCustomization, [], {
      activeTheme: theme,
      allowInvalidCustomPaletteContrast: true,
    }).length > 0
  )
    return undefined;

  const normalized: ProfileCustomization = {
    preset: value.preset as ProfileCustomization["preset"],
    accent: value.accent as ProfileAccent,
    typeScale: value.typeScale as ProfileTypeScale,
    linkTreatment: value.linkTreatment as ProfileLinkTreatment,
    contentOrder: value.contentOrder as ProfileContentOrder,
    contactDisplay: normalizeContactDisplay(value.contactDisplay),
  };
  const customColors = normalizeProfileThemeColors(value.customColors);
  if (customColors !== undefined) normalized.customColors = customColors;
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
  theme?: ProfileAppearanceTheme,
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
  if (value?.preset === "custom") {
    if (theme !== undefined && theme !== "custom") {
      return {
        mode: "legacy",
        accent: "coral",
        typeScale: "comfortable",
        linkTreatment: "outlined",
        nameColor: IDENTITY_COLOR_DEFAULTS.name,
        bioColor: IDENTITY_COLOR_DEFAULTS.bio,
      };
    }
    return {
      mode: "custom",
      accent: "ink",
      typeScale: "comfortable",
      linkTreatment: "outlined",
      nameColor: IDENTITY_COLOR_DEFAULTS.name,
      bioColor: IDENTITY_COLOR_DEFAULTS.bio,
      customColors:
        normalizeProfileThemeColors(value.customColors) ?? DEFAULT_CUSTOM_PROFILE_COLORS,
    };
  }
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
    nameColor: resolveProfileIdentityColor(value?.identityColors, "name"),
    bioColor: resolveProfileIdentityColor(value?.identityColors, "bio"),
  };
}

const PROFILE_ACCENTS = new Set<ProfileAccent>(["coral", "jade", "ink"]);
const PROFILE_TYPE_SCALES = new Set<ProfileTypeScale>(["compact", "comfortable", "editorial"]);
const PROFILE_LINK_TREATMENTS = new Set<ProfileLinkTreatment>(["filled", "outlined"]);
const PROFILE_CONTENT_ORDERS = new Set<ProfileContentOrder>(["links-first", "section-first"]);
const PROFILE_CONTACT_DISPLAYS = new Set<ProfileContactDisplay>([
  "labels",
  "icons-circle",
  "icons-soft-square",
]);
export const PROFILE_IDENTITY_COLOR_PRESETS = [
  "default",
  "coral",
  "jade",
  "ink",
] as const satisfies readonly ProfileIdentityColorPreset[];
const PROFILE_IDENTITY_COLOR_PRESET_SET = new Set<ProfileIdentityColorPreset>(
  PROFILE_IDENTITY_COLOR_PRESETS,
);
export const IDENTITY_COLOR_DEFAULTS = { name: "#2c2420", bio: "#74665d" } as const;
export const IDENTITY_COLOR_PALETTE = {
  default: IDENTITY_COLOR_DEFAULTS,
  coral: { name: "#a84431", bio: "#a84431" },
  jade: { name: "#3e806d", bio: "#3e806d" },
  ink: { name: "#2c2420", bio: "#2c2420" },
} as const;
const IDENTITY_SURFACES = ["#fbf6ef", "#fffdf9"] as const;
const PROFILE_THEME_COLOR_FIELDS = [
  "canvas",
  "surface",
  "ink",
  "accent",
] as const satisfies readonly (keyof ProfileThemeColors)[];

function profileThemeColorsShapeErrors(value: unknown): string[] {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== PROFILE_THEME_COLOR_FIELDS.length ||
    PROFILE_THEME_COLOR_FIELDS.some((field) => !isProfileIdentityHex(value[field]))
  ) {
    return ["The custom profile palette contains an invalid color."];
  }
  return [];
}

function profileThemeColorsErrors(value: unknown, includeContrast = true): string[] {
  const shapeErrors = profileThemeColorsShapeErrors(value);
  if (shapeErrors.length > 0 || !includeContrast || !isRecord(value)) return shapeErrors;
  const colors = value as unknown as ProfileThemeColors;
  if (!meetsContrast(colors.ink, colors.canvas) || !meetsContrast(colors.ink, colors.surface)) {
    return ["The custom profile text color does not meet contrast requirements."];
  }
  if (!meetsContrast(colors.accent, colors.surface)) {
    return ["The custom profile accent color does not meet contrast requirements."];
  }
  return [];
}

export function validateProfileThemeColors(value: unknown): string[] {
  return profileThemeColorsErrors(value);
}

function normalizeProfileThemeColors(value: unknown): ProfileThemeColors | undefined {
  if (profileThemeColorsShapeErrors(value).length > 0 || !isRecord(value)) return undefined;
  return {
    canvas: (value.canvas as string).toLowerCase(),
    surface: (value.surface as string).toLowerCase(),
    ink: (value.ink as string).toLowerCase(),
    accent: (value.accent as string).toLowerCase(),
  };
}

function normalizeContactDisplay(value: unknown): ProfileContactDisplay {
  return PROFILE_CONTACT_DISPLAYS.has(value as ProfileContactDisplay)
    ? (value as ProfileContactDisplay)
    : "labels";
}

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

export function isProfileIdentityHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
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

function identityColorError(field: ProfileIdentityField): string {
  return field === "name"
    ? "The profile name color is invalid."
    : "The profile bio color is invalid.";
}

function identityColorValue(value: unknown): ProfileIdentityColor | undefined {
  if (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    value.kind === "preset" &&
    PROFILE_IDENTITY_COLOR_PRESET_SET.has(value.value as ProfileIdentityColorPreset)
  ) {
    return { kind: "preset", value: value.value as ProfileIdentityColorPreset };
  }
  if (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    value.kind === "custom" &&
    isProfileIdentityHex(value.hex)
  ) {
    return { kind: "custom", hex: value.hex.toLowerCase() };
  }
  return undefined;
}

function identityColorErrors(
  field: ProfileIdentityField,
  value: unknown,
  options: ProfileIdentityColorValidationOptions,
): string[] {
  if (value === undefined) return [];
  const parsed = identityColorValue(value);
  if (parsed === undefined) return [identityColorError(field)];
  if (parsed.kind === "custom" && options.allowWhite && parsed.hex === "#ffffff") return [];
  if (
    parsed.kind === "custom" &&
    !IDENTITY_SURFACES.every((surface) => meetsContrast(parsed.hex, surface))
  ) {
    return [
      field === "name"
        ? "The profile name custom color does not meet contrast requirements."
        : "The profile bio custom color does not meet contrast requirements.",
    ];
  }
  return [];
}

function identityColorsErrors(
  value: unknown,
  options: ProfileIdentityColorValidationOptions,
): string[] {
  if (value === undefined) return [];
  if (!isRecord(value)) return [identityColorError("name"), identityColorError("bio")];
  const errors = [
    ...identityColorErrors("name", value.name, options),
    ...identityColorErrors("bio", value.bio, options),
  ];
  for (const key of Object.keys(value)) {
    if (key !== "name" && key !== "bio") errors.push(identityColorError("name"));
  }
  return errors;
}

function normalizeIdentityColors(value: unknown): ProfileIdentityColors | undefined {
  if (!isRecord(value)) return undefined;
  const normalized: ProfileIdentityColors = {};
  for (const field of ["name", "bio"] satisfies readonly ProfileIdentityField[]) {
    const parsed = identityColorValue(value[field]);
    if (parsed === undefined || (parsed.kind === "preset" && parsed.value === "default")) continue;
    normalized[field] = parsed;
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized;
}

export function resolveProfileIdentityColor(value: unknown, field: ProfileIdentityField): string {
  const parsed = isRecord(value) ? identityColorValue(value[field]) : undefined;
  if (parsed === undefined) return IDENTITY_COLOR_DEFAULTS[field];
  return parsed.kind === "custom" ? parsed.hex : IDENTITY_COLOR_PALETTE[parsed.value][field];
}

export function validateProfileIdentityColor(
  field: ProfileIdentityField,
  hex: unknown,
  options: ProfileIdentityColorValidationOptions = {},
): string | undefined {
  if (!isProfileIdentityHex(hex)) return identityColorError(field);
  if (options.allowWhite && hex.toLowerCase() === "#ffffff") return undefined;
  return IDENTITY_SURFACES.every((surface) => meetsContrast(hex, surface))
    ? undefined
    : field === "name"
      ? "The profile name custom color does not meet contrast requirements."
      : "The profile bio custom color does not meet contrast requirements.";
}

/** Returns publication-blocking customization errors. Featured links are intentionally advisory. */
export function validateProfileCustomization(
  customization: ProfileCustomization | undefined,
  _links: readonly ProfileLink[] = [],
  options: ProfileCustomizationValidationOptions = {},
): string[] {
  if (customization === undefined) return [];
  const value: Record<string, unknown> = isRecord(customization) ? customization : {};
  const errors: string[] = [];
  if (value.preset !== "warm-studio" && value.preset !== "custom") {
    errors.push("The profile customization preset is invalid.");
  }
  if (!PROFILE_ACCENTS.has(value.accent as ProfileAccent))
    errors.push("The profile customization accent is invalid.");
  if (!PROFILE_TYPE_SCALES.has(value.typeScale as ProfileTypeScale))
    errors.push("The profile customization type scale is invalid.");
  if (!PROFILE_LINK_TREATMENTS.has(value.linkTreatment as ProfileLinkTreatment))
    errors.push("The profile customization link treatment is invalid.");
  if (!PROFILE_CONTENT_ORDERS.has(value.contentOrder as ProfileContentOrder))
    errors.push("The profile customization content order is invalid.");
  if (
    value.contactDisplay !== undefined &&
    !PROFILE_CONTACT_DISPLAYS.has(value.contactDisplay as ProfileContactDisplay)
  ) {
    errors.push("The profile customization contact display is invalid.");
  }
  if (value.featuredLinkId !== undefined && typeof value.featuredLinkId !== "string") {
    errors.push("The featured link id is invalid.");
  }
  const customPaletteActive =
    value.preset === "custom" &&
    (options.activeTheme === undefined || options.activeTheme === "custom");
  if (customPaletteActive && value.customColors === undefined) {
    errors.push("A custom profile palette is required.");
  }
  if (customPaletteActive && value.customColors !== undefined) {
    errors.push(
      ...profileThemeColorsErrors(value.customColors, !options.allowInvalidCustomPaletteContrast),
    );
  }
  errors.push(...identityColorsErrors(value.identityColors, options));
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
