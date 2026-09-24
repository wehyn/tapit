import { describe, expect, it } from "vitest";
import {
  approveDeletion,
  applyDeletion,
  canTransitionCard,
  createDeletionAuditPayload,
  hasUnpublishedChanges,
  isAllowedLinkDestination,
  projectPublicProfile,
  publishProfile,
  requestDeletion,
  transitionCard,
  type ProfileContent,
  type ProfileRecord,
  validateProfileRedirect,
  validateRedirectDestination,
} from "../../src/lib/domain";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "../../src/lib/profile-customization";
import type { Id } from "../../convex/_generated/dataModel";

const assetId = (value: string) => value as Id<"profileMediaAssets">;

const websiteLink = {
  id: "one",
  label: "Website",
  destination: "https://example.com",
  enabled: true,
};

const draft: ProfileContent = {
  name: "Ada Lovelace",
  slug: "ada-lovelace",
  bio: "Draft bio",
  links: [
    websiteLink,
    { id: "two", label: "Hidden", destination: "https://hidden.example", enabled: false },
  ],
};

function profile(): ProfileRecord {
  return { id: "profile-1", ownerId: "customer-1", status: "draft", draft, published: null };
}

describe("profile publication and public projection", () => {
  it("validates profile redirect destinations", () => {
    expect(validateRedirectDestination("https://example.com/path")).toBeNull();
    expect(validateRedirectDestination("HTTPS://EXAMPLE.COM/path")).toBeNull();
    for (const destination of [
      "",
      "   ",
      "not a url",
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,evil",
      "https://",
      "https://user:password@example.com",
    ]) {
      expect(validateRedirectDestination(destination)).toBe(
        "Redirect destination must be a valid HTTPS URL without credentials.",
      );
    }
  });

  it("rejects credential-bearing profile websites during publication", () => {
    expect(() =>
      publishProfile(
        { ...profile(), draft: { ...draft, website: "https://user:password@example.com" } },
        "now",
      ),
    ).toThrow("A profile website must be a valid HTTPS URL without credentials.");
  });

  it("allows missing or disabled redirects, but validates enabled redirects", () => {
    expect(validateProfileRedirect(undefined)).toBeNull();
    expect(validateProfileRedirect({ enabled: false, destination: "" })).toBeNull();
    expect(validateProfileRedirect({ enabled: true, destination: "" })).toBe(
      "Redirect destination must be a valid HTTPS URL without credentials.",
    );
  });

  it("copies a redirect into the published snapshot and detects changes", () => {
    const withRedirect = {
      ...profile(),
      draft: {
        ...draft,
        redirect: { enabled: true, destination: "https://example.com/redirect" },
      },
    };
    const published = publishProfile(withRedirect, "first");

    expect(published.published?.redirect).toEqual(withRedirect.draft.redirect);
    expect(hasUnpublishedChanges(published.draft, published.published)).toBe(false);
    expect(
      hasUnpublishedChanges(
        {
          ...published.draft,
          redirect: { enabled: true, destination: "https://example.com/other" },
        },
        published.published,
      ),
    ).toBe(true);
  });

  it("compares and projects only published media", () => {
    const media = {
      heroHeight: 360,
      autoplay: true,
      background: {
        assetId: assetId("background"),
        altText: "Published backdrop",
        positionX: 50,
        positionY: 50,
        url: "https://cdn.test/published.jpg",
        previewUrl: "https://cdn.test/published-preview.jpg",
      },
      slideshow: [
        {
          assetId: assetId("slide"),
          altText: "Published slide",
          url: "https://cdn.test/slide.jpg",
          previewUrl: "https://cdn.test/slide-preview.jpg",
        },
      ],
    };
    const published = publishProfile({ ...profile(), draft: { ...draft, media } }, "first");
    const changed = {
      ...published,
      draft: {
        ...published.draft,
        media: { ...media, heroHeight: 420 },
      },
    };

    expect(hasUnpublishedChanges(published.draft, published.published)).toBe(false);
    expect(hasUnpublishedChanges(changed.draft, published.published)).toBe(true);
    const resolvedPublished = {
      ...published,
      published: { ...published.published!, media },
    };
    expect(projectPublicProfile(resolvedPublished)?.media).toEqual({
      heroHeight: 360,
      autoplay: true,
      background: {
        src: "https://cdn.test/published-preview.jpg",
        alt: "Published backdrop",
        positionX: 50,
        positionY: 50,
      },
      slideshow: [
        {
          src: "https://cdn.test/slide-preview.jpg",
          alt: "Published slide",
        },
      ],
    });
    expect(projectPublicProfile(resolvedPublished)?.media?.background).not.toHaveProperty(
      "assetId",
    );
    expect(projectPublicProfile(resolvedPublished)?.media?.slideshow[0]).not.toHaveProperty("url");

    const draftOnly = {
      ...resolvedPublished,
      draft: {
        ...published.draft,
        media: {
          ...media,
          background: { ...media.background, url: "https://cdn.test/draft-only.jpg" },
        },
      },
    };
    expect(projectPublicProfile(draftOnly)?.media).toEqual(
      projectPublicProfile(resolvedPublished)?.media,
    );
    expect(
      projectPublicProfile({ ...profile(), draft: { ...draft, media } })?.media,
    ).toBeUndefined();
  });

  it("does not throw when comparing malformed media", () => {
    const malformedDraft = {
      ...draft,
      media: null,
    } as unknown as ProfileContent;
    const malformedPublished = {
      ...draft,
      media: { heroHeight: 320, autoplay: true },
      publishedAt: "first",
    } as unknown as ProfileRecord["published"];
    const malformedDraftValue = {
      ...draft,
      media: [null, { background: "invalid" }],
    } as unknown as ProfileContent;

    expect(() => hasUnpublishedChanges(malformedDraft, malformedPublished)).not.toThrow();
    expect(() => hasUnpublishedChanges(malformedDraftValue, malformedPublished)).not.toThrow();
  });

  it("deeply isolates nested customization data in the published snapshot", () => {
    const customization = {
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      section: { kind: "services" as const, body: "Services", items: ["Consulting"] },
    };
    const source = { ...profile(), draft: { ...draft, customization } };
    const published = publishProfile(source, "first");

    customization.section!.items![0] = "Changed draft";
    expect(published.published?.customization?.section).toEqual({
      kind: "services",
      body: "Services",
      items: ["Consulting"],
    });

    const publishedSection = published.published!.customization!.section!;
    if (publishedSection.kind !== "services") throw new Error("Expected services section");
    publishedSection.items![0] = "Changed published";
    expect(source.draft.customization?.section).toEqual({
      kind: "services",
      body: "Services",
      items: ["Changed draft"],
    });
  });

  it("rejects an enabled invalid redirect during publication", () => {
    expect(() =>
      publishProfile(
        { ...profile(), draft: { ...draft, redirect: { enabled: true, destination: "" } } },
        "now",
      ),
    ).toThrow("Redirect destination must be a valid HTTPS URL without credentials.");
  });

  it.each([undefined, "hidden"])(
    "does not block publication when featured link id is %s",
    (featuredLinkId) => {
      const published = publishProfile(
        {
          ...profile(),
          draft: {
            ...draft,
            customization: { ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, featuredLinkId },
          },
        },
        "now",
      );

      expect(published.published?.customization?.featuredLinkId).toBe(featuredLinkId);
    },
  );

  it("compares draft content without considering the publication timestamp", () => {
    const published = publishProfile(profile(), "first");

    expect(hasUnpublishedChanges(published.draft, published.published)).toBe(false);
    expect(
      hasUnpublishedChanges(published.draft, { ...published.published!, publishedAt: "second" }),
    ).toBe(false);
    expect(
      hasUnpublishedChanges(
        { ...published.draft, name: "Changed draft" },
        { ...published.published!, publishedAt: "second" },
      ),
    ).toBe(true);
    expect(
      hasUnpublishedChanges(
        {
          links: published.draft.links.map((link) => ({
            enabled: link.enabled,
            destination: link.destination,
            label: link.label,
            id: link.id,
          })),
          website: published.draft.website,
          slug: published.draft.slug,
          name: published.draft.name,
          bio: published.draft.bio,
          email: published.draft.email,
        },
        {
          publishedAt: "third",
          links: published.published!.links.map((link) => ({
            id: link.id,
            label: link.label,
            destination: link.destination,
            enabled: link.enabled,
          })),
          email: published.published!.email,
          name: published.published!.name,
          slug: published.published!.slug,
          bio: published.published!.bio,
          website: published.published!.website,
        },
      ),
    ).toBe(false);
    expect(
      hasUnpublishedChanges(
        { ...published.draft, email: undefined, phone: undefined },
        published.published,
      ),
    ).toBe(false);
    expect(hasUnpublishedChanges(draft, null)).toBe(true);
    expect(hasUnpublishedChanges(draft, undefined)).toBe(true);
  });

  it("treats a missing legacy redirect as the disabled default", () => {
    const legacyPublished = {
      ...draft,
      publishedAt: "first",
    };
    const disabledDraft = {
      ...draft,
      redirect: { enabled: false, destination: "" },
    };

    expect(hasUnpublishedChanges(disabledDraft, legacyPublished)).toBe(false);
    expect(
      hasUnpublishedChanges(
        { ...disabledDraft, redirect: { enabled: true, destination: "https://example.com" } },
        legacyPublished,
      ),
    ).toBe(true);
  });

  it("requires a name and at least one valid enabled link", () => {
    expect(() =>
      publishProfile({ ...profile(), draft: { ...draft, name: "", links: [] } }, "now"),
    ).toThrow();
    expect(() =>
      publishProfile(
        { ...profile(), draft: { ...draft, links: [{ ...websiteLink, enabled: false }] } },
        "now",
      ),
    ).toThrow();
  });

  it("keeps draft changes private and omits disabled links", () => {
    const published = publishProfile(profile(), "first");
    const changed = {
      ...published,
      draft: {
        ...published.draft,
        name: "Private draft",
        links: [{ ...websiteLink, enabled: false }],
      },
    };
    const publicProfile = projectPublicProfile(changed);
    expect(publicProfile?.name).toBe("Ada Lovelace");
    expect(publicProfile?.links).toHaveLength(1);
    expect(publicProfile?.links[0]?.label).toBe("Website");
  });

  it("projects customization only from the published snapshot", () => {
    const published = publishProfile(
      { ...profile(), draft: { ...draft, customization: DEFAULT_WARM_STUDIO_CUSTOMIZATION } },
      "first",
    );
    const changed = {
      ...published,
      draft: {
        ...published.draft,
        customization: { ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, accent: "jade" as const },
      },
    };
    expect(projectPublicProfile(changed)?.customization).toEqual(DEFAULT_WARM_STUDIO_CUSTOMIZATION);
  });

  it("deeply isolates nested customization data in the public projection", () => {
    const published = publishProfile(
      {
        ...profile(),
        draft: {
          ...draft,
          customization: {
            ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
            section: { kind: "services", body: "Services", items: ["Consulting"] },
          },
        },
      },
      "first",
    );
    const projection = projectPublicProfile(published)!;

    const projectionSection = projection.customization!.section!;
    if (projectionSection.kind !== "services") throw new Error("Expected services section");
    projectionSection.items![0] = "Changed projection";

    expect(published.published?.customization?.section).toEqual({
      kind: "services",
      body: "Services",
      items: ["Consulting"],
    });
  });

  it.each(["paper", "moss", "night"] as const)(
    "preserves legacy %s theme without customization",
    (theme) => {
      const published = publishProfile({ ...profile(), draft: { ...draft, theme } }, "first");
      const projection = projectPublicProfile(published);

      expect(projection?.theme).toBe(theme);
      expect(projection?.customization).toBeUndefined();
    },
  );

  it("uses published customization when present alongside the legacy theme", () => {
    const published = publishProfile(
      {
        ...profile(),
        draft: {
          ...draft,
          theme: "night",
          customization: DEFAULT_WARM_STUDIO_CUSTOMIZATION,
        },
      },
      "first",
    );

    expect(projectPublicProfile(published)).toMatchObject({
      theme: "night",
      customization: DEFAULT_WARM_STUDIO_CUSTOMIZATION,
    });
  });

  it("does not allow a published slug to change", () => {
    const published = publishProfile(profile(), "first");
    expect(() =>
      publishProfile({ ...published, draft: { ...published.draft, slug: "changed" } }, "second"),
    ).toThrow(/slug cannot change/);
  });
});

