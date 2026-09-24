"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon, CaretUpIcon, TrashIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import {
  DEFAULT_PROFILE_MEDIA,
  MAX_PROFILE_SLIDESHOW_IMAGES,
  MAX_PROFILE_HERO_HEIGHT,
  MIN_PROFILE_HERO_HEIGHT,
  removeProfileMediaSlide,
  reorderProfileMediaSlides,
  type ProfileMediaImage,
  type ProfileMediaPresentation,
} from "@/lib/profile-media";

export type ProfileMediaEditorProps = {
  media?: ProfileMediaPresentation;
  onChange: (next: ProfileMediaPresentation | undefined) => void;
  onUpload: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  busy?: boolean;
  error?: string;
};

const imageAccept = "image/jpeg,image/png,image/webp";

function copyMedia(media?: ProfileMediaPresentation): ProfileMediaPresentation {
  const source: ProfileMediaPresentation = media ?? {
    heroHeight: DEFAULT_PROFILE_MEDIA.heroHeight,
    autoplay: DEFAULT_PROFILE_MEDIA.autoplay,
    slideshow: [],
  };
  return {
    ...source,
    ...(source.background ? { background: { ...source.background } } : {}),
    slideshow: source.slideshow.map((image) => ({ ...image })),
  };
}

function imageSource(image: ProfileMediaImage): string | undefined {
  return image.previewUrl ?? image.url;
}

