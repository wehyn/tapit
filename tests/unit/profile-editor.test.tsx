import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localMode: true,
  liveProfile: null as Record<string, unknown> | null,
  saveDraft: vi.fn(async () => ({ imageRevision: 0, mediaRevision: 0 })),
  guardedNavigation: vi.fn(),
  updateDemoState: vi.fn(),
}));

// Failure modes covered by this controller test:
// - the default Profile view can regress to the old mixed single-view editor;
// - demo and live branches can drift in their view boundaries, preview, save, or publish wiring;
// - Profile can lose identity, Public URL/copy, content, or publication controls;
// - Customize can leak Profile controls or omit a visual category and its draft updates;
// - details changes can overwrite unrelated customization values when the complete draft saves;
// - legacy theme callbacks can bypass the controller or leave duplicate cards on Profile;
// - validation guidance can point to the wrong workspace or bypass guarded draft-save links;
// - media upload/crop busy state, identity-color background behavior, and publish lifecycle actions
//   can be dropped while composing the route-specific workspaces.

vi.mock("@/lib/demo/mode", () => ({
  isLocalDemoMode: () => mocks.localMode,
}));

vi.mock("convex/react", () => ({
  useQuery: () => mocks.liveProfile,
  useMutation: () => mocks.saveDraft,
  useAction: () => mocks.saveDraft,
}));

vi.mock("@/components/layout/DraftSaveContext", () => ({
  useDraftSaveRegistration: () => undefined,
  useDraftSaveLink: (href: string) => {
    mocks.guardedNavigation(href);
    return (event: Event) => event.preventDefault();
  },
}));

vi.mock("@/lib/demo/store", () => ({
  getDemoProfileForSession: (state: { profile: unknown }) => state.profile,
  getDemoProfiles: (state: { profiles: unknown[] }) => state.profiles,
  getDemoTheme: () => "paper",
  updateDemoProfile: (
    state: {
      profile: Record<string, unknown>;
      profiles: Record<string, unknown>[];
    },
    profileId: string,
    update: (profile: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    const updateProfile = (profile: Record<string, unknown>) =>
      profile.id === profileId ? update(profile) : profile;
    return {
      ...state,
      profile: updateProfile(state.profile),
      profiles: state.profiles.map(updateProfile),
    };
  },
  updateDemoTheme: (
    state: {
      profile: Record<string, unknown>;
      profiles: Record<string, unknown>[];
    },
    profileId: string,
    theme: string,
  ) => {
    const updateTheme = (profile: Record<string, unknown>) =>
      profile.id === profileId ? { ...profile, theme } : profile;
    return {
      ...state,
      profile: updateTheme(state.profile),
      profiles: state.profiles.map(updateTheme),
    };
  },
  useDemoSession: () => null,
  useDemoState: () => ({
    profile: mocks.liveProfile,
    profiles: [mocks.liveProfile],
    customers: [],
    cards: [],
    audits: [],
  }),
  updateDemoState: mocks.updateDemoState,
}));

vi.mock("@/lib/demo/projection", () => ({
  projectDemoPublicProfile: (
    profile: { theme: string },
    draft: Record<string, unknown> & { links: { enabled: boolean }[] },
  ) => ({
    ...draft,
    theme: profile.theme,
    links: draft.links.filter((link) => link.enabled),
  }),
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span role="img" aria-label={alt ?? ""} />,
}));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}));

const customization = {
  preset: "warm-studio" as const,
  accent: "coral" as const,
  typeScale: "comfortable" as const,
  linkTreatment: "filled" as const,
  contentOrder: "links-first" as const,
};

const draft = {
  name: "Mara Velasquez",
  slug: "mara-velasquez",
  bio: "Designer",
  email: "mara@example.com",
  phone: "+63 917 555 0184",
  website: "https://mara.example.com",
  links: [{ id: "site", label: "Site", destination: "https://example.com", enabled: true }],
  customization,
};

const demoProfile = {
  id: "demo-profile",
  ownerId: "demo-owner",
  status: "unpublished",
  theme: "paper",
  draft,
  published: null,
};

import { ProfileEditor } from "@/components/forms/ProfileEditor";

