"use client";

/* eslint-disable @next/next/no-img-element -- Published profile media is served from Convex storage URLs and needs native loading/decoding hints. */
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent } from "react";

import type { PublicProfileMediaImage } from "@/lib/profile-media";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CONTROLS_IDLE_DELAY_MS = 2800;

type PlaybackState = "playing" | "paused";

function subscribeToReducedMotion(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener?.("change", onStoreChange);
  return () => query.removeEventListener?.("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function ProfileSlideshow({
  images,
  autoplay,
  imageOutlineColor = "oklch(0 0 0 / 0.1)",
}: {
  images: PublicProfileMediaImage[];
  autoplay: boolean;
  imageOutlineColor?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("playing");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [fullImageOpen, setFullImageOpen] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const viewImageRef = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerId = useRef<number | null>(null);
  const controlsTimeout = useRef<number | null>(null);
  const total = images.length;
  const isPlaybackRunning =
    autoplay &&
    visible &&
    !reducedMotion &&
    playbackState === "playing" &&
    !fullImageOpen &&
    total > 1;
  const controlsShouldBeVisible = controlsVisible || !isPlaybackRunning;
  const showPlaybackControl = autoplay && !reducedMotion && total > 1;
  const showReducedMotionNotice = autoplay && reducedMotion && total > 1;

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry?.isIntersecting ?? false;
        setVisible(isVisible);
        if (isVisible) setControlsVisible(true);
      },
      {
        threshold: 0.1,
      },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaybackRunning) return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [isPlaybackRunning, total]);

  useEffect(() => {
    if (!isPlaybackRunning || keyboardFocused) {
      if (controlsTimeout.current !== null) {
        window.clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
      return;
    }

    if (controlsTimeout.current !== null) window.clearTimeout(controlsTimeout.current);
    controlsTimeout.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimeout.current = null;
    }, CONTROLS_IDLE_DELAY_MS);

    return () => {
      if (controlsTimeout.current !== null) {
        window.clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
    };
  }, [isPlaybackRunning, keyboardFocused]);

  useEffect(
    () => () => {
      if (controlsTimeout.current !== null) {
        window.clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
    },
    [],
  );

  if (total === 0) return null;

  const safeActiveIndex = activeIndex < total ? activeIndex : 0;
  const goTo = (index: number) => setActiveIndex((index + total) % total);
  const current = images[safeActiveIndex]!;
  const currentAlt = current.alt.trim() || `Slideshow image ${safeActiveIndex + 1}`;
  const revealControls = (keepVisible = !isPlaybackRunning || keyboardFocused) => {
    if (controlsTimeout.current !== null) {
      window.clearTimeout(controlsTimeout.current);
      controlsTimeout.current = null;
    }
    setControlsVisible(true);
    if (keepVisible || !isPlaybackRunning) return;
    controlsTimeout.current = window.setTimeout(() => {
      setControlsVisible(false);
      controlsTimeout.current = null;
    }, CONTROLS_IDLE_DELAY_MS);
  };
  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    pointerId.current = null;
  };

  return (
    <div
      role="region"
      ref={rootRef}
      aria-label="Profile slideshow"
      className="relative overflow-hidden rounded-tapit border border-[#e5d6c5] bg-[#fffdf9]"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setKeyboardFocused(false);
        revealControls(playbackState === "paused");
      }}
      onFocus={(event) => {
        const isKeyboardFocus =
          event.target instanceof HTMLElement && event.target.matches(":focus-visible");
        setKeyboardFocused(isKeyboardFocus);
        revealControls(playbackState === "paused" || isKeyboardFocus);
      }}
      onLostPointerCapture={() => {
        pointerStart.current = null;
        pointerId.current = null;
      }}
      onPointerCancel={(event) => {
        pointerStart.current = null;
        releasePointer(event);
      }}
      onPointerMove={() => revealControls()}
      onPointerDown={(event) => {
        setKeyboardFocused(false);
        revealControls(playbackState === "paused");
        if (event.target instanceof Element && event.target.closest("button")) return;
        pointerStart.current = { x: event.clientX, y: event.clientY };
        pointerId.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        const activePointerId = pointerId.current;
        releasePointer(event);
        if (activePointerId !== event.pointerId) return;
        pointerStart.current = null;
        if (start === null) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
        event.preventDefault();
        goTo(safeActiveIndex + (dx < 0 ? 1 : -1));
      }}
      style={{ touchAction: "pan-y" }}
    >
      <div className="relative aspect-[16/9] min-h-40">
        <img
          alt={currentAlt}
          className={`tapit-profile-slideshow-image tapit-image-outline absolute inset-0 size-full object-cover ${reducedMotion ? "tapit-profile-slideshow-image--reduced" : ""}`}
          decoding="async"
          key={safeActiveIndex}
          loading={safeActiveIndex === 0 ? "eager" : "lazy"}
          src={current.src}
          style={{ outlineColor: imageOutlineColor }}
        />
        <div
          className={`absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none ${controlsShouldBeVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {total > 1 ? (
            <>
              <button
                aria-label="Previous image"
                className="absolute left-3 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-[#fffdf9]/90 text-[#2c2420] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transition-none"
                onClick={() => goTo(safeActiveIndex - 1)}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={20} />
              </button>
              <button
                aria-label="Next image"
                className="absolute right-3 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-[#fffdf9]/90 text-[#2c2420] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transition-none"
                onClick={() => goTo(safeActiveIndex + 1)}
                type="button"
              >
                <ArrowRight aria-hidden="true" size={20} />
              </button>
            </>
          ) : null}
          {total > 1 ? (
            <div
              aria-label="Choose slideshow image"
              className={`absolute bottom-3 left-3 flex overflow-x-auto rounded-full bg-[#2c2420]/45 p-1 ${showPlaybackControl ? "right-[10.5rem]" : "right-3"}`}
              role="group"
            >
              {images.map((image, index) => (
                <button
                  aria-current={index === safeActiveIndex ? "true" : undefined}
                  aria-label={`Image ${index + 1} of ${total}`}
                  className="grid min-h-8 min-w-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
                  key={index}
                  onClick={() => goTo(index)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-full ${index === safeActiveIndex ? "bg-white" : "bg-white/55"}`}
                  />
                </button>
              ))}
            </div>
          ) : null}
          {showPlaybackControl ? (
            <button
              aria-pressed={playbackState === "paused"}
              className="absolute bottom-3 right-3 rounded-full bg-[#fffdf9]/90 px-4 py-2.5 text-sm font-semibold text-[#2c2420] shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transition-none"
              onClick={() => {
                const nextState = playbackState === "playing" ? "paused" : "playing";
                setPlaybackState(nextState);
                revealControls(nextState === "paused" || keyboardFocused);
              }}
              type="button"
            >
              {playbackState === "paused" ? "Play slideshow" : "Pause slideshow"}
            </button>
          ) : null}
        </div>
      </div>
      <button
        className="mx-auto my-1 block min-h-11 rounded-full px-4 py-2.5 text-sm font-semibold text-[#2c2420] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
        onClick={() => {
          dialogRef.current?.showModal();
          setFullImageOpen(true);
        }}
        ref={viewImageRef}
        type="button"
      >
        View image
      </button>
      {showReducedMotionNotice ? (
        <p className="border-t border-[#e5d6c5] px-4 py-3 text-sm text-[#594c43]" role="status">
          Your reduced-motion preference disables autoplay. Use Previous image, Next image, or the
          image picker to browse manually.
        </p>
      ) : null}
      <dialog
        aria-label="Full slideshow image"
        className="fixed inset-0 m-auto h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-5xl flex-col rounded-tapit border border-[#e5d6c5] bg-[#fffdf9] p-4 shadow-xl open:flex backdrop:bg-black/80"
        onClose={() => {
          setFullImageOpen(false);
          viewImageRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <button
          className="ml-auto mb-2 block min-h-11 shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-[#2c2420] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
          onClick={() => dialogRef.current?.close()}
          type="button"
        >
          Close full image
        </button>
        <img
          alt={currentAlt}
          className="mx-auto block min-h-0 w-full flex-1 object-contain"
          src={current.src}
        />
      </dialog>
    </div>
  );
}
