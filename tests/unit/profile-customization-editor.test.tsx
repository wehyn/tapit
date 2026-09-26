import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { ProfileCustomizationEditor } from "../../src/components/forms/ProfileCustomizationEditor";
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  type ProfileCustomization,
} from "../../src/lib/profile-customization";
import type { ProfileMediaPresentation } from "../../src/lib/profile-media";

// Failure modes covered by this isolated component test:
// - the old mixed accordion can reappear instead of the four visual categories;
// - tab relationships, selected state, focus, ordering, or disabled legacy behavior can drift;
// - controls can update the wrong customization field or lose values between category switches;
// - identity colors can share state, mutate nested draft data, or weaken the white exception;
// - media upload handlers and busy/error plumbing can be dropped while re-composing the panel;
// - an optional media handler can silently leave the Media tabpanel blank;
// - a legacy-to-Warm-Studio transition can restore a stale category instead of Overview or break focus;
// - validation errors can lose their exact visible association or become color-only indicators;
// - profile content/publication controls can leak back into this visual-only editor.

const backgroundMedia = {
  heroHeight: 320,
  autoplay: true,
  background: {
    assetId: "background" as Id<"profileMediaAssets">,
    altText: "Backdrop",
    positionX: 50,
    positionY: 50,
  },
  slideshow: [],
} satisfies ProfileMediaPresentation;

function lastChange(onChange: ReturnType<typeof vi.fn>): ProfileCustomization {
  return onChange.mock.lastCall?.[0] as ProfileCustomization;
}

function ControlledEditor({
  initial = DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  media: initialMedia,
  onChange,
}: {
  initial?: ProfileCustomization;
  media?: ProfileMediaPresentation;
  onChange: ReturnType<typeof vi.fn>;
}) {
  const [customization, setCustomization] = useState<ProfileCustomization | undefined>(initial);
  const [media, setMedia] = useState<ProfileMediaPresentation | undefined>(initialMedia);
  return (
    <ProfileCustomizationEditor
      customization={customization}
      media={media}
      onChange={(next) => {
        (onChange as unknown as (value: ProfileCustomization | undefined) => void)(next);
        setCustomization(next);
      }}
      onMediaChange={setMedia}
    />
  );
}

