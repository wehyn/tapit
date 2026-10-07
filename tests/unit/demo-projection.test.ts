import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";

import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { getDemoProfileById, getDemoTheme, updateDemoProfile } from "../../src/lib/demo/store";
import { projectDemoPublicProfile } from "../../src/lib/demo/projection";

describe("demo public projection", () => {
  it("uses the persisted profile theme map over a stale profile theme", () => {
    const state = createDefaultDemoState();
    const initialProfile = state.profiles[0];
    if (initialProfile === undefined) throw new Error("Expected demo profile");
    const profileId = initialProfile.id;
    const profile = getDemoProfileById(state, profileId);
    if (profile === undefined) throw new Error("Expected demo profile");

    const persistedState = {
      ...state,
      themes: { ...state.themes, [profileId]: "moss" as const },
      profiles: state.profiles.map((candidate) =>
        candidate.id === profileId ? { ...candidate, theme: "paper" as const } : candidate,
      ),
    };
    const persistedProfile = getDemoProfileById(persistedState, profileId);
    if (persistedProfile === undefined) throw new Error("Expected persisted demo profile");

    expect(
      projectDemoPublicProfile(
        persistedProfile,
        persistedProfile.published,
        getDemoTheme(persistedState, profileId),
      )?.theme,
    ).toBe("moss");
  });

  it("prefers an explicit published theme over a stale legacy theme map", () => {
    const state = createDefaultDemoState();
    const initialProfile = state.profiles[0];
    if (initialProfile === undefined || initialProfile.published === null) {
      throw new Error("Expected a published demo profile");
    }
    const profile = {
      ...initialProfile,
      published: { ...initialProfile.published, theme: "paper" as const },
    };

    expect(projectDemoPublicProfile(profile, profile.published, "moss")?.theme).toBe("paper");
  });

  it("preserves the authoritative theme map during a stale profile update", () => {
    const state = createDefaultDemoState();
    const profile = state.profiles[0];
    if (profile === undefined) throw new Error("Expected demo profile");
    const persistedState = {
      ...state,
      themes: { ...state.themes, [profile.id]: "moss" as const },
      profiles: state.profiles.map((candidate) =>
        candidate.id === profile.id ? { ...candidate, theme: "paper" as const } : candidate,
      ),
    };

    const updated = updateDemoProfile(persistedState, profile.id, (current) => ({
      ...current,
      bio: "Updated bio",
      theme: "night",
    }));

    expect(updated.themes[profile.id]).toBe("moss");
    expect(updated.profiles.find((candidate) => candidate.id === profile.id)?.theme).toBe("night");
  });

  it("projects demo-published media URLs for the public profile", () => {
    const state = createDefaultDemoState();
    const profile = state.profiles[0];
    if (profile === undefined || profile.published === null)
      throw new Error("Expected demo profile");

    profile.published = {
      ...profile.published,
      media: {
        heroHeight: 360,
        autoplay: false,
        background: {
          assetId: "demo-background" as Id<"profileMediaAssets">,
          altText: "Published demo backdrop",
          positionX: 40,
          positionY: 60,
          url: "data:image/png;base64,background",
        },
        slideshow: [
          {
            assetId: "demo-slide" as Id<"profileMediaAssets">,
            altText: "Published demo slide",
            url: "data:image/png;base64,slide",
          },
        ],
      },
    };

    expect(projectDemoPublicProfile(profile)?.media).toEqual({
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
});
