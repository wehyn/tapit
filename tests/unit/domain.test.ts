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

  it("rejects an enabled invalid redirect during publication", () => {
    expect(() =>
      publishProfile(
        { ...profile(), draft: { ...draft, redirect: { enabled: true, destination: "" } } },
        "now",
      ),
    ).toThrow("Redirect destination must be a valid HTTPS URL without credentials.");
  });

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
