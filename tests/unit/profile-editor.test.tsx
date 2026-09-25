import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localMode: true,
  liveProfile: null as Record<string, unknown> | null,
  saveDraft: vi.fn(async () => undefined),
  updateDemoState: vi.fn(),
}));

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
  useDraftSaveLink: () => (event: Event) => event.preventDefault(),
}));

vi.mock("@/lib/demo/store", () => ({
  getDemoProfileForSession: (state: { profile: unknown }) => state.profile,
  getDemoProfiles: (state: { profiles: unknown[] }) => state.profiles,
  getDemoTheme: () => "paper",
  updateDemoProfile: (state: unknown) => state,
  updateDemoTheme: (state: unknown) => state,
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
    links: draft.links.filter((link: { enabled: boolean }) => link.enabled),
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

describe("ProfileEditor customization seam", () => {
  beforeEach(() => {
    mocks.localMode = true;
    mocks.liveProfile = { ...demoProfile, _id: "live-profile" };
    mocks.saveDraft.mockClear();
    mocks.updateDemoState.mockClear();
  });

  it.each(["demo", "live"])(
    "renders the real guided identity, preview, and save wiring in the %s branch",
    async (branch) => {
      const user = userEvent.setup();
      mocks.localMode = branch === "demo";
      render(<ProfileEditor />);

      expect(screen.getByRole("heading", { name: "Profile identity" })).toBeVisible();
      expect(screen.getByRole("heading", { name: "Preview" })).toBeVisible();
      const identity = screen.getByRole("heading", { name: "Profile identity" }).closest("section");
      expect(identity).not.toBeNull();
      expect(identity).toHaveTextContent("Public URL");
      expect(identity).toHaveTextContent("/mara-velasquez");
      await user.click(screen.getByRole("button", { name: "Copy" }));
      expect(screen.getByRole("button", { name: "Copied" })).toBeVisible();

      await user.click(screen.getByRole("radio", { name: "Jade" }));
      expect(screen.getByRole("radio", { name: "Jade" })).toBeChecked();
      const save = screen.getByRole("button", { name: "Save draft" });
      expect(save).toBeEnabled();
      await user.click(save);
      if (branch === "demo") expect(mocks.updateDemoState).toHaveBeenCalled();
      else expect(mocks.saveDraft).toHaveBeenCalled();
    },
  );

  it("saves the live customization choices as part of the edited draft", async () => {
    const user = userEvent.setup();
    mocks.localMode = false;
    render(<ProfileEditor />);

    await user.click(screen.getByRole("radio", { name: "Jade" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Featured link" }), "site");
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(mocks.saveDraft).toHaveBeenCalledWith({
      expectedImageRevision: 0,
      expectedMediaRevision: 0,
      profileId: "live-profile",
      draft: expect.objectContaining({
        customization: expect.objectContaining({
          accent: "jade",
          featuredLinkId: "site",
          preset: "warm-studio",
        }),
      }),
    });
  });

  it("persists a cleared live bio as undefined", async () => {
    const user = userEvent.setup();
    mocks.localMode = false;
    render(<ProfileEditor />);

    await user.clear(screen.getByLabelText("Bio or role"));
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    expect(mocks.saveDraft).toHaveBeenCalledWith({
      expectedImageRevision: 0,
      expectedMediaRevision: 0,
      profileId: "live-profile",
      draft: expect.objectContaining({ bio: undefined }),
    });
  });

  it("renders the complete draft preview while omitting disabled links", () => {
    mocks.liveProfile = {
      ...demoProfile,
      draft: {
        ...draft,
        customization: {
          ...customization,
          section: { kind: "about", body: "Draft-only introduction" },
        },
        links: [
          ...draft.links,
          {
            id: "hidden",
            label: "Disabled draft link",
            destination: "https://hidden.test",
            enabled: false,
          },
        ],
      },
    };
    render(<ProfileEditor />);

    expect(screen.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    expect(screen.getAllByText("Draft-only introduction").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("link", { name: /Site/ })).toBeVisible();
    expect(screen.queryByText("Disabled draft link")).not.toBeInTheDocument();
  });

  it("projects unsaved identity colors into the draft preview", async () => {
    const user = userEvent.setup();
    render(<ProfileEditor />);

    await user.click(screen.getByRole("button", { name: "Jade name color" }));
    await user.click(screen.getByRole("button", { name: "Coral bio / role color" }));

    expect(screen.getByRole("heading", { name: "Mara Velasquez" })).toHaveStyle({
      color: "#3e806d",
    });
    expect(screen.getAllByText("Designer").find((element) => element.tagName === "P")).toHaveStyle({
      color: "#a84431",
    });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("keeps legacy profiles on the legacy appearance branch", () => {
    mocks.liveProfile = {
      ...demoProfile,
      draft: { ...draft, customization: undefined },
    };
    render(<ProfileEditor />);

    expect(screen.getByRole("heading", { name: "Legacy appearance" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Use Warm Studio" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Jade" })).not.toBeInTheDocument();
  });

  it("uploads demo media as a data URL, updates the preview, and saves the draft", async () => {
    const user = userEvent.setup();
    mocks.localMode = true;
    render(<ProfileEditor />);

    await user.click(screen.getByRole("button", { name: "Media" }));
    fireEvent.change(screen.getByLabelText("Upload background image"), {
      target: { files: [new File(["demo-image"], "background.png", { type: "image/png" })] },
    });

    const altField = await screen.findByLabelText("Background image description");
    fireEvent.change(altField, { target: { value: "Demo backdrop" } });
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("img", { name: "Demo backdrop" })
          .some((image) => image.getAttribute("style")?.includes("data:image/png")),
      ).toBe(true);
    });

    const save = screen.getByRole("button", { name: "Save draft" });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(mocks.updateDemoState).toHaveBeenCalledOnce();
  });
});
