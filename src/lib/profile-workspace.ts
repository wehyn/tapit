export const PROFILE_CUSTOMIZATION_CATEGORIES = [
  "overview",
  "identity",
  "media",
  "layout",
] as const;

export type ProfileCustomizationCategory = (typeof PROFILE_CUSTOMIZATION_CATEGORIES)[number];

const MARKERS: Record<ProfileCustomizationCategory, readonly string[]> = {
  overview: [
    "profile customization preset",
    "profile customization accent",
    "profile customization type scale",
    "profile customization link treatment",
  ],
  identity: [
    "profile name color",
    "profile name custom color",
    "profile bio color",
    "profile bio custom color",
  ],
  media: [
    "profile media",
    "media autoplay",
    "hero height",
    "slideshow",
    "background image",
    "background horizontal position",
    "background vertical position",
  ],
  layout: ["profile customization content order", "profile customization contact display"],
};

function includesMarker(error: string, markers: readonly string[]): boolean {
  const normalized = error.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

export function classifyProfileWorkspaceError(
  error: string,
): ProfileCustomizationCategory | undefined {
  return PROFILE_CUSTOMIZATION_CATEGORIES.find((category) =>
    includesMarker(error, MARKERS[category]),
  );
}

export function splitProfileWorkspaceErrors(errors: readonly string[]): {
  profile: string[];
  customization: string[];
} {
  return errors.reduce(
    (result, error) => {
      if (classifyProfileWorkspaceError(error) === undefined) result.profile.push(error);
      else result.customization.push(error);
      return result;
    },
    { profile: [], customization: [] } as { profile: string[]; customization: string[] },
  );
}
