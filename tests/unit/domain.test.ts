import { describe, expect, it } from "vitest";
import {
  approveDeletion,
  applyDeletion,
  canTransitionCard,
  createDeletionAuditPayload,
  isAllowedLinkDestination,
  projectPublicProfile,
  publishProfile,
  requestDeletion,
  transitionCard,
  type ProfileContent,
  type ProfileRecord,
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
  it("allows registration to active to inactive/replaced only", () => {
    expect(canTransitionCard("registered", "active")).toBe(true);
    expect(canTransitionCard("active", "inactive")).toBe(true);
    expect(canTransitionCard("active", "replaced")).toBe(true);
    expect(canTransitionCard("inactive", "active")).toBe(false);
    expect(canTransitionCard("replaced", "active")).toBe(false);
    const active = transitionCard(
      { id: "card-1", cardUrl: "https://tapit.test/c/1", status: "registered" },
      "active",
      "profile-1",
    );
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
