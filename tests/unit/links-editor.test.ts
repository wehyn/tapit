import { describe, expect, it } from "vitest";

import {
  appendProfileLink,
  areProfileLinksEqual,
  canAddProfileLink,
  canPreviewLinks,
  normalizeLinkIcon,
  normalizeProfileLinks,
} from "@/components/forms/LinksEditor";

const baseLink = {
  label: "Link",
  destination: "https://example.com",
  enabled: true,
  icon: "link" as const,
};

describe("LinksEditor controller boundaries", () => {
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
});
