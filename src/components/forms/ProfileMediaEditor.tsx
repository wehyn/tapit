"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { SlideshowPreviewDialog } from "@/components/forms/SlideshowPreviewDialog";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { tileClass } from "@/components/ui/Tile";
import {
  DEFAULT_PROFILE_MEDIA,
  MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH,
  MAX_PROFILE_SLIDESHOW_IMAGES,
  MAX_PROFILE_HERO_HEIGHT,
  MIN_PROFILE_HERO_HEIGHT,
  removeProfileMediaSlide,
  reorderProfileMediaSlides,
  type ProfileMediaImage,
  type ProfileMediaPresentation,
} from "@/lib/profile-media";
import type { PendingProfileMediaUpload } from "@/lib/profile-media-preview";
import { validateProfileImageFile } from "@/lib/profile-image";

export type ProfileMediaEditorProps = {
  barePanels?: boolean;
  media?: ProfileMediaPresentation;
  section?: "background" | "slideshow";
  onChange: (next: ProfileMediaPresentation | undefined) => void;
  onUpload: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  onPendingPreviewChange?: (pending: PendingProfileMediaUpload[]) => void;
  onMediaErrorClear?: () => void;
  onMediaUploadCancel?: () => void;
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
  section,
  onChange,
  onUpload,
  onPendingPreviewChange,
  onMediaErrorClear,
  onMediaUploadCancel,
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
  const [slideshowQueue, setSlideshowQueue] = useState<PendingProfileMediaUpload[]>([]);
  const [draggingSlide, setDraggingSlide] = useState<number | null>(null);
  const [slideshowAnnouncement, setSlideshowAnnouncement] = useState("");
  const [slideshowPreviewOpen, setSlideshowPreviewOpen] = useState(false);
  const dragStartIndex = useRef(-1);
  const draggingSlideIndex = useRef(-1);
  const value = copyMedia(media);
  const availableSlideshowImages = value.slideshow.flatMap((image) => {
    const src = imageSource(image);
    return src ? [{ src, alt: image.altText }] : [];
  });
  const slideshowPreviewImages = [
    ...availableSlideshowImages,
    ...slideshowQueue
      .filter((image) => image.status !== "failed")
      .map((image) => ({ src: image.previewUrl, alt: image.altText })),
  ];
  const missingSlideshowImageCount = value.slideshow.length - availableSlideshowImages.length;
  const canPreviewSlideshow = slideshowPreviewImages.length > 0;
  const latestMedia = useRef<ProfileMediaPresentation | undefined>(value);
  const uploadRequests = useRef({ background: 0, slideshow: 0 });
  const clientKeyCounter = useRef(0);
  const slideshowQueueRef = useRef<PendingProfileMediaUpload[]>([]);
  const backgroundPending = useRef<PendingProfileMediaUpload | null>(null);
  const previewUrls = useRef(new Set<string>());
  const processingQueue = useRef(false);
  const mounted = useRef(true);
  const onUploadRef = useRef(onUpload);
  const latestPendingPreviewChange = useRef(onPendingPreviewChange);
  const latestMediaUploadCancel = useRef(onMediaUploadCancel);
  const activeUploadFailure =
    section === undefined || uploadFailure?.target === section ? uploadFailure : undefined;
  const showBackground = section !== "slideshow";
  const showSlideshow = section !== "background";
  const activeRequest = useRef<
    | {
        target: "background" | "slideshow";
        requestId: number;
        previewUrl: string;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    latestMedia.current = copyMedia(media);
  }, [media]);
  useEffect(() => {
    onUploadRef.current = onUpload;
  }, [onUpload]);
  useEffect(() => {
    latestPendingPreviewChange.current = onPendingPreviewChange;
  }, [onPendingPreviewChange]);
  useEffect(() => {
    latestMediaUploadCancel.current = onMediaUploadCancel;
  }, [onMediaUploadCancel]);
  useEffect(() => {
    mounted.current = true;
    const requestIds = uploadRequests.current;
    const ownedPreviewUrls = previewUrls.current;
    return () => {
      mounted.current = false;
      requestIds.background += 1;
      requestIds.slideshow += 1;
      activeRequest.current = undefined;
      for (const previewUrl of ownedPreviewUrls) URL.revokeObjectURL(previewUrl);
      ownedPreviewUrls.clear();
      latestPendingPreviewChange.current?.([]);
      latestMediaUploadCancel.current?.();
    };
  }, []);
  const uploadError = (target: "background" | "slideshow") =>
    uploadFailure?.target === target ? uploadFailure.message : undefined;
  const uploadDescription = (target: "background" | "slideshow") =>
    uploadError(target) ? `${baseId}-${target}-upload-error` : undefined;

  function update(patch: Partial<ProfileMediaPresentation>) {
    const next = { ...value, ...patch, slideshow: patch.slideshow ?? value.slideshow };
    latestMedia.current = next;
    onChange(next);
  }

  const revokePreview = useCallback((previewUrl: string) => {
    if (!previewUrls.current.delete(previewUrl)) return;
    URL.revokeObjectURL(previewUrl);
  }, []);

  const publishPending = useCallback(
    (queue: PendingProfileMediaUpload[], background = backgroundPending.current) => {
      latestPendingPreviewChange.current?.([...(background ? [background] : []), ...queue]);
    },
    [],
  );

  const setQueue = useCallback(
    (next: PendingProfileMediaUpload[]) => {
      slideshowQueueRef.current = next;
      setSlideshowQueue(next);
      publishPending(next);
    },
    [publishPending],
  );

  const isCurrentUpload = useCallback(
    (pending: PendingProfileMediaUpload, requestId: number): boolean => {
      const currentRequest = activeRequest.current;
      return (
        uploadRequests.current[pending.target] === requestId &&
        currentRequest !== undefined &&
        currentRequest.target === pending.target &&
        currentRequest.requestId === requestId &&
        currentRequest.previewUrl === pending.previewUrl
      );
    },
    [],
  );

  async function uploadBackground(pending: PendingProfileMediaUpload, requestId: number) {
    try {
      const image = await onUploadRef.current(pending.file, pending.target);
      if (!isCurrentUpload(pending, requestId)) return;
      const current = latestMedia.current ?? copyMedia(media);
      if (pending.target === "background") {
        const currentAltText = current.background?.altText;
        const next = {
          ...current,
          background: {
            ...image,
            altText: currentAltText?.trim() ? currentAltText : pending.altText,
            positionX: 50,
            positionY: 50,
          },
          slideshow: current.slideshow.map((item) => ({ ...item })),
        };
        latestMedia.current = next;
        onChange(next);
      }
      backgroundPending.current = null;
      activeRequest.current = undefined;
      publishPending(slideshowQueueRef.current, null);
      revokePreview(pending.previewUrl);
    } catch (uploadFailure) {
      if (!isCurrentUpload(pending, requestId)) return;
      const message =
        uploadFailure instanceof Error ? uploadFailure.message : "Image upload failed.";
      const nextPending = { ...pending, status: "failed" as const, error: message };
      backgroundPending.current = nextPending;
      setUploadFailure({
        message,
        target: pending.target,
      });
      publishPending(slideshowQueueRef.current, nextPending);
    }
  }

  function startBackgroundUpload(file: File | undefined) {
    if (!file) return;
    if (backgroundPending.current?.status === "uploading") return;
    const validationError = validateProfileImageFile(file);
    if (validationError) {
      setUploadFailure({ message: validationError, target: "background" });
      return;
    }
    if (backgroundPending.current) revokePreview(backgroundPending.current.previewUrl);
    uploadRequests.current.background += 1;
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.add(previewUrl);
    const pending: PendingProfileMediaUpload = {
      clientKey: `${baseId}-background-${uploadRequests.current.background}`,
      target: "background",
      file,
      previewUrl,
      altText:
        file.name.trim().slice(0, MAX_PROFILE_MEDIA_ALT_TEXT_LENGTH) || "Selected background image",
      positionX: 50,
      positionY: 50,
      status: "uploading",
    };
    const requestId = uploadRequests.current.background;
    backgroundPending.current = pending;
    activeRequest.current = { target: "background", requestId, previewUrl };
    setUploadFailure(undefined);
    publishPending(slideshowQueueRef.current, pending);
    void uploadBackground(pending, requestId);
  }

  const drainSlideshowQueue = useCallback(async () => {
    if (processingQueue.current || busy || slideshowQueueRef.current.length === 0) return;
    processingQueue.current = true;
    try {
      while (mounted.current) {
        const first = slideshowQueueRef.current[0];
        if (!first || first.status === "failed") break;
        if (backgroundPending.current !== null || busy) break;
        const uploading = { ...first, status: "uploading" as const, error: undefined };
        setQueue([uploading, ...slideshowQueueRef.current.slice(1)]);
        const requestId = ++uploadRequests.current.slideshow;
        activeRequest.current = {
          target: "slideshow",
          requestId,
          previewUrl: uploading.previewUrl,
        };
        try {
          const image = await onUploadRef.current(uploading.file, "slideshow");
          if (!isCurrentUpload(uploading, requestId)) break;
          const current = latestMedia.current ?? copyMedia(media);
          const next = {
            ...current,
            slideshow: [
              ...current.slideshow.map((item) => ({ ...item })),
              { ...image, altText: uploading.altText },
            ],
            ...(current.background ? { background: { ...current.background } } : {}),
          };
          latestMedia.current = next;
          onChange(next);
          activeRequest.current = undefined;
          setQueue(slideshowQueueRef.current.slice(1));
          revokePreview(uploading.previewUrl);
        } catch (error) {
          if (!isCurrentUpload(uploading, requestId)) break;
          const message = error instanceof Error ? error.message : "Image upload failed.";
          const failed = { ...uploading, status: "failed" as const, error: message };
          activeRequest.current = undefined;
          setQueue([failed, ...slideshowQueueRef.current.slice(1)]);
          break;
        }
      }
    } finally {
      processingQueue.current = false;
    }
  }, [busy, isCurrentUpload, media, onChange, revokePreview, setQueue]);

  function enqueueSlideshowFiles(files: FileList | File[]) {
    const selected = Array.from(files);
    if (selected.length === 0) return;
    const available = Math.max(
      0,
      MAX_PROFILE_SLIDESHOW_IMAGES - value.slideshow.length - slideshowQueueRef.current.length,
    );
    const accepted = selected.slice(0, available);
    let hasValidationError = false;
    for (const file of accepted) {
      const validationError = validateProfileImageFile(file);
      if (validationError) {
        hasValidationError = true;
        setUploadFailure({ message: validationError, target: "slideshow" });
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      slideshowQueueRef.current.push({
        clientKey: `${baseId}-slideshow-${++clientKeyCounter.current}`,
        target: "slideshow",
        file,
        previewUrl,
        altText: file.name || "Selected slideshow image",
        positionX: 50,
        positionY: 50,
        status: "queued",
      });
    }
    if (selected.length > available) {
      setUploadFailure({
        message: `You can add up to ${MAX_PROFILE_SLIDESHOW_IMAGES} slideshow images.`,
        target: "slideshow",
      });
    } else if (accepted.length > 0 && !hasValidationError) setUploadFailure(undefined);
    setQueue([...slideshowQueueRef.current]);
    void drainSlideshowQueue();
  }

  function retrySlideshowUpload(clientKey: string) {
    const queue = slideshowQueueRef.current;
    const index = queue.findIndex((entry) => entry.clientKey === clientKey);
    if (index !== 0 || queue[index]?.status !== "failed") return;
    const retrying = { ...queue[0]!, status: "queued" as const, error: undefined };
    setQueue([retrying, ...queue.slice(1)]);
    void drainSlideshowQueue();
  }

  function removeSlideshowUpload(clientKey: string) {
    const queue = slideshowQueueRef.current;
    const entry = queue.find((item) => item.clientKey === clientKey);
    if (!entry || entry.status === "uploading") return;
    setQueue(queue.filter((item) => item.clientKey !== clientKey));
    revokePreview(entry.previewUrl);
    if (entry.status === "failed") {
      setUploadFailure(undefined);
      onMediaErrorClear?.();
    }
    void drainSlideshowQueue();
  }

  function retryBackgroundUpload() {
    const pending = backgroundPending.current;
    if (!pending || pending.status !== "failed") return;
    const requestId = ++uploadRequests.current.background;
    const retrying = { ...pending, status: "uploading" as const, error: undefined };
    backgroundPending.current = retrying;
    activeRequest.current = { target: "background", requestId, previewUrl: pending.previewUrl };
    setUploadFailure(undefined);
    publishPending(slideshowQueueRef.current, retrying);
    void uploadBackground(retrying, requestId);
  }

  useEffect(() => {
    if (!busy) void drainSlideshowQueue();
  }, [busy, drainSlideshowQueue, slideshowQueue]);

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

  function reorderSlide(fromIndex: number, toIndex: number, announce = true) {
    const current = latestMedia.current ?? value;
    const next = reorderProfileMediaSlides(current, fromIndex, toIndex);
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= current.slideshow.length ||
      toIndex < 0 ||
      toIndex >= current.slideshow.length
    )
      return;
    latestMedia.current = next;
    onChange(next);
    if (announce) {
      setSlideshowAnnouncement(
        `Image ${fromIndex + 1} moved to position ${toIndex + 1} of ${next.slideshow.length}.`,
      );
    }
  }

  function handleSlidePointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartIndex.current = index;
    draggingSlideIndex.current = index;
    setDraggingSlide(index);
  }

  function handleSlidePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (draggingSlideIndex.current < 0 || (event.buttons !== 1 && event.pointerType !== "touch"))
      return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-slideshow-order-index]");
    const targetIndex = Number(row?.dataset.slideshowOrderIndex);
    if (row && Number.isInteger(targetIndex) && targetIndex >= 0) {
      draggingSlideIndex.current = targetIndex;
    }
  }

  function finishSlidePointerDrag(event: ReactPointerEvent<HTMLButtonElement>, commit = true) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const current = latestMedia.current ?? value;
    const fromIndex = dragStartIndex.current;
    const targetIndex = draggingSlideIndex.current;
    if (
      commit &&
      draggingSlide !== null &&
      fromIndex >= 0 &&
      targetIndex >= 0 &&
      targetIndex !== fromIndex
    ) {
      reorderSlide(fromIndex, targetIndex, false);
      setSlideshowAnnouncement(
        `Image ${fromIndex + 1} moved to position ${targetIndex + 1} of ${current.slideshow.length}.`,
      );
    }
    dragStartIndex.current = -1;
    draggingSlideIndex.current = -1;
    setDraggingSlide(null);
  }

  return (
    <div className="grid min-w-0 gap-4">
      <section
        hidden={!showBackground}
        style={!showBackground ? { display: "none" } : undefined}
        className="grid min-w-0 gap-4"
        aria-labelledby={`${baseId}-background-heading`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h3
              className="text-lg font-semibold text-tapit-ink"
              id={`${baseId}-background-heading`}
            >
              Background image
            </h3>
            <p className="text-sm text-tapit-muted">
              Add a wide image to the top of your profile. JPEG, PNG, or WebP.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {value.background ? (
              <Button disabled={busy} onClick={removeBackground} type="button" variant="quiet">
                <Icon className="size-4" name="trash" />
                Remove background
              </Button>
            ) : null}
            <Button
              aria-describedby={uploadDescription("background")}
              aria-invalid={uploadError("background") ? true : undefined}
              disabled={busy || slideshowQueue.length > 0}
              onClick={() => backgroundInput.current?.click()}
              type="button"
              variant="tonal"
            >
              <Icon className="size-4" name="upload" />
              {value.background ? "Replace background" : "Upload background"}
            </Button>
          </div>
          <input
            accept={imageAccept}
            aria-label="Upload background image"
            aria-describedby={uploadDescription("background")}
            aria-invalid={uploadError("background") ? true : undefined}
            className="sr-only"
            disabled={busy || slideshowQueue.length > 0}
            onChange={(event) => {
              startBackgroundUpload(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
            ref={backgroundInput}
            type="file"
          />
        </div>
        {value.background ? (
          <>
            {imageSource(value.background) ? (
              <div
                aria-label={value.background.altText}
                className="h-40 rounded-control bg-cover bg-center"
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
              help="Describe the image for people using a screen reader."
              maxLength={160}
              onChange={(event) =>
                update({ background: { ...value.background!, altText: event.target.value } })
              }
              value={value.background.altText}
            />
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold text-tapit-ink">Image position</legend>
              <label
                className="grid gap-2 text-sm font-medium text-tapit-ink"
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
                className="grid gap-2 text-sm font-medium text-tapit-ink"
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
            </fieldset>
          </>
        ) : null}
        <Field
          id={`${baseId}-hero-height`}
          label={`Hero height: ${value.heroHeight}px`}
          max={MAX_PROFILE_HERO_HEIGHT}
          min={MIN_PROFILE_HERO_HEIGHT}
          onChange={(event) => update({ heroHeight: Number(event.target.value) })}
          type="range"
          value={value.heroHeight}
        />
      </section>

      <div
        hidden={!showSlideshow}
        style={!showSlideshow ? { display: "none" } : undefined}
        className="grid min-w-0 gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-tapit-ink">Slideshow</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canPreviewSlideshow}
              onClick={() => setSlideshowPreviewOpen(true)}
              type="button"
              variant="secondary"
            >
              <Icon className="size-4" name="eye" />
              Preview slideshow
            </Button>
            <Button
              aria-describedby={uploadDescription("slideshow")}
              aria-invalid={uploadError("slideshow") ? true : undefined}
              aria-label="Add slideshow image"
              disabled={
                value.slideshow.length + slideshowQueue.length >= MAX_PROFILE_SLIDESHOW_IMAGES
              }
              onClick={() => slideshowInput.current?.click()}
              type="button"
              variant="tonal"
            >
              <Icon className="size-4" name="plus" />
              Add
            </Button>
          </div>
          <input
            accept={imageAccept}
            aria-label="Upload slideshow images"
            aria-describedby={uploadDescription("slideshow")}
            aria-invalid={uploadError("slideshow") ? true : undefined}
            className="sr-only"
            disabled={
              value.slideshow.length + slideshowQueue.length >= MAX_PROFILE_SLIDESHOW_IMAGES
            }
            multiple
            onChange={(event) => {
              enqueueSlideshowFiles(event.target.files ?? []);
              event.currentTarget.value = "";
            }}
            ref={slideshowInput}
            type="file"
          />
        </div>
        {slideshowQueue.map((entry, index) => (
          <div className={`${tileClass()} min-w-0 flex-wrap`} key={entry.clientKey}>
            <div
              aria-label={entry.altText}
              className="size-16 shrink-0 rounded-control bg-cover bg-center"
              role="img"
              style={{ backgroundImage: `url(${JSON.stringify(entry.previewUrl)})` }}
            />
            <div className="grid min-w-0 flex-1 basis-40 gap-1">
              <p className="break-all text-sm font-medium text-tapit-ink">{entry.file.name}</p>
              <p className="text-xs text-tapit-muted">Upload position {index + 1}</p>
              <p aria-live="polite" className="text-sm text-tapit-muted" role="status">
                {entry.status === "uploading"
                  ? "Uploading"
                  : entry.status === "failed"
                    ? `Upload failed: ${entry.error ?? "Try again."}`
                    : "Waiting"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {entry.status === "failed" ? (
                <Button
                  aria-label="Retry upload"
                  onClick={() => retrySlideshowUpload(entry.clientKey)}
                  type="button"
                  variant="secondary"
                >
                  Retry
                </Button>
              ) : null}
              <Button
                aria-label={`Remove ${entry.status === "failed" ? "failed slideshow image" : "slideshow upload"} ${entry.file.name}`}
                disabled={entry.status === "uploading"}
                onClick={() => removeSlideshowUpload(entry.clientKey)}
                type="button"
                variant="quiet"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <ol
          aria-label="Uploaded slideshow image order"
          className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(11rem,100%),1fr))] gap-4 empty:hidden"
        >
          {value.slideshow.map((image, index) => (
            <li
              aria-posinset={index + 1}
              aria-setsize={value.slideshow.length}
              className={`grid min-w-0 content-start gap-3 motion-safe:transition-opacity ${draggingSlide === index ? "opacity-60" : ""}`}
              data-slideshow-order-index={index}
              key={image.assetId}
            >
              {imageSource(image) ? (
                <div
                  aria-label={image.altText}
                  className="aspect-square w-full rounded-control bg-cover bg-center"
                  role="img"
                  style={{ backgroundImage: `url(${JSON.stringify(imageSource(image))})` }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="aspect-square w-full rounded-control bg-tapit-soft-surface"
                />
              )}
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-semibold text-tapit-ink">
                  Image {index + 1} of {value.slideshow.length}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    aria-label={`Reorder slideshow image ${index + 1}`}
                    className="grid size-11 shrink-0 touch-none cursor-grab place-items-center rounded-control text-tapit-muted active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
                    onPointerCancel={(event) => finishSlidePointerDrag(event, false)}
                    onPointerDown={(event) => handleSlidePointerDown(event, index)}
                    onPointerMove={handleSlidePointerMove}
                    onPointerUp={finishSlidePointerDrag}
                    title="Drag to reorder"
                    type="button"
                  >
                    <Icon className="size-5" name="dragHandle" weight="bold" />
                  </button>
                  <Button
                    aria-label={`Move slideshow image ${index + 1} up`}
                    className="size-11 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transform-none motion-reduce:transition-none"
                    disabled={index === 0}
                    onClick={() => reorderSlide(index, index - 1)}
                    type="button"
                    variant="quiet"
                  >
                    <Icon className="size-4" name="caretUp" weight="bold" />
                  </Button>
                  <Button
                    aria-label={`Move slideshow image ${index + 1} down`}
                    className="size-11 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transform-none motion-reduce:transition-none"
                    disabled={index === value.slideshow.length - 1}
                    onClick={() => reorderSlide(index, index + 1)}
                    type="button"
                    variant="quiet"
                  >
                    <Icon className="size-4" name="caretDown" weight="bold" />
                  </Button>
                </div>
              </div>
              <Field
                id={`${baseId}-slide-${index}-alt`}
                label={`Slideshow image ${index + 1} description`}
                help="Optional. Add a description if it helps explain the image."
                maxLength={160}
                onChange={(event) => updateSlide(index, { altText: event.target.value })}
                value={image.altText}
              />
              <div className="flex min-w-0 flex-wrap gap-2">
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
                  <Icon className="size-4" name="trash" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid gap-1 text-xs text-tapit-muted">
          <p>
            Shown as a slideshow under your name. {value.slideshow.length + slideshowQueue.length}{" "}
            of {MAX_PROFILE_SLIDESHOW_IMAGES} images.
          </p>
          {value.slideshow.length + slideshowQueue.length >= MAX_PROFILE_SLIDESHOW_IMAGES ? (
            <p>Maximum of 10 images. Remove an image to add another.</p>
          ) : null}
          {missingSlideshowImageCount > 0 ? (
            <p>Some slideshow images are unavailable for preview.</p>
          ) : null}
        </div>
        <p aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {slideshowAnnouncement}
        </p>
      </div>

      <label
        className="flex min-h-11 items-center gap-3 text-sm font-semibold text-tapit-ink"
        hidden={!showSlideshow}
        style={!showSlideshow ? { display: "none" } : undefined}
      >
        <input
          checked={value.autoplay}
          className="size-4 accent-tapit-accent"
          onChange={(event) => update({ autoplay: event.target.checked })}
          type="checkbox"
        />
        Autoplay slideshow while visible
      </label>

      {activeUploadFailure?.target === "background" ? (
        <span className="sr-only" id={`${baseId}-background-upload-error`}>
          {activeUploadFailure.message}
        </span>
      ) : null}
      {activeUploadFailure?.target === "slideshow" ? (
        <span className="sr-only" id={`${baseId}-slideshow-upload-error`}>
          {activeUploadFailure.message}
        </span>
      ) : null}
      {slideshowPreviewOpen && canPreviewSlideshow ? (
        <SlideshowPreviewDialog
          autoplay={value.autoplay}
          images={slideshowPreviewImages}
          onClose={() => setSlideshowPreviewOpen(false)}
        />
      ) : null}
      {error || activeUploadFailure ? (
        <div
          className={
            activeUploadFailure
              ? "grid gap-3 rounded-control bg-tapit-danger-soft px-4 py-3 sm:flex sm:items-center sm:justify-between"
              : undefined
          }
        >
          <p className="text-sm font-medium text-tapit-danger" role="alert">
            {error && activeUploadFailure && error !== activeUploadFailure.message
              ? `${error} ${activeUploadFailure.message}`
              : error || activeUploadFailure?.message}
          </p>
          {activeUploadFailure?.target === "background" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={retryBackgroundUpload}
                type="button"
                variant="secondary"
              >
                Retry upload
              </Button>
              <Button
                onClick={() => {
                  const pending = backgroundPending.current;
                  if (!pending || pending.status === "uploading") return;
                  backgroundPending.current = null;
                  revokePreview(pending.previewUrl);
                  setUploadFailure(undefined);
                  publishPending(slideshowQueueRef.current, null);
                  onMediaErrorClear?.();
                  void drainSlideshowQueue();
                }}
                type="button"
                variant="quiet"
              >
                Remove failed image
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
