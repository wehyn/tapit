import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMutation = vi.hoisted(() => vi.fn().mockResolvedValue({ updatedAt: 1 }));

vi.mock("convex/react", () => ({
  useMutation: () => saveMutation,
  useQuery: () => undefined,
}));

import {
  appendProfileLink,
  areProfileLinksEqual,
  canAddProfileLink,
  canPreviewLinks,
  normalizeLinkIcon,
  normalizeProfileLinks,
  LiveLinksEditorContent,
} from "@/components/forms/LinksEditor";
import { resetDemoState, setDemoSession } from "@/lib/demo/store";

const baseLink = {
  label: "Link",
  destination: "https://example.com",
  enabled: true,
  icon: "link" as const,
};

describe("LinksEditor controller boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoState();
    setDemoSession({ email: "mara@example.test", role: "customer" });
  });

  it("stops adding links at the 100-link limit", () => {
    expect(canAddProfileLink(99)).toBe(true);
    expect(canAddProfileLink(100)).toBe(false);
    expect(canAddProfileLink(101)).toBe(false);

    const hundredLinks = Array.from({ length: 100 }, (_, index) => ({
      ...baseLink,
      id: `link-${index}`,
    }));
    expect(appendProfileLink(hundredLinks, "link-overflow")).toHaveLength(100);
    expect(appendProfileLink(hundredLinks.slice(0, 99), "link-99")).toHaveLength(100);
  });

  it("normalizes unsupported persisted icons to the generic icon", () => {
    expect(normalizeLinkIcon(undefined)).toBe("link");
    expect(normalizeLinkIcon("legacy-icon")).toBe("link");
    expect(normalizeLinkIcon("linkedin")).toBe("linkedin");
  });

  it("compares normalized persisted links without a false dirty state", () => {
    const persistedLinks = [{ id: "site", ...baseLink, icon: undefined }];
    const normalizedLinks = normalizeProfileLinks(persistedLinks);

    expect(normalizedLinks[0]?.icon).toBe("link");
    expect(areProfileLinksEqual(normalizedLinks, persistedLinks)).toBe(true);
    expect(
      areProfileLinksEqual(normalizedLinks, [
        { id: "site", ...baseLink, destination: "https://changed.example", icon: undefined },
      ]),
    ).toBe(false);
  });

  it("only shows a preview when validation and publication checks pass", () => {
    expect(canPreviewLinks({}, [])).toBe(true);
    expect(canPreviewLinks({ site: "Link destination is unsafe." }, [])).toBe(false);
    expect(canPreviewLinks({}, ["Claim the attached card before publishing this profile."])).toBe(
      false,
    );
  });

  it("publishes live links against the image revision shown to the editor", async () => {
    saveMutation.mockClear();
    render(
      createElement(LiveLinksEditorContent, {
        profile: {
          _id: "profile-1",
          _creationTime: 1,
          ownerId: "customer-1",
          status: "draft",
          imageRevision: 7,
          draft: {
            name: "Mara Velasquez",
            slug: "mara-velasquez",
            links: [{ id: "site", ...baseLink }],
          },
          createdAt: 1,
          updatedAt: 1,
        } as never,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await screen.findByText("Profile published. Your active card paths now show this version.");
    expect(saveMutation).toHaveBeenCalledWith({
      profileId: "profile-1",
      expectedImageRevision: 7,
      expectedMediaRevision: 0,
    });
  });
});
