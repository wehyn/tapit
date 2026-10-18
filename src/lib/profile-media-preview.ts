import type { PublicProfileProjection } from "./domain";

export type PendingProfileMediaUpload = {
  clientKey: string;
  target: "background" | "slideshow";
  file: File;
  previewUrl: string;
  altText: string;
  positionX: number;
  positionY: number;
  status: "queued" | "uploading" | "failed";
  error?: string;
};

export function mergePendingProfileMediaPreview(
  profile: PublicProfileProjection,
  pending: readonly PendingProfileMediaUpload[],
): PublicProfileProjection {
  if (pending.length === 0) return profile;

  const currentMedia = profile.media ?? {
    heroHeight: 320,
    slideshow: [],
    autoplay: true,
  };
  let background = currentMedia.background;
  const existingBackgroundAlt = currentMedia.background?.alt;
  const slideshow = [...currentMedia.slideshow];
  for (const entry of pending) {
    const localImage = {
      src: entry.previewUrl,
      alt:
        entry.target === "background" && existingBackgroundAlt?.trim()
          ? existingBackgroundAlt
          : entry.altText,
    };
    if (entry.target === "background") {
      background = {
        ...localImage,
        positionX: entry.positionX,
        positionY: entry.positionY,
      };
    } else {
      slideshow.push(localImage);
    }
  }
  const media = {
    ...currentMedia,
    ...(background ? { background } : {}),
    slideshow,
  };

  return { ...profile, media };
}
