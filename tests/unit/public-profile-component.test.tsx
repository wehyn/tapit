import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import type { LinkIcon } from "@/lib/domain";
import { PublicProfile } from "../../src/components/profile/PublicProfile";
import { projectPublicProfile } from "../../src/lib/domain";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { getDemoState, resetDemoState } from "../../src/lib/demo/store";

const profile = createDefaultDemoState().profiles[0];
const projection = profile === undefined ? null : projectPublicProfile(profile);

describe("public profile preview behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoState();
  });

  it("does not record analytics when a preview link is clicked", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");

    render(
      <PublicProfile
        preview
        profile={projection}
        profileId="profile-mara"
        trackClicks={false}
        trackView={false}
      />,
    );

    const before = JSON.stringify(getDemoState().analytics);
    fireEvent.click(screen.getByRole("link", { name: "Portfolio" }));

    expect(JSON.stringify(getDemoState().analytics)).toBe(before);
  });

  it("falls back safely when a malformed persisted icon reaches the preview", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");

    render(
      <PublicProfile
        preview
        profile={{
          ...projection,
          links: [
            {
              id: "malformed",
              label: "Malformed icon",
              destination: "https://example.com",
              enabled: true,
              icon: "constructor" as LinkIcon,
            },
          ],
        }}
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Malformed icon" })).toBeVisible();
  });

  it("lets the browser select a published image variant by rendered size", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");

    render(
      <PublicProfile
        profile={{
          ...projection,
          imageUrl: "https://images.example/large.png",
          imageSrcSet:
            "https://images.example/small.png 192w, https://images.example/large.png 384w",
        }}
        trackClicks={false}
        trackView={false}
      />,
    );

    const image = screen.getByRole("img", { name: `${projection.name} profile` });
    expect(image).toHaveAttribute(
      "srcset",
      "https://images.example/small.png 192w, https://images.example/large.png 384w",
    );
    expect(image).toHaveAttribute("sizes", "(min-width: 640px) 96px, 80px");
    expect(image).toHaveAttribute("src", "https://images.example/large.png");
  });
});
