import { useId } from "react";

import type { PublicProfileMediaPresentation } from "@/lib/profile-media";

export function ProfileMediaSurface({
  background,
  heroHeight,
}: {
  background: NonNullable<PublicProfileMediaPresentation["background"]>;
  heroHeight: number;
}) {
  const height = Math.min(520, Math.max(220, heroHeight));
  const descriptionId = useId();

  return (
    <section
      aria-describedby={descriptionId}
      aria-label="Profile hero"
      className="relative isolate overflow-hidden rounded-tapit border border-[#e5d6c5]"
      role="region"
      style={{ height }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: `url(${JSON.stringify(background.src)})`,
          backgroundPosition: `${background.positionX}% ${background.positionY}%`,
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[#2c2420]/45" />
      <p className="sr-only" id={descriptionId}>
        {background.alt}
      </p>
    </section>
  );
}
