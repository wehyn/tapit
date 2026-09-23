import type { ProfileLink } from "./domain";

export type ProfileAccent = "coral" | "jade" | "ink";
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
  featuredLinkId?: string;
  section?: ProfileSection;
}

export interface ResolvedProfileAppearance {
  mode: "legacy" | "warm-studio";
  accent: ProfileAccent;
  typeScale: ProfileTypeScale;
  linkTreatment: ProfileLinkTreatment;
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
  if (
    !isRecord(value) ||
    validateProfileCustomization(value as unknown as ProfileCustomization).length > 0
  ) {
    return undefined;
  }

  const normalized: ProfileCustomization = {
    preset: "warm-studio",
    accent: value.accent as ProfileAccent,
    typeScale: value.typeScale as ProfileTypeScale,
    linkTreatment: value.linkTreatment as ProfileLinkTreatment,
    contentOrder: value.contentOrder as ProfileContentOrder,
  };
  if (typeof value.featuredLinkId === "string") normalized.featuredLinkId = value.featuredLinkId;
  if (isRecord(value.section)) {
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
  };
}

const PROFILE_ACCENTS = new Set<ProfileAccent>(["coral", "jade", "ink"]);
const PROFILE_TYPE_SCALES = new Set<ProfileTypeScale>(["compact", "comfortable", "editorial"]);
const PROFILE_LINK_TREATMENTS = new Set<ProfileLinkTreatment>(["filled", "outlined"]);
const PROFILE_CONTENT_ORDERS = new Set<ProfileContentOrder>(["links-first", "section-first"]);

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
