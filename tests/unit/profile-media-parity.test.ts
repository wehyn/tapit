import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";

import { WorkspacePreview } from "../../src/components/workspace/WorkspacePreview";
import {
  projectPublicProfile,
  type ProfileContent,
  type ProfileRecord,
} from "../../src/lib/domain";
import { projectDemoPublicProfile } from "../../src/lib/demo/projection";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import type { ProfileMediaPresentation } from "../../src/lib/profile-media";

const assetId = (value: string) => value as Id<"profileMediaAssets">;

const publishedMedia: ProfileMediaPresentation = {
  heroHeight: 360,
  autoplay: false,
  background: {
    assetId: assetId("published-background"),
    altText: "Published backdrop",
    positionX: 40,
    positionY: 60,
    url: "https://cdn.test/published-background.webp",
    previewUrl: "https://cdn.test/published-background-preview.webp",
  },
  slideshow: [
    {
      assetId: assetId("published-slide"),
      altText: "Published slide",
      url: "https://cdn.test/published-slide.webp",
      previewUrl: "https://cdn.test/published-slide-preview.webp",
    },
  ],
};

const draftMedia: ProfileMediaPresentation = {
  ...publishedMedia,
  background: {
    ...publishedMedia.background!,
    assetId: assetId("draft-background"),
    altText: "Draft-only backdrop",
    url: "https://cdn.test/draft-background.webp",
    previewUrl: "https://cdn.test/draft-background-preview.webp",
  },
};

const content: ProfileContent = {
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  links: [
    {
      id: "site",
      label: "Site",
      destination: "https://example.com",
      enabled: true,
    },
  ],
};

function profile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: "profile-1",
    ownerId: "customer-1",
    status: "published",
    draft: { ...content, media: draftMedia },
    published: {
      ...content,
      media: publishedMedia,
      publishedAt: "2026-09-24T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("Phase 2 profile media parity", () => {
  it("projects only published media and ignores draft-only media", () => {
    const projected = projectPublicProfile(profile());
    expect(projected?.media).toEqual({
      heroHeight: 360,
      autoplay: false,
      background: {
        src: "https://cdn.test/published-background-preview.webp",
        alt: "Published backdrop",
        positionX: 40,
        positionY: 60,
      },
      slideshow: [
        {
          src: "https://cdn.test/published-slide-preview.webp",
          alt: "Published slide",
        },
      ],
    });
    expect(projected?.media?.background?.alt).not.toBe("Draft-only backdrop");

    const draftOnly = profile({
      published: { ...content, publishedAt: "2026-09-24T00:00:00.000Z" },
    });
    expect(projectPublicProfile(draftOnly)?.media).toBeUndefined();
  });

  it("preserves published demo data-URL media", () => {
    const demoProfile = createDefaultDemoState().profiles[0];
    if (demoProfile === undefined || demoProfile.published === null) {
      throw new Error("Expected a published demo profile.");
    }

    const projected = projectDemoPublicProfile(demoProfile, {
      ...demoProfile.published,
      media: {
        heroHeight: 360,
        autoplay: false,
        background: {
          assetId: assetId("demo-background"),
          altText: "Published demo backdrop",
          positionX: 40,
          positionY: 60,
          url: "data:image/png;base64,background",
        },
        slideshow: [
          {
            assetId: assetId("demo-slide"),
            altText: "Published demo slide",
            url: "data:image/png;base64,slide",
          },
        ],
      },
    });

    expect(projected?.media).toEqual({
      heroHeight: 360,
      autoplay: false,
      background: {
        src: "data:image/png;base64,background",
        alt: "Published demo backdrop",
        positionX: 40,
        positionY: 60,
      },
      slideshow: [{ src: "data:image/png;base64,slide", alt: "Published demo slide" }],
    });
  });

  it("gives direct and card-style projection inputs the same public media shape", () => {
    const direct = projectPublicProfile(profile());
    const demoProfile = createDefaultDemoState().profiles[0];
    if (demoProfile === undefined) throw new Error("Expected a demo profile.");

    const cardStyle = projectDemoPublicProfile(demoProfile, {
      ...content,
      media: publishedMedia,
      publishedAt: "2026-09-24T00:00:00.000Z",
    });

    expect(cardStyle?.media).toEqual(direct?.media);
  });

  it("keeps the media background inside the profile preview rather than the preview shell", () => {
    const preview = projectPublicProfile(profile());
    if (preview === null) throw new Error("Expected a public profile projection.");

    render(
      createElement(WorkspacePreview, {
        mode: "desktop",
        onModeChange: () => undefined,
        preview,
        profileUrl: "https://tapit.test/ada-lovelace",
      }),
    );

    const shell = screen.getByRole("heading", { name: "Preview" }).closest("section");
    if (shell === null) throw new Error("Expected the preview shell.");
    expect(shell.style.backgroundImage).toBe("");
    const hero = screen.getByRole("region", { name: "Profile hero" });
    expect(hero.style.backgroundImage).toBe("");
    expect((hero.firstElementChild as HTMLElement | null)?.style.backgroundImage).toBe(
      'url("https://cdn.test/published-background-preview.webp")',
    );
  });
});
