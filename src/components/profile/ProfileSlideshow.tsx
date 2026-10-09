"use client";

/* eslint-disable @next/next/no-img-element -- Published profile media is served from Convex storage URLs and needs native loading/decoding hints. */
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent } from "react";

import type { PublicProfileMediaImage } from "@/lib/profile-media";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

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
}: {
  images: PublicProfileMediaImage[];
  autoplay: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerId = useRef<number | null>(null);
  const total = images.length;

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      {
        threshold: 0.1,
      },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoplay || !visible || reducedMotion || userPaused || hovered || focused || total <= 1)
      return;
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % total);
    }, 4000);
    return () => window.clearInterval(interval);
  }, [autoplay, focused, hovered, reducedMotion, total, userPaused, visible]);

  if (total === 0) return null;

  const safeActiveIndex = activeIndex < total ? activeIndex : 0;
  const goTo = (index: number) => setActiveIndex((index + total) % total);
  const current = images[safeActiveIndex]!;
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
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onFocus={() => setFocused(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onLostPointerCapture={() => {
        pointerStart.current = null;
        pointerId.current = null;
      }}
      onPointerCancel={(event) => {
        pointerStart.current = null;
        releasePointer(event);
      }}
      onPointerDown={(event) => {
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
          alt={current.alt.trim() || `Slideshow image ${safeActiveIndex + 1}`}
          className={`tapit-profile-slideshow-image absolute inset-0 size-full object-cover ${reducedMotion ? "tapit-profile-slideshow-image--reduced" : ""}`}
          decoding="async"
          key={current.src}
          loading={safeActiveIndex === 0 ? "eager" : "lazy"}
          src={current.src}
        />
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
      </div>
      {autoplay ? (
        <button
          aria-pressed={userPaused}
          className="mx-auto mb-1 block rounded-full px-3 py-2 text-sm font-semibold text-[#2c2420] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
          onClick={() => setUserPaused((paused) => !paused)}
          type="button"
        >
          {userPaused ? "Play slideshow" : "Pause slideshow"}
        </button>
      ) : null}
      {total > 1 ? (
        <div className="flex justify-center gap-2 px-4 py-3" aria-label="Choose slideshow image">
          {images.map((image, index) => (
            <button
              aria-current={index === safeActiveIndex ? "true" : undefined}
              aria-label={`Image ${index + 1} of ${total}`}
              className="grid min-h-8 min-w-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
              key={image.src}
              onClick={() => goTo(index)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${index === safeActiveIndex ? "bg-[#a84431]" : "bg-[#d8c6b7]"}`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
