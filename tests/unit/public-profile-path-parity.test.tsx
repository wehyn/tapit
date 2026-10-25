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
      const background = screen.getByRole("region", { name: "Profile hero" });
      const slide = screen.getByRole("img", { name: "Published demo slide" });
      const disclosure = screen.getByText("About").closest("summary");
      if (disclosure === null) throw new Error("The published disclosure is missing.");
      const marker = screen.getByRole("main");
      const projection = {
        contact: contact.getAttribute("href"),
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
      background: "Published demo backdrop",
      slide: "Published demo slide",
      disclosure: "false",
    });
    expect(paths[0]?.marker).toContain("bg-tapit-warm-studio-page");
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
        const paperToken =
          theme === "moss" ? "var(--tapit-moss-paper)" : "var(--tapit-night-paper)";
        const inkToken = theme === "moss" ? "var(--tapit-moss-ink)" : "var(--tapit-night-ink)";

        expect(main).toHaveClass("bg-tapit-paper", "text-tapit-ink", "px-0", "py-0");
        expect(main.style.getPropertyValue("--tapit-paper")).toBe(paperToken);
        expect(main.style.getPropertyValue("--tapit-ink")).toBe(inkToken);
        expect(panel).toHaveClass(
          "overflow-hidden",
          "rounded-none",
          "border-0",
          "shadow-none",
          "bg-transparent",
        );
        expect(links).toHaveClass("gap-2");
        expect(links.parentElement?.parentElement?.parentElement).toHaveClass("mt-0", "gap-4");
        expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveClass(
          "rounded-control",
          "bg-tapit-surface",
          "shadow-card",
        );
        expect(screen.getByRole("link", { name: "LinkedIn" })).not.toHaveClass("border");
        expect(screen.getByRole("button", { name: "Save contact" })).toHaveClass(
          "h-11",
          "rounded-control",
          "bg-tapit-accent",
        );
        expect(screen.getByRole("button", { name: "Save contact" })).toBeVisible();
        const contactActions = screen.getByRole("navigation", { name: "Contact actions" });
        expect(contactActions).toBeVisible();
        expect(contactActions.querySelector('a[href="mailto:mara@example.test"]')).not.toBeNull();

        view.unmount();
      }
    },
  );

  it("tracks profile links, but not contact actions, on both paths", () => {
    for (const path of ["direct", "card"] as const) {
      const view = renderPublishedPath(path);
      pathMocks.recordLinkClick.mockClear();

      const booking = screen.getByRole("link", { name: "Book a conversation" });
      const ordinary = screen.getByRole("link", { name: "LinkedIn" });
      const contact = screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="mailto:mara@example.test"]');
      if (contact === null) throw new Error("The published email action is missing.");

      for (const link of [booking, ordinary, contact]) {
        link.addEventListener("click", (event) => event.preventDefault());
      }
      fireEvent.click(booking);
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