describe("link safety", () => {
  it.each(["https://example.com", "mailto:hello@example.com", "tel:+15551212"])(
    "allows %s",
    (destination) => expect(isAllowedLinkDestination(destination)).toBe(true),
  );

  it.each(["", "javascript:alert(1)", "data:text/html,evil", "http://example.com", "https://"])(
    "rejects %s",
    (destination) => expect(isAllowedLinkDestination(destination)).toBe(false),
  );
});

describe("card state machine", () => {
  it("requires claiming before a card can become active", () => {
    expect(canTransitionCard("registered", "claimable")).toBe(true);
    expect(canTransitionCard("registered", "active")).toBe(false);
    expect(canTransitionCard("active", "inactive")).toBe(true);
    expect(canTransitionCard("active", "replaced")).toBe(true);
    expect(canTransitionCard("inactive", "active")).toBe(false);
    expect(canTransitionCard("replaced", "active")).toBe(false);
    const claimable = transitionCard(
      { id: "card-1", cardUrl: "https://tapit.test/c/1", status: "registered" },
      "claimable",
      "profile-1",
    );
    const active = transitionCard(claimable, "active", "profile-1");
    expect(transitionCard(active, "replaced", undefined, "card-2").replacedByCardId).toBe("card-2");
  });
});

describe("deletion and access boundaries", () => {
  it("models deletion request/approval and produces an administrative audit payload", () => {
    expect(approveDeletion(requestDeletion("active"))).toBe("deleted");
    const payload = createDeletionAuditPayload(
      { id: "admin-1", role: "admin" },
      "account-1",
      profile(),
      [
        {
          id: "card-1",
          cardUrl: "https://tapit.test/c/1",
          status: "active",
          profileId: "profile-1",
        },
      ],
      "later",
    );
    expect(payload.after).toEqual({
      profileStatus: "unpublished",
      cardStatus: "inactive",
      cardIds: ["card-1"],
    });
    expect(
      applyDeletion(profile(), [
        {
          id: "card-1",
          cardUrl: "https://tapit.test/c/1",
          status: "active",
          profileId: "profile-1",
        },
      ]).cards[0]?.status,
    ).toBe("inactive");
  });
});
