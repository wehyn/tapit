import type { Id } from "../../convex/_generated/dataModel";

export const MAX_PROFILE_SLIDESHOW_IMAGES = 10;
export const MIN_PROFILE_HERO_HEIGHT = 220;
export const MAX_PROFILE_HERO_HEIGHT = 520;
export const DEFAULT_PROFILE_HERO_HEIGHT = 320;
export const MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH = 160;

export interface ProfileMediaImage {
  assetId: Id<"profileMediaAssets">;
  altText: string;
  url?: string;
  previewUrl?: string;
}

export interface ProfileMediaBackground extends ProfileMediaImage {
  positionX: number;
  positionY: number;
}

export interface ProfileMediaPresentation {
  background?: ProfileMediaBackground;
  heroHeight: number;
  slideshow: ProfileMediaImage[];
  autoplay: boolean;
}

export interface PublicProfileMediaImage {
  src: string;
  alt: string;
}

export interface PublicProfileMediaPresentation {
  background?: PublicProfileMediaImage & {
    positionX: number;
    positionY: number;
  };
  heroHeight: number;
  slideshow: PublicProfileMediaImage[];
  autoplay: boolean;
}

export type ProfileMediaNormalizationOptions = {
  allowIncompleteBackground?: boolean;
};

export const DEFAULT_PROFILE_MEDIA = Object.freeze({
  heroHeight: DEFAULT_PROFILE_HERO_HEIGHT,
  autoplay: true,
  slideshow: Object.freeze([] as ProfileMediaImage[]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validAssetId(value: unknown): value is Id<"profileMediaAssets"> {
  return typeof value === "string" && value.trim().length > 0;
}

function validAltText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH
  );
}

function validUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateImage(image: unknown, label: string, descriptionOptional = false): string[] {
  if (!isRecord(image)) return [`${label} is invalid.`];
  const errors: string[] = [];
  if (!validAssetId(image.assetId)) errors.push(`${label} needs a valid asset reference.`);
  if (
    !validAltText(image.altText) &&
    !(descriptionOptional && typeof image.altText === "string" && image.altText.trim() === "")
  ) {
    errors.push(
      label === "A background image" &&
        (typeof image.altText !== "string" || image.altText.trim().length === 0)
        ? "A background image needs an accessible description."
        : descriptionOptional
          ? `${label} description must be at most ${MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH} characters.`
          : `${label} needs nonblank accessible text of at most ${MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH} characters.`,
    );
  }
  return errors;
}

export function validateProfileMedia(media: unknown): string[] {
  if (media === undefined || media === null) return [];
  if (!isRecord(media)) return ["Profile media is invalid."];
  const errors: string[] = [];
  if (
    !isFiniteNumber(media.heroHeight) ||
    media.heroHeight < MIN_PROFILE_HERO_HEIGHT ||
    media.heroHeight > MAX_PROFILE_HERO_HEIGHT
  ) {
    errors.push(
      `Hero height must be between ${MIN_PROFILE_HERO_HEIGHT} and ${MAX_PROFILE_HERO_HEIGHT}.`,
    );
  }
  if (typeof media.autoplay !== "boolean") errors.push("Media autoplay must be a boolean.");
  if (!Array.isArray(media.slideshow)) {
    errors.push("A slideshow must be a list of images.");
  } else {
    if (media.slideshow.length > MAX_PROFILE_SLIDESHOW_IMAGES) {
      errors.push("A slideshow can contain at most ten images.");
    }
    const assetIds = new Set<string>();
    media.slideshow.forEach((image, index) => {
      errors.push(...validateImage(image, `Slideshow image ${index + 1}`, true));
      if (isRecord(image) && validAssetId(image.assetId)) {
        const assetId = image.assetId.trim();
        if (assetIds.has(assetId)) errors.push("Slideshow images must be unique.");
        assetIds.add(assetId);
      }
    });
  }
  if (media.background !== undefined) {
    errors.push(...validateImage(media.background, "A background image"));
    if (isRecord(media.background)) {
      if (
        !isFiniteNumber(media.background.positionX) ||
        media.background.positionX < 0 ||
        media.background.positionX > 100
      ) {
        errors.push("Background horizontal position must be between 0 and 100.");
      }
      if (
        !isFiniteNumber(media.background.positionY) ||
        media.background.positionY < 0 ||
        media.background.positionY > 100
      ) {
        errors.push("Background vertical position must be between 0 and 100.");
      }
    }
  }
  return errors;
}

function normalizeImage(value: unknown, allowEmptyAltText = false): ProfileMediaImage | undefined {
  if (!isRecord(value) || !validAssetId(value.assetId)) return undefined;
  const altText = typeof value.altText === "string" ? value.altText.trim() : "";
  const hasValidAltText = validAltText(altText);
  if (!hasValidAltText && !(allowEmptyAltText && altText === "")) return undefined;
  return {
    assetId: value.assetId.trim() as Id<"profileMediaAssets">,
    altText,
    ...(validUrl(value.url) ? { url: value.url.trim() } : {}),
    ...(validUrl(value.previewUrl) ? { previewUrl: value.previewUrl.trim() } : {}),
  };
}

function normalizeBackground(
  value: unknown,
  options: ProfileMediaNormalizationOptions,
): ProfileMediaBackground | undefined {
  const image = normalizeImage(value, options.allowIncompleteBackground === true);
  if (image === undefined || !isRecord(value)) return undefined;
  const positionX = isFiniteNumber(value.positionX) ? clamp(value.positionX, 0, 100) : 50;
  const positionY = isFiniteNumber(value.positionY) ? clamp(value.positionY, 0, 100) : 50;
  return { ...image, positionX, positionY };
}

export function normalizeProfileMedia(
  value: unknown,
  options: ProfileMediaNormalizationOptions = {},
): ProfileMediaPresentation | undefined {
  if (!isRecord(value)) return undefined;
  const background = normalizeBackground(value.background, options);
  const slideshow: ProfileMediaImage[] = [];
  if (Array.isArray(value.slideshow)) {
    const assetIds = new Set<string>();
    for (const item of value.slideshow) {
      const image = normalizeImage(item, true);
      if (image === undefined || assetIds.has(image.assetId)) continue;
      assetIds.add(image.assetId);
      slideshow.push(image);
      if (slideshow.length === MAX_PROFILE_SLIDESHOW_IMAGES) break;
    }
  }
  const heroHeight = isFiniteNumber(value.heroHeight)
    ? clamp(value.heroHeight, MIN_PROFILE_HERO_HEIGHT, MAX_PROFILE_HERO_HEIGHT)
    : DEFAULT_PROFILE_HERO_HEIGHT;
  return {
    ...(background === undefined ? {} : { background }),
    heroHeight,
    slideshow,
    autoplay: typeof value.autoplay === "boolean" ? value.autoplay : true,
  };
}

export function stripProfileMediaUrls(media: unknown): ProfileMediaPresentation | undefined {
  const normalized = normalizeProfileMedia(media);
  if (normalized === undefined) return undefined;
  return {
    ...(normalized.background === undefined
      ? {}
      : {
          background: {
            assetId: normalized.background.assetId,
            altText: normalized.background.altText,
            positionX: normalized.background.positionX,
            positionY: normalized.background.positionY,
          },
        }),
    heroHeight: normalized.heroHeight,
    autoplay: normalized.autoplay,
    slideshow: normalized.slideshow.map(({ assetId, altText }) => ({ assetId, altText })),
  };
}

export function reorderProfileMediaSlides(
  media: ProfileMediaPresentation,
  fromIndex: number,
  toIndex: number,
): ProfileMediaPresentation {
  const slideshow = media.slideshow.map((image) => ({ ...image }));
  if (
    fromIndex < 0 ||
    fromIndex >= slideshow.length ||
    toIndex < 0 ||
    toIndex >= slideshow.length ||
    fromIndex === toIndex
  ) {
    return {
      ...media,
      ...(media.background ? { background: { ...media.background } } : {}),
      slideshow,
    };
  }
  const [image] = slideshow.splice(fromIndex, 1);
  slideshow.splice(toIndex, 0, image!);
  return {
    ...media,
    ...(media.background ? { background: { ...media.background } } : {}),
    slideshow,
  };
}

export function removeProfileMediaSlide(
  media: ProfileMediaPresentation,
  index: number,
): ProfileMediaPresentation {
  const slideshow = media.slideshow.map((image) => ({ ...image }));
  if (index >= 0 && index < slideshow.length) slideshow.splice(index, 1);
  return {
    ...media,
    ...(media.background ? { background: { ...media.background } } : {}),
    slideshow,
  };
}