describe("ProfileCustomizationEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the four tabs in order, starts on Overview, and switches panels", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledEditor onChange={onChange} />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.trim())).toEqual([
      "Overview",
      "Identity",
      "Media",
      "Layout",
    ]);
    expect(screen.getByRole("tablist", { name: "Customization categories" })).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    const overviewPanel = screen.getByRole("tabpanel");
    expect(overviewPanel).toHaveAttribute(
      "aria-labelledby",
      screen.getByRole("tab", { name: "Overview" }).id,
    );
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveAttribute("aria-controls");
      expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBeInTheDocument();
    }
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(4);

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    expect(screen.getByRole("tab", { name: "Identity" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      screen.getByRole("tab", { name: "Identity" }).id,
    );
    expect(screen.getByRole("button", { name: "Default name color" })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveFocus();

    await user.click(screen.getByRole("tab", { name: "Layout" }));
    expect(screen.getByRole("radio", { name: "About/Services first" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Default name color" })).not.toBeInTheDocument();
  });

  it("reports the responsive tablist orientation and cleans up its media listener", () => {
    let matches = false;
    const listeners = new Set<EventListener>();
    const mediaQuery = {
      get matches() {
        return matches;
      },
      addEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners.delete(listener);
      }),
    } as unknown as MediaQueryList;
    const matchMedia = vi.fn(() => mediaQuery);
    vi.stubGlobal("matchMedia", matchMedia);

    const { unmount } = render(<ControlledEditor onChange={vi.fn()} />);
    const tablist = screen.getByRole("tablist", { name: "Customization categories" });

    expect(matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
    expect(tablist).toHaveAttribute("aria-orientation", "horizontal");
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    matches = true;
    act(() => {
      listeners.forEach((listener) => listener(new Event("change")));
    });
    expect(tablist).toHaveAttribute("aria-orientation", "vertical");

    matches = false;
    act(() => {
      listeners.forEach((listener) => listener(new Event("change")));
    });
    expect(tablist).toHaveAttribute("aria-orientation", "horizontal");

    const listener = [...listeners][0];
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", listener);
    expect(listeners).toHaveLength(0);
  });

  it.each([
    ["horizontal", false, "ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"],
    ["vertical", true, "ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"],
  ] as const)(
    "moves focus only along the %s tablist axis",
    async (_orientation, matches, blockedForward, blockedBackward, forward, backward) => {
      const user = userEvent.setup();
      const mediaQuery = {
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as MediaQueryList;
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => mediaQuery),
      );
      const { unmount } = render(<ControlledEditor onChange={vi.fn()} />);

      try {
        const overviewTab = screen.getByRole("tab", { name: "Overview" });
        overviewTab.focus();
        await user.keyboard(`{${blockedForward}}`);
        expect(overviewTab).toHaveFocus();
        await user.keyboard(`{${blockedBackward}}`);
        expect(overviewTab).toHaveFocus();

        await user.keyboard(`{${forward}}`);
        const identityTab = screen.getByRole("tab", { name: "Identity" });
        expect(identityTab).toHaveFocus();

        await user.keyboard(`{${backward}}`);
        expect(overviewTab).toHaveFocus();

        await user.keyboard("{End}");
        expect(screen.getByRole("tab", { name: "Layout" })).toHaveFocus();
        await user.keyboard("{Home}");
        expect(overviewTab).toHaveFocus();
      } finally {
        unmount();
      }
    },
  );

  it.each([
    ["ArrowRight", "Identity"],
    ["ArrowLeft", "Layout"],
    ["Home", "Overview"],
    ["End", "Layout"],
  ] as const)("keeps focus on the selected tab after %s", async (key, expectedName) => {
    const user = userEvent.setup();
    render(<ControlledEditor onChange={vi.fn()} />);

    const overviewTab = screen.getByRole("tab", { name: "Overview" });

    overviewTab.focus();
    await user.keyboard(`{${key}}`);
    const expectedTab = screen.getByRole("tab", { name: expectedName });
    expect(expectedTab).toHaveFocus();
    expect(expectedTab).toHaveAttribute("aria-selected", "true");
    expect(expectedTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).not.toHaveFocus();
  });

  it("keeps keyboard navigation on tabs after pointer activation moves focus to the panel", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor onChange={vi.fn()} />);

    const identityTab = screen.getByRole("tab", { name: "Identity" });
    const mediaTab = screen.getByRole("tab", { name: "Media" });

    await user.click(identityTab);
    const identityPanel = screen.getByRole("tabpanel");
    expect(identityPanel).toHaveFocus();
    expect(identityPanel).toHaveClass("focus-visible:ring-2");

    identityTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(mediaTab).toHaveFocus();
    expect(screen.getByRole("tabpanel")).not.toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(identityTab).toHaveFocus();
  });

  it("renders Overview controls and preserves their values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledEditor onChange={onChange} />);

    expect(screen.getByRole("radio", { name: "Warm Studio" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Coral" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Filled" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Jade" }));
    await user.click(screen.getByRole("radio", { name: "Editorial" }));
    await user.click(screen.getByRole("radio", { name: "Outlined" }));
    expect(lastChange(onChange)).toMatchObject({
      accent: "jade",
      typeScale: "editorial",
      linkTreatment: "outlined",
    });

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("radio", { name: "Jade" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Editorial" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Outlined" })).toBeChecked();
  });

  it("keeps name and bio colors independent and clones nested identity data", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items = ["Design systems"];
    const initial: ProfileCustomization = {
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      identityColors: { bio: { kind: "preset", value: "jade" as const } },
      section: { kind: "services" as const, body: "What I offer", items },
    };
    render(<ControlledEditor initial={initial} onChange={onChange} />);

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.click(screen.getByRole("button", { name: "Coral name color" }));

    const next = lastChange(onChange);
    expect(next.identityColors).toEqual({
      name: { kind: "preset", value: "coral" },
      bio: { kind: "preset", value: "jade" },
    });
    expect(next.identityColors).not.toBe(initial.identityColors);
    expect(next.section?.kind).toBe("services");
    if (next.section?.kind === "services") expect(next.section.items).not.toBe(items);
    expect(initial.identityColors).toEqual({ bio: { kind: "preset", value: "jade" } });
    expect(items).toEqual(["Design systems"]);

    await user.click(screen.getByRole("button", { name: "Default name color" }));
    expect(lastChange(onChange).identityColors).toEqual({
      bio: { kind: "preset", value: "jade" },
    });
  });

  it("allows custom white only when a background exists", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { unmount } = render(<ControlledEditor onChange={onChange} />);

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    const nameHex = screen.getByLabelText("Name custom hex color");
    await user.clear(nameHex);
    await user.type(nameHex, "#ffffff");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The profile name custom color does not meet contrast requirements.",
    );
    expect(onChange).not.toHaveBeenCalled();
    unmount();

    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        media={backgroundMedia}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Identity" }));
    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    const backgroundNameHex = screen.getByLabelText("Name custom hex color");
    await user.clear(backgroundNameHex);
    await user.type(backgroundNameHex, "#ffffff");
    expect(lastChange(onChange).identityColors).toEqual({
      name: { kind: "custom", hex: "#ffffff" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders media controls and preserves upload busy plumbing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onMediaChange = vi.fn();
    const onUpload = vi.fn(async () => ({
      assetId: "uploaded" as Id<"profileMediaAssets">,
      altText: "Uploaded background",
    }));
    const { rerender } = render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        media={backgroundMedia}
        mediaBusy
        onChange={onChange}
        onMediaChange={onMediaChange}
        onMediaUpload={onUpload}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Media" }));
    expect(screen.getByRole("button", { name: "Replace background" })).toBeDisabled();
    expect(screen.getByLabelText("Upload slideshow images")).toBeDisabled();

    rerender(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        media={backgroundMedia}
        onChange={onChange}
        onMediaChange={onMediaChange}
        onMediaUpload={onUpload}
      />,
    );
    const file = new File(["image"], "background.webp", { type: "image/webp" });
    await user.upload(screen.getByLabelText("Upload background image"), file);
    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith(file, "background");
      expect(onMediaChange).toHaveBeenCalledWith(
        expect.objectContaining({
          background: expect.objectContaining({
            assetId: "uploaded",
            altText: "Uploaded background",
            positionX: 50,
            positionY: 50,
          }),
        }),
      );
    });
  });

  it("counts mediaError for the Media tab without duplicating its alert", async () => {
    const user = userEvent.setup();
    const mediaError = "Hero height must be between 220 and 520.";
    const onUpload = vi.fn(async () => ({
      assetId: "uploaded" as Id<"profileMediaAssets">,
      altText: "Uploaded background",
    }));
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        errors={[mediaError]}
        media={backgroundMedia}
        mediaError={mediaError}
        onChange={vi.fn()}
        onMediaChange={vi.fn()}
        onMediaUpload={onUpload}
      />,
    );

    expect(screen.getAllByText("Needs attention")).toHaveLength(1);
    const mediaTab = screen.getByRole("tab", { name: "Media" });
    expect(mediaTab).toHaveAttribute("aria-describedby");
    expect(document.getElementById(mediaTab.getAttribute("aria-describedby")!)).toHaveTextContent(
      "Needs attention",
    );

    await user.click(mediaTab);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(mediaError);
  });

  it.each(["both", "change", "upload"] as const)(
    "shows an accessible unavailable state when the %s media handler is missing",
    async (missingHandler) => {
      const user = userEvent.setup();
      const onUpload = vi.fn(async () => ({
        assetId: "uploaded" as Id<"profileMediaAssets">,
        altText: "Uploaded background",
      }));
      const mediaProps =
        missingHandler === "both"
          ? {}
          : missingHandler === "change"
            ? { onMediaUpload: onUpload }
            : { onMediaChange: vi.fn() };

      render(
        <ProfileCustomizationEditor
          customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
          media={backgroundMedia}
          onChange={vi.fn()}
          {...mediaProps}
        />,
      );

      await user.click(screen.getByRole("tab", { name: "Media" }));
      expect(screen.getByRole("status")).toHaveTextContent(
        "Media controls are unavailable because both media change and upload handlers are required.",
      );
      expect(screen.queryByLabelText("Upload background image")).not.toBeInTheDocument();
    },
  );

  it("renders mediaError once in the accessible unavailable state", async () => {
    const user = userEvent.setup();
    const mediaError = "Hero height must be between 220 and 520.";
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        errors={[mediaError]}
        media={backgroundMedia}
        mediaError={mediaError}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Media" }));
    expect(screen.getAllByText(mediaError, { exact: true })).toHaveLength(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(mediaError);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Media controls are unavailable because both media change and upload handlers are required.",
    );
  });

  it("renders only content order in Layout and updates it without losing identity values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ControlledEditor
        initial={{
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          identityColors: { name: { kind: "preset", value: "ink" } },
        }}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Layout" }));
    await user.click(screen.getByRole("radio", { name: "About/Services first" }));
    expect(lastChange(onChange)).toMatchObject({
      contentOrder: "section-first",
      identityColors: { name: { kind: "preset", value: "ink" } },
    });
    expect(screen.queryByRole("radio", { name: "About" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Links first" })).toBeInTheDocument();
  });

  it("shows category-level status and exact visible error associations", async () => {
    const user = userEvent.setup();
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        errors={[
          "The profile customization accent is invalid.",
          "The profile name custom color does not meet contrast requirements.",
          "The profile bio custom color does not meet contrast requirements.",
          "Hero height must be between 220 and 520.",
          "The profile customization content order is invalid.",
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Needs attention")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Coral" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("error"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The profile customization accent is invalid.",
    );

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining([
        "The profile name custom color does not meet contrast requirements.",
        "The profile bio custom color does not meet contrast requirements.",
      ]),
    );

    await user.click(screen.getByRole("tab", { name: "Media" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Hero height must be between 220 and 520.");

    await user.click(screen.getByRole("tab", { name: "Layout" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The profile customization content order is invalid.",
    );
  });

  it("keeps legacy theme cards on Overview and disables other categories until opt-in", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onThemeChange = vi.fn();
    render(
      <ProfileCustomizationEditor
        onChange={onChange}
        onThemeChange={onThemeChange}
        theme="paper"
      />,
    );

    expect(screen.getByRole("button", { name: /Paper/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Moss/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Night/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Identity" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Media" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Layout" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Moss/i }));
    expect(onThemeChange).toHaveBeenCalledWith("moss");
    await user.click(screen.getByRole("button", { name: "Use Warm Studio" }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_WARM_STUDIO_CUSTOMIZATION);
  });

  it("resets a stale legacy category to Overview after Warm Studio is applied", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Identity" }));
    expect(screen.getByRole("tab", { name: "Identity" })).toHaveAttribute("aria-selected", "true");

    rerender(<ProfileCustomizationEditor onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Use Warm Studio" }));
    rerender(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveFocus();
    await user.click(screen.getByRole("tab", { name: "Identity" }));
    expect(screen.getByRole("tabpanel")).toHaveFocus();
  });

  it("does not render profile content, featured-link, or publication controls", () => {
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Featured link")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact and links")).not.toBeInTheDocument();
    expect(screen.queryByText("About or Services")).not.toBeInTheDocument();
    expect(screen.queryByText("Review and publish")).not.toBeInTheDocument();
  });
});
