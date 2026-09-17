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
        profileUrl="/mara-velasquez"
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
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Malformed icon" })).toBeVisible();
  });
});
