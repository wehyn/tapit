import type { PublicProfileProjection } from "./domain";

export type PendingProfileMediaUpload = {
  target: "background" | "slideshow";
  file: File;
  previewUrl: string;
  altText: string;
  positionX: number;
  positionY: number;
  state: "uploading" | "error";
  error?: string;
};

export function mergePendingProfileMediaPreview(
  profile: PublicProfileProjection,
  pending: PendingProfileMediaUpload | null,
): PublicProfileProjection {
  if (pending === null) return profile;

  const currentMedia = profile.media ?? {
    heroHeight: 320,
    slideshow: [],
    autoplay: true,
  };
  const localImage = { src: pending.previewUrl, alt: pending.altText };
  const media =
    pending.target === "background"
      ? {
          ...currentMedia,
          background: {
            ...localImage,
            positionX: pending.positionX,
            positionY: pending.positionY,
          },
        }
      : { ...currentMedia, slideshow: [...currentMedia.slideshow, localImage] };

  return { ...profile, media };
}
