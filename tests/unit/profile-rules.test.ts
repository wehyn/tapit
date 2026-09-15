import { describe, expect, it } from "vitest";

import {
  MAX_PROFILE_SLUG_LENGTH,
  RESERVED_PROFILE_SLUGS,
  normalizeProfileSlug,
  publishProfile,
  validateProfileSlug,
  type ProfileContent,
  type ProfileRecord,
} from "../../src/lib/domain";
import { createProfileMetadata } from "../../src/app/[slug]/page";

const content: ProfileContent = {
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
};

function profile(): ProfileRecord {
  return {
    id: "profile-1",
    ownerId: "customer-1",
    status: "draft",
    draft: content,
    published: null,
  };
}

describe("profile slug rules", () => {
  it.each(["ada-lovelace", "a", "team-7"])('accepts "%s"', (slug) => {
    expect(validateProfileSlug(slug)).toBeNull();
  });

  it.each(["Ada-lovelace", "-ada", "ada-", "ada--lovelace", "ada_lovelace", ""])(
    'rejects "%s"',
    (slug) => {
      expect(validateProfileSlug(slug)).toMatch(/invalid/);
    },
  );

  it("normalizes slugs and rejects reserved or oversized routes", () => {
    expect(normalizeProfileSlug(" Ada-Lovelace ")).toBe("ada-lovelace");
    expect(validateProfileSlug("a".repeat(MAX_PROFILE_SLUG_LENGTH))).toBeNull();
    expect(validateProfileSlug("a".repeat(MAX_PROFILE_SLUG_LENGTH + 1))).toMatch(/invalid/);
    expect(RESERVED_PROFILE_SLUGS.has("login")).toBe(true);
    expect(validateProfileSlug("login")).toMatch(/reserved/);
    expect(RESERVED_PROFILE_SLUGS.has("c")).toBe(true);
    expect(validateProfileSlug("c")).toMatch(/reserved/);
  });

  it("rejects duplicate slugs during publication", () => {
    expect(() => publishProfile(profile(), "now", { existingSlugs: ["ada-lovelace"] })).toThrow(
      /already in use/,
    );
  });

  it("keeps the first published slug immutable", () => {
    const published = publishProfile(profile(), "first");
    expect(() =>
      publishProfile({ ...published, draft: { ...published.draft, slug: "new-slug" } }, "second"),
    ).toThrow(/cannot change/);
  });
});

describe("profile route metadata", () => {
  it("derives safe canonical metadata from the route and configured app URL", () => {
    const metadata = createProfileMetadata("ada-lovelace", "https://tapit.example");
    expect(metadata.title).toBe("Tapit profile");
    expect(metadata.description).toBe("A Tapit digital profile.");
    expect(metadata.alternates?.canonical).toBe("/ada-lovelace");
    expect(metadata.metadataBase?.toString()).toBe("https://tapit.example/");
    expect(metadata.openGraph).toMatchObject({ type: "profile" });
  });
});
