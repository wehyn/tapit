import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import { ProfileCustomizationEditor } from "../../src/components/forms/ProfileCustomizationEditor";
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  type ProfileCustomization,
} from "../../src/lib/profile-customization";
import type { ProfileMediaPresentation } from "../../src/lib/profile-media";

const links = [
  { id: "booking", label: "Book a call", destination: "https://example.com/book", enabled: true },
  { id: "old", label: "Old link", destination: "https://example.com/old", enabled: false },
] as const;

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
  identityContent,
  links: editorLinks = links,
  onChange,
}: {
  initial?: ProfileCustomization;
  identityContent?: React.ReactNode;
  links?: readonly (typeof links)[number][];
  onChange: ReturnType<typeof vi.fn>;
}) {
  const [customization, setCustomization] = useState(initial);
  return (
    <ProfileCustomizationEditor
      customization={customization}
      identityContent={identityContent}
      links={editorLinks}
      onChange={(next) => {
        (onChange as unknown as (value: ProfileCustomization | undefined) => void)(next);
        if (next) setCustomization(next);
      }}
    />
  );
}

describe("ProfileCustomizationEditor", () => {
  it("updates complete controlled values for style and featured link choices", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        links={links}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Editorial" }));
    expect(lastChange(onChange)).toEqual({
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      typeScale: "editorial",
    });
    await user.selectOptions(screen.getByRole("combobox", { name: "Featured link" }), "booking");
    expect(lastChange(onChange)).toEqual({
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      featuredLinkId: "booking",
    });
  });

  it("updates every supported style control without changing unrelated values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledEditor links={links} onChange={onChange} />);

    for (const [name, value] of [
      ["Jade", "jade"],
      ["Ink", "ink"],
      ["Coral", "coral"],
    ] as const) {
      await user.click(screen.getByRole("radio", { name }));
      expect(lastChange(onChange).accent).toBe(value);
    }
    for (const [name, value] of [
      ["Compact", "compact"],
      ["Editorial", "editorial"],
      ["Comfortable", "comfortable"],
    ] as const) {
      await user.click(screen.getByRole("radio", { name }));
      expect(lastChange(onChange).typeScale).toBe(value);
    }
    await user.click(screen.getByRole("radio", { name: "Outlined" }));
    expect(lastChange(onChange).linkTreatment).toBe("outlined");
    await user.click(screen.getByRole("radio", { name: "Filled" }));
    expect(lastChange(onChange).linkTreatment).toBe("filled");
    expect(lastChange(onChange).preset).toBe("warm-studio");
  });

  it("keeps identity color rows independent and supports the custom picker", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledEditor links={[]} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Default name color" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Default bio / role color" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coral name color" }));
    expect(lastChange(onChange).identityColors).toEqual({
      name: { kind: "preset", value: "coral" },
    });
    expect(lastChange(onChange).identityColors?.bio).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    expect(screen.getByRole("dialog", { name: "Name custom color picker" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Name hue" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Name saturation" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Name value" })).toBeInTheDocument();
    const hexInput = screen.getByLabelText("Name custom hex color");
    await user.clear(hexInput);
    await user.type(hexInput, "#a84431");
    expect(lastChange(onChange).identityColors).toEqual({
      name: { kind: "custom", hex: "#a84431" },
    });

    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "Name custom color picker" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose custom name color" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    await user.clear(screen.getByLabelText("Name custom hex color"));
    await user.type(screen.getByLabelText("Name custom hex color"), "#ffffff");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The profile name custom color does not meet contrast requirements.",
    );
    expect(lastChange(onChange).identityColors).toEqual({
      name: { kind: "custom", hex: "#a84431" },
    });
  });

  it("supports About and Services content with at most three service items", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const customization = { ...DEFAULT_WARM_STUDIO_CUSTOMIZATION };
    render(<ControlledEditor initial={customization} links={[]} onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Services" }));
    expect(lastChange(onChange).section).toEqual({ kind: "services", body: "", items: [] });
    await user.click(screen.getByRole("button", { name: "Add service" }));
    await user.click(screen.getByRole("button", { name: "Add service" }));
    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(
      screen.getAllByRole("textbox").filter((input) => input.getAttribute("maxlength") === "60"),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Add service" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Service 2" }));
    expect(
      screen.getAllByRole("textbox").filter((input) => input.getAttribute("maxlength") === "60"),
    ).toHaveLength(2);
    await user.type(screen.getByLabelText("Services intro"), "What I offer");
    await user.type(screen.getByLabelText("Service 1"), "Design systems");
    expect(lastChange(onChange).section).toEqual({
      kind: "services",
      body: "What I offer",
      items: ["Design systems", ""],
    });
    await user.click(screen.getByRole("button", { name: "Remove Services section" }));
    expect(lastChange(onChange).section).toBeUndefined();
  });

  it("allows white custom identity colors when a background image is active", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        links={[]}
        media={backgroundMedia}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Choose custom name color" }));
    const hexInput = screen.getByLabelText("Name custom hex color");
    await user.clear(hexInput);
    await user.type(hexInput, "#ffffff");

    expect(lastChange(onChange).identityColors).toEqual({
      name: { kind: "custom", hex: "#ffffff" },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exposes section order, guided disclosures, and exact body labels", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ControlledEditor
        identityContent={<div>Identity fields</div>}
        links={[]}
        onChange={onChange}
      />,
    );
    for (const name of [
      "Identity",
      "Contact and links",
      "About or Services",
      "Style",
      "Review and publish",
    ]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(button.getAttribute("aria-controls")!)).toBeInTheDocument();
    }
    await user.click(screen.getByRole("radio", { name: "About/Services first" }));
    expect(lastChange(onChange).contentOrder).toBe("section-first");
    await user.click(screen.getByRole("radio", { name: "About" }));
    expect(screen.getByLabelText("About copy")).toBeInTheDocument();
    expect(screen.getByLabelText("About copy")).toHaveAttribute("maxlength", "280");
  });

  it("places optional Media after Style and keeps it collapsed by default", () => {
    render(
      <ProfileCustomizationEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        links={[]}
        onChange={vi.fn()}
        onMediaChange={vi.fn()}
        onMediaUpload={vi.fn()}
      />,
    );
    const labels = screen.getAllByRole("button").map((button) => button.textContent?.trim());
    expect(labels.indexOf("Media")).toBeGreaterThan(labels.indexOf("Style"));
    expect(labels.indexOf("Media")).toBeLessThan(labels.indexOf("Review and publish"));
    expect(screen.getByRole("button", { name: "Media" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps collapsed panels mounted and supports keyboard activation", async () => {
    const user = userEvent.setup();
    render(<ControlledEditor links={[]} onChange={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Style" });
    const panelId = button.getAttribute("aria-controls")!;

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(panelId)).toBeInTheDocument();
    expect(document.getElementById(panelId)).toHaveAttribute("hidden");

    button.focus();
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(panelId)).not.toHaveAttribute("hidden");
  });

  it("associates customization validation errors with affected controls", () => {
    render(
      <ProfileCustomizationEditor
        customization={{
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          accent: "coral",
          section: { kind: "services", body: "", items: [""] },
        }}
        errors={[
          "The profile customization accent is invalid.",
          "A Services section body must be nonblank.",
          "Every service item must be nonblank.",
        ]}
        links={[]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", { name: "Coral" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("error"),
    );
    expect(screen.getByLabelText("Services intro")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("error"),
    );
    expect(screen.getByLabelText("Service 1")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("error"),
    );
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(3);
  });

  it("requires explicit opt-in when customization is missing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileCustomizationEditor links={links} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use Warm Studio" }));
    expect(onChange).toHaveBeenCalledWith(DEFAULT_WARM_STUDIO_CUSTOMIZATION);
  });

  it("warns and allows clearing a missing featured link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProfileCustomizationEditor
        customization={{ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, featuredLinkId: "missing" }}
        links={links}
        onChange={onChange}
      />,
    );
    expect(screen.getByText(/missing or disabled/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear featured link" }));
    expect(lastChange(onChange).featuredLinkId).toBeUndefined();
  });

  it("warns and clears a disabled featured link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProfileCustomizationEditor
        customization={{ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, featuredLinkId: "old" }}
        links={links}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/disabled/i);
    expect(screen.getByRole("combobox", { name: "Featured link" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("error"),
    );
    await user.click(screen.getByRole("button", { name: "Clear featured link" }));
    expect(lastChange(onChange).featuredLinkId).toBeUndefined();
  });
});