export function ProfileMediaEditor({
  media,
  onChange,
  onUpload,
  busy = false,
  error,
}: ProfileMediaEditorProps) {
  const baseId = useId();
  const backgroundInput = useRef<HTMLInputElement>(null);
  const slideshowInput = useRef<HTMLInputElement>(null);
  const [uploadFailure, setUploadFailure] = useState<{
    message: string;
    target: "background" | "slideshow";
  }>();
  const value = copyMedia(media);
  const latestMedia = useRef<ProfileMediaPresentation | undefined>(value);
  const uploadRequests = useRef({ background: 0, slideshow: 0 });
  useEffect(() => {
    latestMedia.current = copyMedia(media);
  }, [media]);
  const uploadError = (target: "background" | "slideshow") =>
    uploadFailure?.target === target ? uploadFailure.message : undefined;
  const uploadDescription = (target: "background" | "slideshow") =>
    uploadError(target) ? `${baseId}-${target}-upload-error` : undefined;

  function update(patch: Partial<ProfileMediaPresentation>) {
    const next = { ...value, ...patch, slideshow: patch.slideshow ?? value.slideshow };
    latestMedia.current = next;
    onChange(next);
  }

  async function upload(file: File | undefined, target: "background" | "slideshow") {
    if (!file) return;
    const requestId = ++uploadRequests.current[target];
    setUploadFailure(undefined);
    try {
      const image = await onUpload(file, target);
      if (requestId !== uploadRequests.current[target]) return;
      const current = latestMedia.current ?? copyMedia(media);
      if (target === "background") {
        const next = {
          ...current,
          background: { ...image, positionX: 50, positionY: 50 },
          slideshow: current.slideshow.map((item) => ({ ...item })),
        };
        latestMedia.current = next;
        onChange(next);
      } else if (current.slideshow.length < MAX_PROFILE_SLIDESHOW_IMAGES) {
        const next = {
          ...current,
          slideshow: [...current.slideshow.map((item) => ({ ...item })), { ...image }],
          ...(current.background ? { background: { ...current.background } } : {}),
        };
        latestMedia.current = next;
        onChange(next);
      }
    } catch (uploadFailure) {
      if (requestId !== uploadRequests.current[target]) return;
      setUploadFailure({
        message: uploadFailure instanceof Error ? uploadFailure.message : "Image upload failed.",
        target,
      });
    }
  }

  function hasMeaningfulSettings(next: ProfileMediaPresentation) {
    return (
      next.heroHeight !== DEFAULT_PROFILE_MEDIA.heroHeight ||
      next.autoplay !== DEFAULT_PROFILE_MEDIA.autoplay
    );
  }

  function removeBackground() {
    const next = copyMedia(value);
    delete next.background;
    if (next.slideshow.length === 0 && !hasMeaningfulSettings(next))
      latestMedia.current = undefined;
    else latestMedia.current = next;
    onChange(next.slideshow.length === 0 && !hasMeaningfulSettings(next) ? undefined : next);
  }

  function removeSlide(index: number) {
    const next = removeProfileMediaSlide(value, index);
    const nextValue =
      next.slideshow.length === 0 && !next.background && !hasMeaningfulSettings(next)
        ? undefined
        : next;
    latestMedia.current = nextValue;
    onChange(nextValue);
  }

  function updateSlide(index: number, patch: Partial<ProfileMediaImage>) {
    const slideshow = value.slideshow.map((image, imageIndex) =>
      imageIndex === index ? { ...image, ...patch } : { ...image },
    );
    update({ slideshow });
  }

  function reorderSlide(fromIndex: number, toIndex: number) {
    const next = reorderProfileMediaSlides(value, fromIndex, toIndex);
    latestMedia.current = next;
    onChange(next);
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-tapit-ink">Background image</h3>
            <p className="mt-1 text-xs leading-5 text-tapit-muted">
              Add a wide hero image and adjust its crop. JPEG, PNG, or WebP.
            </p>
          </div>
          <Button
            aria-describedby={uploadDescription("background")}
            aria-invalid={uploadError("background") ? true : undefined}
            disabled={busy}
            onClick={() => backgroundInput.current?.click()}
            type="button"
            variant="secondary"
          >
            {value.background ? "Replace background" : "Upload background"}
          </Button>
          <input
            accept={imageAccept}
            aria-label="Upload background image"
            aria-describedby={uploadDescription("background")}
            aria-invalid={uploadError("background") ? true : undefined}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void upload(event.target.files?.[0], "background");
              event.currentTarget.value = "";
            }}
            ref={backgroundInput}
            type="file"
          />
        </div>
        {value.background ? (
          <div className="grid gap-4 rounded-tapit border border-tapit-line bg-tapit-paper p-3 sm:p-4">
            {imageSource(value.background) ? (
              <div
                aria-label={value.background.altText}
                className="h-32 rounded-tapit bg-cover bg-center"
                role="img"
                style={{
                  backgroundImage: `url(${JSON.stringify(imageSource(value.background))})`,
                  backgroundPosition: `${value.background.positionX}% ${value.background.positionY}%`,
                }}
              />
            ) : null}
            <Field
              id={`${baseId}-background-alt`}
              label="Background image description"
              maxLength={160}
              onChange={(event) =>
                update({ background: { ...value.background!, altText: event.target.value } })
              }
              value={value.background.altText}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label
                className="grid gap-2 text-sm font-semibold text-tapit-ink"
                htmlFor={`${baseId}-crop-x`}
              >
                Crop horizontal position: {value.background.positionX}%
                <input
                  id={`${baseId}-crop-x`}
                  max={100}
                  min={0}
                  onChange={(event) =>
                    update({
                      background: { ...value.background!, positionX: Number(event.target.value) },
                    })
                  }
                  type="range"
                  value={value.background.positionX}
                />
              </label>
              <label
                className="grid gap-2 text-sm font-semibold text-tapit-ink"
                htmlFor={`${baseId}-crop-y`}
              >
                Crop vertical position: {value.background.positionY}%
                <input
                  id={`${baseId}-crop-y`}
                  max={100}
                  min={0}
                  onChange={(event) =>
                    update({
                      background: { ...value.background!, positionY: Number(event.target.value) },
                    })
                  }
                  type="range"
                  value={value.background.positionY}
                />
              </label>
            </div>
            <Button onClick={removeBackground} type="button" variant="quiet">
              <TrashIcon aria-hidden="true" size={16} />
              Remove background
            </Button>
          </div>
        ) : null}
      </div>

      <Field
        id={`${baseId}-hero-height`}
        label={`Hero height: ${value.heroHeight}px`}
        max={MAX_PROFILE_HERO_HEIGHT}
        min={MIN_PROFILE_HERO_HEIGHT}
        onChange={(event) => update({ heroHeight: Number(event.target.value) })}
        type="range"
        value={value.heroHeight}
      />

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-tapit-ink">Slideshow</h3>
            <p className="mt-1 text-xs leading-5 text-tapit-muted">
              {value.slideshow.length} of {MAX_PROFILE_SLIDESHOW_IMAGES} images. Reorder or remove
              thumbnails below.
            </p>
          </div>
          <Button
            aria-describedby={uploadDescription("slideshow")}
            aria-invalid={uploadError("slideshow") ? true : undefined}
            disabled={busy || value.slideshow.length >= MAX_PROFILE_SLIDESHOW_IMAGES}
            onClick={() => slideshowInput.current?.click()}
            type="button"
            variant="secondary"
          >
            Upload slideshow image
          </Button>
          <input
            accept={imageAccept}
            aria-label="Upload slideshow images"
            aria-describedby={uploadDescription("slideshow")}
            aria-invalid={uploadError("slideshow") ? true : undefined}
            className="sr-only"
            disabled={busy || value.slideshow.length >= MAX_PROFILE_SLIDESHOW_IMAGES}
            onChange={(event) => {
              void upload(event.target.files?.[0], "slideshow");
              event.currentTarget.value = "";
            }}
            ref={slideshowInput}
            type="file"
          />
        </div>
        {value.slideshow.map((image, index) => (
          <div
            className="grid gap-3 rounded-tapit border border-tapit-line p-3 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
            key={`${image.assetId}-${index}`}
          >
            {imageSource(image) ? (
              <div
                aria-label={image.altText}
                className="h-16 w-20 rounded-tapit bg-cover bg-center"
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(imageSource(image))})` }}
              />
            ) : (
              <div aria-hidden="true" className="h-16 w-20 rounded-tapit bg-tapit-soft-surface" />
            )}
            <Field
              id={`${baseId}-slide-${index}-alt`}
              label={`Slideshow image ${index + 1} description`}
              maxLength={160}
              onChange={(event) => updateSlide(index, { altText: event.target.value })}
              value={image.altText}
            />
            <div className="flex flex-wrap gap-2 sm:flex-col">
              <Button
                aria-label={`Move slideshow image ${index + 1} up`}
                disabled={index === 0}
                onClick={() => reorderSlide(index, index - 1)}
                type="button"
                variant="quiet"
              >
                <CaretUpIcon aria-hidden="true" size={18} />
              </Button>
              <Button
                aria-label={`Move slideshow image ${index + 1} down`}
                disabled={index === value.slideshow.length - 1}
                onClick={() => reorderSlide(index, index + 1)}
                type="button"
                variant="quiet"
              >
                <CaretDownIcon aria-hidden="true" size={18} />
              </Button>
              <Button
                aria-label={`Use slideshow image ${index + 1} as background`}
                onClick={() => update({ background: { ...image, positionX: 50, positionY: 50 } })}
                type="button"
                variant="quiet"
              >
                Use as background
              </Button>
              <Button
                aria-label={`Remove slideshow image ${index + 1}`}
                onClick={() => removeSlide(index)}
                type="button"
                variant="quiet"
              >
                <TrashIcon aria-hidden="true" size={16} />
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <label className="flex min-h-12 items-center gap-3 text-sm font-semibold text-tapit-ink">
        <input
          checked={value.autoplay}
          className="size-4 accent-tapit-accent"
          onChange={(event) => update({ autoplay: event.target.checked })}
          type="checkbox"
        />
        Autoplay slideshow while visible
      </label>

      {uploadFailure?.target === "background" ? (
        <span className="sr-only" id={`${baseId}-background-upload-error`}>
          {uploadFailure.message}
        </span>
      ) : null}
      {uploadFailure?.target === "slideshow" ? (
        <span className="sr-only" id={`${baseId}-slideshow-upload-error`}>
          {uploadFailure.message}
        </span>
      ) : null}
      {error || uploadFailure ? (
        <p className="text-sm font-medium text-tapit-danger" role="alert">
          {error}
          {error && uploadFailure ? " " : null}
          {uploadFailure?.message}
        </p>
      ) : null}
    </div>
  );
}
