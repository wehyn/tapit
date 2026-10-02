import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { DemoProfile, DemoState } from "../../src/lib/demo/fixtures";

const pathMocks = vi.hoisted(() => ({
  state: undefined as DemoState | undefined,
  recordLinkClick: vi.fn(),
  recordProfileView: vi.fn(),
}));

vi.mock("../../src/lib/demo/mode", () => ({
  isLocalDemoMode: () => true,
}));
vi.mock("../../src/lib/demo/store", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/demo/store")>(
    "../../src/lib/demo/store",
  );
  return {
    ...actual,
    getDemoProfileById: (state: DemoState, id: string) =>
      state.profiles.find((profile: DemoProfile) => profile.id === id),
    getDemoProfiles: (state: DemoState) => state.profiles,
    recordLinkClick: pathMocks.recordLinkClick,
    recordProfileView: pathMocks.recordProfileView,
    useHydratedDemoState: () => ({ hydrated: true, state: pathMocks.state }),
  };
});

import { CardResolverClient } from "../../src/components/profile/CardResolverClient";
import { PublicProfileScreen } from "../../src/components/profile/PublicProfileScreen";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";

function renderPublishedPath(path: "direct" | "card") {
  return path === "direct"
    ? render(<PublicProfileScreen slug="mara-velasquez" />)
    : render(<CardResolverClient cardToken="mara-card-7f2q" source="qr" />);
}

function configureLegacyProfile(theme: "moss" | "night") {
  const state = pathMocks.state;
  if (state === undefined) throw new Error("The demo state is missing.");
  const profile = state.profiles[0];
  if (profile === undefined || profile.published === null) {
    throw new Error("The published demo profile fixture is missing.");
  }
  profile.theme = theme;
  state.themes[profile.id] = theme;
  profile.published.customization = undefined;
}

