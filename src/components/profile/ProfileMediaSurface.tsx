import { useId, type CSSProperties, type ReactNode } from "react";

import type { PublicProfileMediaPresentation } from "@/lib/profile-media";

export function ProfileMediaSurface({
  background,
  children,
  heroHeight,
  treatment = "legacy",
  className,
  compact = false,
  fullSurface = false,
  responsivePortrait = false,
}: {
  background: NonNullable<PublicProfileMediaPresentation["background"]>;
  children?: ReactNode;
  heroHeight: number;
  treatment?: "warm" | "legacy";
  className?: string;
  compact?: boolean;
  fullSurface?: boolean;
  responsivePortrait?: boolean;
}) {
  const height = Math.min(520, Math.max(220, heroHeight));
  const descriptionId = useId();
  const imageHeight = height;
  const fadeHeight = height;
  const fullSurfaceContentOffset = fullSurface
    ? responsivePortrait
      ? "pt-[calc(var(--tapit-profile-hero-height)-2.5rem)] sm:pt-[calc(var(--tapit-profile-hero-height)-3rem)]"
      : "pt-[calc(var(--tapit-profile-hero-height)-2.5rem)]"
    : "";

  return (
    <section
      aria-describedby={descriptionId}
      aria-label="Profile hero"
      className={`${fullSurface ? "relative isolate" : compact ? "relative isolate overflow-hidden" : "relative sm:isolate sm:overflow-hidden"} ${className ?? "rounded-tapit border border-[#e5d6c5]"}`}
      role="region"
      style={
        fullSurface
          ? ({ "--tapit-profile-hero-height": `${height}px` } as CSSProperties)
          : { height }
      }
      data-hero-height={height}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bg-cover"
        style={{
          backgroundImage: `url(${JSON.stringify(background.src)})`,
          backgroundPosition: `${background.positionX}% ${background.positionY}%`,
          height: imageHeight,
        }}
      />
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 ${
          fullSurface
            ? ""
            : treatment === "warm"
              ? "bg-gradient-to-b from-[#17120f]/5 via-[#17120f]/15 to-[#17120f]/80"
              : "bg-[#2c2420]/45"
        }`}
        style={{
          height: fadeHeight,
          ...(fullSurface
            ? {
                backgroundImage:
                  "linear-gradient(to bottom, rgb(44 36 32 / 0%) 0%, rgb(44 36 32 / 8%) 48%, transparent 100%)",
              }
            : {}),
        }}
      />
      <div
        className={`relative z-10 ${fullSurfaceContentOffset} ${
          fullSurface
            ? compact
              ? "px-4 pb-6"
              : "px-4 pb-8 sm:px-6 sm:pb-10"
            : children
              ? `-mt-14 px-4 pb-1 ${compact ? "pt-0" : "sm:-mt-16 sm:px-6"}`
              : ""
        }`}
      >
        {children}
      </div>
      <p className="sr-only" id={descriptionId}>
        {background.alt}
      </p>
    </section>
  );
}
