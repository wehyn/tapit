import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LinkIcon } from "@/lib/domain";
import { PublicProfile } from "../../src/components/profile/PublicProfile";
import { projectPublicProfile } from "../../src/lib/domain";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";
import { getDemoState, resetDemoState } from "../../src/lib/demo/store";

const profile = createDefaultDemoState().profiles[0];
const projection = profile === undefined ? null : projectPublicProfile(profile);

describe("public profile preview behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoState();
  });

  it("does not record analytics when a preview link is clicked", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");

    render(
      <PublicProfile
        preview
        profile={projection}
        profileId="profile-mara"
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const before = JSON.stringify(getDemoState().analytics);
    fireEvent.click(screen.getByRole("link", { name: "Portfolio" }));
    const contactEmail = screen
      .getByRole("navigation", { name: "Contact actions" })
      .querySelector('a[href="mailto:mara@example.test"]');
    if (contactEmail === null) throw new Error("The contact email action is missing.");
    contactEmail.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(contactEmail);

    expect(JSON.stringify(getDemoState().analytics)).toBe(before);
  });

  it("falls back safely when a malformed persisted icon reaches the preview", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");

    render(
      <PublicProfile
        preview
        profile={{
          ...projection,
          links: [
            {
              id: "malformed",
              label: "Malformed icon",
              destination: "https://example.com",
              enabled: true,
              icon: "constructor" as LinkIcon,
            },
          ],
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Malformed icon" })).toBeVisible();
  });

  it("renders the Warm Studio presentation from the public projection", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: "hello@example.com",
          phone: "+1 555 0100",
          website: "https://example.com",
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "editorial",
            linkTreatment: "outlined",
            contentOrder: "section-first",
            featuredLinkId: "portfolio",
            section: { kind: "about", body: "A short studio introduction." },
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(
      screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="mailto:hello@example.com"]'),
    ).toHaveAttribute("href", "mailto:hello@example.com");
    expect(
      screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="tel:+1 555 0100"]'),
    ).toHaveAttribute("href", "tel:+1 555 0100");
    expect(
      screen
        .getByRole("navigation", { name: "Contact actions" })
        .querySelector('a[href="https://example.com"]'),
    ).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
      "data-featured",
      "true",
    );
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveClass(
      "border-[#a84431]",
      "bg-transparent",
    );
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveClass(
      "border-[#a84431]",
      "bg-transparent",
      "text-[#a84431]",
    );
    const summary = screen.getByText("About").closest("summary");
    if (summary === null) throw new Error("The About disclosure summary is missing.");
    expect(summary).toHaveAttribute("aria-expanded", "false");
    const disclosure = summary.parentElement;
    if (disclosure === null) throw new Error("The About disclosure is missing.");
    (disclosure as HTMLDetailsElement).open = true;
    fireEvent(disclosure, new Event("toggle", { bubbles: true }));
    expect(summary).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps Warm Studio while an About or Services section is still empty", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
            section: { kind: "about", body: "" },
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("main")).toHaveClass("bg-[#fbf6ef]");
    expect(screen.queryByText("About")).not.toBeInTheDocument();
  });

  it("lets the browser select a published image variant by rendered size", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          imageUrl: "https://images.example/large.png",
          imageSrcSet:
            "https://images.example/small.png 192w, https://images.example/large.png 384w",
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const image = screen.getByRole("img", { name: `${projection.name} profile` });
    expect(image).toHaveAttribute(
      "srcset",
      "https://images.example/small.png 192w, https://images.example/large.png 384w",
    );
    expect(image).toHaveAttribute("sizes", "(min-width: 640px) 96px, 80px");
    expect(image).toHaveAttribute("src", "https://images.example/large.png");
  });

  it("keeps public media inside the Warm Studio panel and bounds the hero", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          media: {
            heroHeight: 999,
            autoplay: false,
            background: {
              src: "https://images.example/hero.jpg",
              alt: "A warm studio wall",
              positionX: 25,
              positionY: 75,
            },
            slideshow: [],
          },
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const hero = screen.getByRole("region", { name: "Profile hero" });
    expect(hero).toHaveAttribute("data-hero-height", "520");
    expect(hero).toHaveClass(
      "rounded-none",
      "border-0",
      "shadow-none",
      "sm:rounded-tapit",
      "sm:border",
      "sm:bg-[#fffdf9]",
      "sm:overflow-hidden",
    );
    expect(hero).not.toHaveClass("bg-[#fffdf9]", "overflow-hidden");
    expect(hero).not.toHaveStyle({ backgroundColor: "#fffdf9" });
    expect(hero).toHaveTextContent("A warm studio wall");
    expect(hero).toContainElement(screen.getByRole("heading", { name: projection.name }));
    expect(hero).toContainElement(screen.getByRole("list", { name: "Profile links" }));
    const surface = hero.querySelector("div");
    expect(surface).toHaveStyle({
      backgroundImage: 'url("https://images.example/hero.jpg")',
      backgroundPosition: "25% 75%",
    });
    expect(screen.queryByRole("region", { name: "Profile slideshow" })).not.toBeInTheDocument();
  });

  it("keeps identity, media, and contact content in the approved public order", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          media: {
            heroHeight: 320,
            autoplay: false,
            background: {
              src: "https://images.example/hero.jpg",
              alt: "A warm studio wall",
              positionX: 50,
              positionY: 50,
            },
            slideshow: [{ src: "https://images.example/slide.jpg", alt: "A studio detail" }],
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const identity = screen.getByRole("heading", { name: projection.name });
    const hero = screen.getByRole("region", { name: "Profile hero" });
    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    const contact = screen.getByRole("navigation", { name: "Contact actions" });
    expect(hero).toContainElement(identity);
    expect(hero.compareDocumentPosition(slideshow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(slideshow.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("keeps a Warm Studio slideshow before identity when no background is configured", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          media: {
            heroHeight: 320,
            autoplay: false,
            slideshow: [{ src: "https://images.example/slide.jpg", alt: "A studio detail" }],
          },
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const heading = screen.getByRole("heading", { name: projection.name });
    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    expect(slideshow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole("region", { name: "Profile hero" })).not.toBeInTheDocument();
  });

  it("keeps the integrated identity inside the full surface and honors phone sizing", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        preview
        previewMode="phone"
        profile={{
          ...projection,
          name: "A very long profile name that stays readable",
          bio: "A longer introduction that must remain visible below the image.",
          media: {
            heroHeight: 220,
            autoplay: false,
            background: {
              src: "https://images.example/hero.jpg",
              alt: "A warm studio wall",
              positionX: 50,
              positionY: 50,
            },
            slideshow: [],
          },
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const hero = screen.getByRole("region", { name: "Profile hero" });
    const heading = screen.getByRole("heading", {
      name: "A very long profile name that stays readable",
    });
    expect(hero).toContainElement(heading);
    expect(hero).toHaveAttribute("data-hero-height", "220");
    expect(hero).toHaveClass(
      "rounded-tapit",
      "border",
      "shadow-[0_20px_60px_rgba(21,25,24,0.12)]",
      "bg-[#fffdf9]",
      "overflow-hidden",
    );
    expect(hero).not.toHaveStyle({ backgroundColor: "#fffdf9" });
    expect(heading).toHaveClass("text-3xl");
    expect(heading).not.toHaveClass("sm:text-4xl");
  });

  it("renders projected media for a legacy themed profile", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          theme: "night",
          customization: undefined,
          media: {
            heroHeight: 320,
            autoplay: false,
            background: {
              src: "https://images.example/legacy-hero.jpg",
              alt: "A legacy profile hero",
              positionX: 50,
              positionY: 50,
            },
            slideshow: [{ src: "https://images.example/legacy-slide.jpg", alt: "Legacy slide" }],
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("region", { name: "Profile hero" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Profile slideshow" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveClass("bg-[#17211f]");
  });

  it("keeps legacy media before identity content", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          theme: "night",
          customization: undefined,
          media: {
            heroHeight: 320,
            autoplay: false,
            background: {
              src: "https://images.example/legacy-hero.jpg",
              alt: "A legacy profile hero",
              positionX: 50,
              positionY: 50,
            },
            slideshow: [{ src: "https://images.example/legacy-slide.jpg", alt: "Legacy slide" }],
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    const hero = screen.getByRole("region", { name: "Profile hero" });
    const slideshow = screen.getByRole("region", { name: "Profile slideshow" });
    const heading = screen.getByRole("heading", { name: projection.name });
    expect(hero.compareDocumentPosition(slideshow) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(slideshow.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(heading).not.toHaveClass("text-white");
  });

  it.each([
    ["compact", "jade", "text-2xl", "bg-[#e1f0ea]", "text-[#3e806d]", "bg-[#3e806d]"],
    ["editorial", "ink", "text-4xl", "bg-[#eee8e2]", "text-[#2c2420]", "bg-[#2c2420]"],
    ["comfortable", "coral", "text-3xl", "bg-[#ffede3]", "text-[#a84431]", "bg-[#b24f38]"],
  ] as const)(
    "applies the %s type scale and finite %s accent in preview",
    (typeScale, accent, headingClass, avatarBackground, avatarText, filledBackground) => {
      if (projection === null) throw new Error("The demo profile fixture is missing.");
      render(
        <PublicProfile
          preview
          profile={{
            ...projection,
            imageUrl: undefined,
            customization: {
              preset: "warm-studio",
              accent,
              typeScale,
              linkTreatment: "filled",
              contentOrder: "links-first",
              featuredLinkId: "portfolio",
            },
          }}
          profileUrl="/mara-velasquez"
          trackClicks={false}
          trackView={false}
        />,
      );

      expect(screen.getByRole("heading", { name: "Mara Velasquez" })).toHaveClass(headingClass);
      expect(screen.getByText("M")).toHaveClass(avatarBackground, avatarText);
      expect(screen.getByRole("link", { name: "Portfolio" })).toHaveClass(
        filledBackground,
        "text-white",
      );
    },
  );

  it.each(["disabled", "missing"])("does not render a %s featured link", (variant) => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          links: [
            {
              id: "featured",
              label: "Featured",
              destination: "https://example.com/featured",
              enabled: variant !== "disabled",
            },
          ],
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
            featuredLinkId: variant === "disabled" ? "featured" : "missing",
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.queryByRole("list", { name: "Featured profile link" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Featured" })).not.toHaveAttribute(
      "data-featured",
      "true",
    );
  });

  it("omits an empty contact strip and preserves the legacy theme", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: undefined,
          phone: undefined,
          website: undefined,
          customization: undefined,
          theme: "night",
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );
    expect(screen.queryByRole("navigation", { name: "Contact actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("bg-[#17211f]");
    expect(screen.getByRole("heading", { name: "Mara Velasquez" })).toHaveClass(
      "text-3xl",
      "sm:text-4xl",
    );
  });

  it("does not add the contact strip to a populated legacy profile", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{ ...projection, customization: undefined, theme: "night" }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.queryByRole("navigation", { name: "Contact actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Portfolio" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveClass("bg-[#17211f]");
  });

  it("uses the solid accent treatment for ordinary filled links", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          customization: {
            preset: "warm-studio",
            accent: "coral",
            typeScale: "comfortable",
            linkTreatment: "filled",
            contentOrder: "links-first",
          },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveClass(
      "bg-[#b24f38]",
      "text-white",
    );
  });

  it("treats malformed customization as legacy and does not render its section", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          customization: {
            ...projection.customization,
            preset: "invalid",
            section: { kind: "services", body: "", items: ["not-a-safe-item"] },
          } as never,
          theme: "night",
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );
    expect(screen.queryByRole("navigation", { name: "Contact actions" })).not.toBeInTheDocument();
    expect(screen.queryByText("Services")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("bg-[#17211f]");
  });

  it("exports validated phone contact data while omitting unsafe email and website values", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const blob = vi.spyOn(globalThis, "Blob");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: "javascript:alert(1)",
          website: "javascript:alert(2)",
          phone: "+63 917 555 0184",
          customization: { ...projection.customization! },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Save contact" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    expect(blob).toHaveBeenCalledWith([expect.stringContaining("TEL:+63 917 555 0184")], {
      type: "text/vcard;charset=utf-8",
    });
    expect(String(blob.mock.calls[0]?.[0])).not.toContain("javascript:");
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    click.mockRestore();
    blob.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("does not offer an empty legacy vCard for unsafe contact values", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: "javascript:alert(1)",
          website: "javascript:alert(2)",
          phone: undefined,
          customization: undefined,
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Save contact" })).not.toBeInTheDocument();
  });

  it("offers a vCard for a phone-only customized profile", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: undefined,
          website: undefined,
          phone: "+63 917 555 0184",
          customization: { ...projection.customization! },
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Save contact" })).toBeVisible();
  });

  it("offers a phone-only vCard for a legacy profile", () => {
    if (projection === null) throw new Error("The demo profile fixture is missing.");
    const blob = vi.spyOn(globalThis, "Blob");
    render(
      <PublicProfile
        profile={{
          ...projection,
          email: undefined,
          website: undefined,
          phone: "+63 917 555 0184",
          customization: undefined,
        }}
        profileUrl="/mara-velasquez"
        trackClicks={false}
        trackView={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Save contact" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    expect(blob).toHaveBeenCalledWith([expect.stringContaining("TEL:+63 917 555 0184")], {
      type: "text/vcard;charset=utf-8",
    });
    blob.mockRestore();
  });
});