function renderBranch(branch: "demo" | "live", view: "profile" | "customize" = "profile") {
  mocks.localMode = branch === "demo";
  render(<ProfileEditor view={view} />);
}

function applyLastDemoUpdate() {
  const update = mocks.updateDemoState.mock.lastCall?.[0];
  if (typeof update !== "function") return undefined;
  return update({
    profile: { ...demoProfile },
    profiles: [{ ...demoProfile }],
  });
}

describe("ProfileEditor workspace boundaries", () => {
  beforeEach(() => {
    mocks.localMode = true;
    mocks.liveProfile = { ...demoProfile, _id: "live-profile" };
    mocks.saveDraft.mockClear();
    mocks.guardedNavigation.mockClear();
    mocks.updateDemoState.mockClear();
  });

  it.each(["demo", "live"] as const)(
    "defaults to the details and publication Profile view in the %s branch",
    async (branch) => {
      const user = userEvent.setup();
      renderBranch(branch);

      expect(screen.getByRole("heading", { name: "Your profile" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Profile identity" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Publication" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Preview" })).toBeVisible();
      expect(screen.getByText("Public URL")).toBeVisible();
      expect(screen.getByRole("button", { name: "Copy" })).toBeVisible();
      expect(screen.getByLabelText("Name")).toHaveValue("Mara Velasquez");
      expect(screen.getByLabelText("Email")).toHaveValue("mara@example.com");
      expect(screen.getByRole("combobox", { name: "Featured link" })).toBeVisible();
      expect(screen.getByRole("radio", { name: "About" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Copy" }));
      expect(screen.queryByRole("tab", { name: "Overview" })).not.toBeInTheDocument();
      expect(screen.queryByText("Accent", { selector: "legend" })).not.toBeInTheDocument();
      expect(screen.queryByText("Identity colors", { selector: "legend" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Upload background image")).not.toBeInTheDocument();
      expect(screen.queryByText("Content order", { selector: "legend" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Moss" })).not.toBeInTheDocument();
    },
  );

  it.each(["demo", "live"] as const)(
    "keeps visual controls on Customize in the %s branch",
    (branch) => {
      renderBranch(branch, "customize");

      expect(screen.getByRole("heading", { name: "Customize your profile" })).toBeVisible();
      expect(screen.getByText("Tune the look and feel of your public profile.")).toBeVisible();
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual([
        "Overview",
        "Identity",
        "Media",
        "Layout",
      ]);
      expect(screen.getByRole("tab", { name: "Overview" })).toBeVisible();
      expect(screen.getByRole("radio", { name: "Jade" })).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Profile identity" })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Publication" })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: "Featured link" })).not.toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: "About" })).not.toBeInTheDocument();
    },
  );

  it.each(["demo", "live"] as const)(
    "updates the preview and saves the complete customization draft from Customize in %s",
    async (branch) => {
      const user = userEvent.setup();
      renderBranch(branch, "customize");

      await user.click(screen.getByRole("radio", { name: "Jade" }));

      expect(screen.getByRole("link", { name: "Site" })).toHaveClass("bg-[#3e806d]");
      const save = screen.getByRole("button", { name: "Save draft" });
      expect(save).toBeEnabled();
      await user.click(save);

      if (branch === "demo") {
        expect(mocks.updateDemoState).toHaveBeenCalled();
        expect(applyLastDemoUpdate()).toMatchObject({
          profile: {
            draft: expect.objectContaining({
              name: "Mara Velasquez",
              slug: "mara-velasquez",
              email: "mara@example.com",
              customization: expect.objectContaining({ accent: "jade" }),
            }),
          },
        });
      } else {
        expect(mocks.saveDraft).toHaveBeenCalledWith({
          expectedImageRevision: 0,
          expectedMediaRevision: 0,
          profileId: "live-profile",
          draft: expect.objectContaining({
            name: "Mara Velasquez",
            slug: "mara-velasquez",
            bio: "Designer",
            email: "mara@example.com",
            phone: "+63 917 555 0184",
            website: "https://mara.example.com",
            links: [expect.objectContaining({ id: "site", enabled: true })],
            customization: expect.objectContaining({ accent: "jade" }),
          }),
        });
      }
    },
  );

  it.each(["demo", "live"] as const)(
    "shows save feedback in the Customize workspace in %s",
    async (branch) => {
      const user = userEvent.setup();
      renderBranch(branch, "customize");

      await user.click(screen.getByRole("radio", { name: "Jade" }));
      await user.click(screen.getByRole("button", { name: "Save draft" }));

      expect(
        await screen.findByText("Draft saved. Visitors still see the last published version."),
      ).toBeVisible();
    },
  );

  it.each(["demo", "live"] as const)(
    "keeps the default identity colors aligned with the public profile in %s",
    (branch) => {
      renderBranch(branch, "customize");

      expect(screen.getByRole("heading", { name: "Mara Velasquez" })).toHaveStyle({
        color: "#2c2420",
      });
    },
  );

  it.each(["demo", "live"] as const)(
    "keeps Featured link, About/Services, name, bio, and customization values together in %s",
    async (branch) => {
      const user = userEvent.setup();
      renderBranch(branch, "profile");

      await user.type(screen.getByLabelText("Name"), " Studio");
      await user.clear(screen.getByLabelText("Bio or role"));
      await user.type(screen.getByLabelText("Bio or role"), "Designer and maker");
      await user.selectOptions(screen.getByRole("combobox", { name: "Featured link" }), "site");
      await user.click(screen.getByRole("radio", { name: "Services" }));
      await user.click(screen.getByRole("button", { name: "Add service" }));

      await user.click(screen.getByRole("button", { name: "Save draft" }));

      const expectedDraft = expect.objectContaining({
        name: "Mara Velasquez Studio",
        bio: "Designer and maker",
        customization: expect.objectContaining({
          accent: "coral",
          featuredLinkId: "site",
          section: { kind: "services", body: "", items: [""] },
        }),
      });
      if (branch === "demo") {
        expect(applyLastDemoUpdate()).toMatchObject({
          profile: { draft: expectedDraft },
        });
      } else {
        expect(mocks.saveDraft).toHaveBeenCalledWith({
          expectedImageRevision: 0,
          expectedMediaRevision: 0,
          profileId: "live-profile",
          draft: expectedDraft,
        });
      }
    },
  );

  it.each(["demo", "live"] as const)(
    "keeps legacy themes functional only in Customize for %s",
    async (branch) => {
      const user = userEvent.setup();
      mocks.liveProfile = {
        ...demoProfile,
        _id: "live-profile",
        draft: { ...draft, customization: undefined },
      };
      renderBranch(branch, "customize");

      expect(screen.getByRole("heading", { name: "Legacy appearance" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Use Warm Studio" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Paper" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Moss" })).toBeVisible();
      expect(screen.getByRole("button", { name: "Night" })).toBeVisible();
      expect(screen.getByRole("tab", { name: "Overview" })).toBeEnabled();
      expect(screen.getByRole("tab", { name: "Identity" })).toBeDisabled();
      expect(screen.getByRole("tab", { name: "Media" })).toBeDisabled();
      expect(screen.getByRole("tab", { name: "Layout" })).toBeDisabled();
      expect(screen.queryByRole("heading", { name: "Profile identity" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Moss" }));
      if (branch === "demo") {
        expect(mocks.updateDemoState).toHaveBeenCalled();
        expect(applyLastDemoUpdate()).toMatchObject({
          profile: { theme: "moss" },
        });
      } else {
        expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
        await user.click(screen.getByRole("button", { name: "Save draft" }));
        expect(mocks.saveDraft).toHaveBeenCalledWith(
          expect.objectContaining({ draft: expect.objectContaining({ theme: "moss" }) }),
        );
      }
    },
  );

  it("does not duplicate legacy theme controls on Profile", () => {
    mocks.liveProfile = {
      ...demoProfile,
      draft: { ...draft, customization: undefined },
    };
    render(<ProfileEditor view="profile" />);

    expect(screen.getByRole("heading", { name: "Profile identity" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Legacy appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use Warm Studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Paper" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Moss" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Night" })).not.toBeInTheDocument();
  });

  it("offers guarded Customize navigation for customization errors", () => {
    mocks.liveProfile = {
      ...demoProfile,
      draft: {
        ...draft,
        customization: {
          ...customization,
          identityColors: { name: { kind: "custom", hex: "#ffffff" } },
        },
      },
    };
    render(<ProfileEditor view="profile" />);

    expect(
      screen.getByText("Some customization settings need attention before you can publish."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Customize" })).toHaveAttribute(
      "href",
      "/app/customize",
    );
    expect(mocks.guardedNavigation).toHaveBeenCalledWith("/app/customize");
  });

  it("offers guarded Profile navigation for profile errors", () => {
    mocks.liveProfile = {
      ...demoProfile,
      draft: { ...draft, name: "" },
    };
    render(<ProfileEditor view="customize" />);

    expect(screen.getByText("A nonblank profile name is required.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Profile" })).toHaveAttribute(
      "href",
      "/app/profile",
    );
    expect(mocks.guardedNavigation).toHaveBeenCalledWith("/app/profile");
  });

  it("projects identity colors and permits white text when Customize has a background", async () => {
    const user = userEvent.setup();
    mocks.liveProfile = {
      ...demoProfile,
      draft: {
        ...draft,
        media: {
          heroHeight: 320,
          autoplay: true,
          background: {
            assetId: "background",
            altText: "Backdrop",
            positionX: 50,
            positionY: 50,
          },
          slideshow: [],
        },
      },
    };
    render(<ProfileEditor view="customize" />);

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    const nameHex = screen.getByLabelText("Name custom hex color");
    await user.clear(nameHex);
    await user.type(nameHex, "#ffffff");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it.each(["demo", "live"] as const)(
    "publishes the complete draft from Profile in the %s branch",
    async (branch) => {
      const user = userEvent.setup();
      renderBranch(branch, "profile");

      await user.click(screen.getByRole("button", { name: "Publish" }));

      if (branch === "demo") {
        expect(mocks.updateDemoState).toHaveBeenCalled();
      } else {
        await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
        expect(mocks.saveDraft).toHaveBeenCalledWith(
          expect.objectContaining({ profileId: "live-profile" }),
        );
      }
    },
  );

  it.each(["demo", "live"] as const)(
    "keeps Unpublish available for published profiles in the %s branch",
    async (branch) => {
      const user = userEvent.setup();
      mocks.liveProfile = {
        ...demoProfile,
        _id: "live-profile",
        status: "published",
        published: { ...draft, publishedAt: Date.now() },
      };
      renderBranch(branch, "profile");

      await user.click(screen.getByRole("button", { name: "Unpublish" }));

      if (branch === "demo") {
        expect(mocks.updateDemoState).toHaveBeenCalled();
      } else {
        await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
        expect(mocks.saveDraft).toHaveBeenCalledWith(
          expect.objectContaining({ profileId: "live-profile" }),
        );
      }
    },
  );

  it("keeps profile-photo crop available on Profile while visual media stays on Customize", async () => {
    const user = userEvent.setup();
    render(<ProfileEditor />);

    fireEvent.change(screen.getByLabelText("Profile photo or logo"), {
      target: { files: [new File(["photo"], "profile.png", { type: "image/png" })] },
    });

    expect(await screen.findByRole("dialog", { name: "Adjust profile photo" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Adjust profile photo" })).not.toBeInTheDocument();
  });

  it("keeps media upload on Customize and disables save while busy", async () => {
    const user = userEvent.setup();
    mocks.localMode = true;
    render(<ProfileEditor view="customize" />);

    await user.click(screen.getByRole("tab", { name: "Media" }));
    fireEvent.change(screen.getByLabelText("Upload background image"), {
      target: { files: [new File(["demo-image"], "background.png", { type: "image/png" })] },
    });

    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    const altField = await screen.findByLabelText("Background image description");
    fireEvent.change(altField, { target: { value: "Demo backdrop" } });
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("img", { name: "Demo backdrop" })
          .some((image) => image.getAttribute("style")?.includes("data:image/png")),
      ).toBe(true);
    });

    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});
