import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMutation = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ updatedAt: 1, draftRevision: 0 }),
);

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
import { DraftSaveProvider, useDraftStatus } from "@/components/layout/DraftSaveContext";

function DraftStatusProbe() {
  return createElement("output", null, useDraftStatus());
}

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

  it("saves live link edits against the draft revision shown to the editor", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    saveMutation.mockResolvedValue({ updatedAt: 2, draftRevision: 8 });
    render(
      createElement(LiveLinksEditorContent, {
        profile: {
          _id: "profile-1",
          _creationTime: 1,
          ownerId: "customer-1",
          status: "draft",
          draftRevision: 7,
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

    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.click(screen.getByRole("button", { name: "Website or link" }));
    await user.type(screen.getByLabelText("Label", { exact: true }), "New site");
    await user.type(screen.getByLabelText("Web address"), "https://new.example.com");
    await user.click(screen.getByRole("dialog").querySelector('button[type="submit"]')!);
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(saveMutation).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "profile-1", expectedDraftRevision: 7 }),
      ),
    );
  });

  it("adopts a remote redirect update and saves against its new draft revision", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    saveMutation.mockResolvedValue({ updatedAt: 2, draftRevision: 12 });
    const initialProfile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 7,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", ...baseLink }],
        redirect: { enabled: true, destination: "https://old.example.com" },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    const view = render(
      createElement(
        DraftSaveProvider,
        null,
        createElement(DraftStatusProbe),
        createElement(LiveLinksEditorContent, { profile: initialProfile as never }),
      ),
    );

    view.rerender(
      createElement(
        DraftSaveProvider,
        null,
        createElement(DraftStatusProbe),
        createElement(LiveLinksEditorContent, {
          profile: {
            ...initialProfile,
            draftRevision: 11,
            draft: {
              ...initialProfile.draft,
              redirect: { enabled: true, destination: "https://new.example.com" },
            },
          } as never,
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByLabelText("HTTPS destination URL")).toHaveValue("new.example.com");
      expect(screen.getByText("saved", { selector: "output" })).toBeVisible();
    });
    await user.clear(screen.getByLabelText("HTTPS destination URL"));
    await user.type(screen.getByLabelText("HTTPS destination URL"), "https://later.example.com");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(saveMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedDraftRevision: 11,
          redirect: { enabled: true, destination: "https://later.example.com" },
        }),
      ),
    );
  });

  it("blocks saving while an enabled link is invalid and says to switch back to fix it", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    const profile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 4,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", label: "", destination: "javascript:alert(1)", enabled: true }],
        redirect: { enabled: true, destination: "https://old.example.com" },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    render(createElement(LiveLinksEditorContent, { profile: profile as never }));

    await user.clear(screen.getByLabelText("HTTPS destination URL"));
    await user.type(screen.getByLabelText("HTTPS destination URL"), "https://new.example.com");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("Switch to Tapit profile to fix your links before saving."),
    ).toBeVisible();
    expect(saveMutation).not.toHaveBeenCalled();
  });

  it("does not advance the draft revision over unsaved link edits", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    saveMutation.mockResolvedValue({ updatedAt: 2, draftRevision: 12 });
    const initialProfile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 7,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", ...baseLink }],
      },
      createdAt: 1,
      updatedAt: 1,
    };
    const view = render(
      createElement(
        DraftSaveProvider,
        null,
        createElement(DraftStatusProbe),
        createElement(LiveLinksEditorContent, { profile: initialProfile as never }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Add link" }));
    await user.click(screen.getByRole("button", { name: "Website or link" }));
    await user.type(screen.getByLabelText("Label", { exact: true }), "Unsaved site");
    await user.type(screen.getByLabelText("Web address"), "https://unsaved.example.com");
    await user.click(screen.getByRole("dialog").querySelector('button[type="submit"]')!);

    view.rerender(
      createElement(
        DraftSaveProvider,
        null,
        createElement(DraftStatusProbe),
        createElement(LiveLinksEditorContent, {
          profile: {
            ...initialProfile,
            draftRevision: 11,
            draft: {
              ...initialProfile.draft,
              redirect: { enabled: true, destination: "https://remote.example.com" },
            },
          } as never,
        }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(saveMutation).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: "profile-1", expectedDraftRevision: 7 }),
      ),
    );
  });

  it("advances the draft revision when a remote redirect matches an unsaved edit", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    saveMutation.mockResolvedValue({ updatedAt: 2, draftRevision: 9 });
    const initialProfile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 7,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", ...baseLink }],
        redirect: { enabled: true, destination: "https://a.example.com" },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    const view = render(
      createElement(LiveLinksEditorContent, { profile: initialProfile as never }),
    );

    await user.clear(screen.getByLabelText("HTTPS destination URL"));
    await user.type(screen.getByLabelText("HTTPS destination URL"), "https://b.example.com");

    view.rerender(
      createElement(LiveLinksEditorContent, {
        profile: {
          ...initialProfile,
          draftRevision: 8,
          draft: {
            ...initialProfile.draft,
            redirect: { enabled: true, destination: "https://b.example.com" },
          },
        } as never,
      }),
    );

    await user.clear(screen.getByLabelText("HTTPS destination URL"));
    await user.type(screen.getByLabelText("HTTPS destination URL"), "https://c.example.com");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() =>
      expect(saveMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedDraftRevision: 8,
          redirect: { enabled: true, destination: "https://c.example.com" },
        }),
      ),
    );
  });

  it("keeps invalid enabled link validation when redirect is disabled", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    const profile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 4,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", ...baseLink }],
      },
      createdAt: 1,
      updatedAt: 1,
    };
    render(createElement(LiveLinksEditorContent, { profile: profile as never }));

    await user.clear(screen.getByRole("textbox", { name: "Label for Link" }));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Fix each highlighted link before saving.")).toBeVisible();
    expect(saveMutation).not.toHaveBeenCalled();
  });

  it("surfaces unsafe nonblank disabled links before saving the draft", async () => {
    const user = userEvent.setup();
    saveMutation.mockClear();
    render(
      createElement(LiveLinksEditorContent, {
        profile: {
          _id: "profile-1",
          _creationTime: 1,
          ownerId: "customer-1",
          status: "draft",
          draftRevision: 4,
          draft: {
            name: "Mara Velasquez",
            slug: "mara-velasquez",
            links: [
              {
                id: "disabled",
                label: "Old link",
                destination: "javascript:alert(1)",
                enabled: false,
              },
            ],
          },
          createdAt: 1,
          updatedAt: 1,
        } as never,
      }),
    );

    expect(
      screen.getByText("Link destination must be a valid HTTPS, mailto, or tel address."),
    ).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Label for Old link" }), " updated");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Fix each highlighted link before saving.")).toBeVisible();
    expect(saveMutation).not.toHaveBeenCalled();
  });

  it("shows how to fix empty links when redirect is enabled and publishing is blocked", () => {
    const profile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 4,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [],
        redirect: { enabled: true, destination: "https://redirect.example.com" },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    render(createElement(LiveLinksEditorContent, { profile: profile as never }));

    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(
      screen.getByText("Switch to Tapit profile to fix your links before publishing."),
    ).toBeVisible();
  });

  it("blocks publishing while an enabled link is invalid, even when redirect is enabled", async () => {
    saveMutation.mockClear();
    const profile = {
      _id: "profile-1",
      _creationTime: 1,
      ownerId: "customer-1",
      status: "draft",
      draftRevision: 4,
      draft: {
        name: "Mara Velasquez",
        slug: "mara-velasquez",
        links: [{ id: "site", label: "", destination: "javascript:alert(1)", enabled: true }],
        redirect: { enabled: true, destination: "https://redirect.example.com" },
      },
      createdAt: 1,
      updatedAt: 1,
    };
    render(createElement(LiveLinksEditorContent, { profile: profile as never }));

    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(
      await screen.findByText("Switch to Tapit profile to fix your links before publishing."),
    ).toBeVisible();
    expect(saveMutation).not.toHaveBeenCalled();
  });
});