describe("published demo profile paths", () => {
  beforeEach(() => {
    pathMocks.state = createDefaultDemoState();
    const published = pathMocks.state.profiles[0]?.published;
    if (published !== null && published !== undefined) {
      published.customization = {
        preset: "warm-studio",
        accent: "coral",
        typeScale: "comfortable",
        linkTreatment: "filled",
        contentOrder: "links-first",
        identityColors: {
          name: { kind: "preset", value: "jade" },
          bio: { kind: "preset", value: "coral" },
        },
        featuredLinkId: "booking",
        section: { kind: "about", body: "A published studio introduction." },
      };
      published.media = {
        heroHeight: 360,
        autoplay: false,
        background: {
          assetId: "demo-background" as Id<"profileMediaAssets">,
          altText: "Published demo backdrop",
          positionX: 40,
          positionY: 60,
          url: "data:image/png;base64,background",
        },
        slideshow: [
          {
            assetId: "demo-slide" as Id<"profileMediaAssets">,
            altText: "Published demo slide",
            url: "data:image/png;base64,slide",
          },
        ],
      };
    }
    pathMocks.recordLinkClick.mockReset();
    pathMocks.recordProfileView.mockReset();
  });

  it("renders the same complete published projection through direct and card resolvers", () => {
    const paths = (["direct", "card"] as const).map((path) => {
      const view = renderPublishedPath(path);
      const contact = screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="mailto:mara@example.test"]') as HTMLAnchorElement | null;
      if (contact === null) throw new Error("The published email action is missing.");
      const featured = screen.getByRole("link", { name: "Book a conversation" });
      const background = screen.getByRole("region", { name: "Profile hero" });
      const slide = screen.getByRole("img", { name: "Published demo slide" });
      const disclosure = screen.getByText("About").closest("summary");
      if (disclosure === null) throw new Error("The published disclosure is missing.");
      const marker = screen.getByRole("main");
      const projection = {
        contact: contact.getAttribute("href"),
        featured: featured.getAttribute("data-featured"),
        background: background.querySelector("p.sr-only")?.textContent,
        slide: slide.getAttribute("alt") ?? slide.getAttribute("aria-label"),
        marker: marker.className,
        disclosure: disclosure.getAttribute("aria-expanded"),
      };
      view.unmount();
      return projection;
    });

    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0]).toMatchObject({
      contact: "mailto:mara@example.test",
      featured: "true",
      background: "Published demo backdrop",
      slide: "Published demo slide",
      disclosure: "false",
    });
    expect(paths[0]?.marker).toContain("bg-[#fbf6ef]");
  });

  it("does not record profile-link analytics for contact actions on either path", () => {
    for (const path of ["direct", "card"] as const) {
      const view = renderPublishedPath(path);
      pathMocks.recordLinkClick.mockClear();
      const contact = screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="mailto:mara@example.test"]') as HTMLAnchorElement | null;
      if (contact === null) throw new Error("The published email action is missing.");
      contact.addEventListener("click", (event) => event.preventDefault());
      contact.click();
      expect(pathMocks.recordLinkClick).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("renders published identity colors identically through direct and active-card paths", () => {
    const state = pathMocks.state;
    if (state === undefined) throw new Error("The demo state is missing.");
    const profile = state.profiles[0];
    if (profile === undefined || profile.published === null) {
      throw new Error("The published demo profile fixture is missing.");
    }
    profile.published.media = undefined;

    const paths = (["direct", "card"] as const).map((path) => {
      const view = renderPublishedPath(path);
      const heading = screen.getByRole("heading", { name: "Mara Velasquez" });
      const bio = screen.getByText("Brand systems for independent teams.");
      const result = { heading: heading.getAttribute("style"), bio: bio.getAttribute("style") };
      view.unmount();
      return result;
    });

    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0]).toEqual({
      heading: "color: rgb(62, 128, 109);",
      bio: "color: rgb(168, 68, 49);",
    });
  });

  it.each(["moss", "night"] as const)(
    "preserves the populated legacy %s profile through direct and card paths",
    (theme) => {
      for (const path of ["direct", "card"] as const) {
        configureLegacyProfile(theme);
        const view = renderPublishedPath(path);
        const main = screen.getByRole("main");
        const panel = main.querySelector("section");
        const links = screen.getByRole("list", { name: "Profile links" });

        expect(main).toHaveClass(
          theme === "moss" ? "bg-[#e8f1eb]" : "bg-[#17211f]",
          "px-5",
          "py-8",
          "sm:py-12",
        );
        expect(panel).toHaveClass(
          theme === "moss" ? "border-[#b9d1c0]" : "border-[#40534d]",
          theme === "moss" ? "bg-[#f7fbf8]" : "bg-[#22302b]",
        );
        expect(links).toHaveClass("mt-9", "gap-3");
        expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveClass(
          theme === "moss" ? "border-[#b9d1c0]" : "border-[#40534d]",
          theme === "moss" ? "bg-[#f7fbf8]" : "bg-[#22302b]",
        );
        expect(screen.getByRole("button", { name: "Save contact" })).toHaveClass("mt-5");
        expect(screen.getByRole("button", { name: "Save contact" })).toBeVisible();
        expect(
          screen.queryByRole("navigation", { name: "Contact actions" }),
        ).not.toBeInTheDocument();

        view.unmount();
      }
    },
  );

  it("tracks ordinary and featured profile links, but not contact actions, on both paths", () => {
    for (const path of ["direct", "card"] as const) {
      const view = renderPublishedPath(path);
      pathMocks.recordLinkClick.mockClear();

      const featured = screen.getByRole("link", { name: "Book a conversation" });
      const ordinary = screen.getByRole("link", { name: "LinkedIn" });
      const contact = screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="mailto:mara@example.test"]');
      if (contact === null) throw new Error("The published email action is missing.");

      for (const link of [featured, ordinary, contact]) {
        link.addEventListener("click", (event) => event.preventDefault());
      }
      fireEvent.click(featured);
      fireEvent.click(ordinary);
      fireEvent.click(contact);

      const source = path === "direct" ? "direct" : "qr";
      expect(pathMocks.recordLinkClick).toHaveBeenCalledTimes(2);
      expect(pathMocks.recordLinkClick).toHaveBeenNthCalledWith(
        1,
        "booking",
        "profile-mara",
        source,
      );
      expect(pathMocks.recordLinkClick).toHaveBeenNthCalledWith(
        2,
        "linkedin",
        "profile-mara",
        source,
      );

      view.unmount();
    }
  });
});
