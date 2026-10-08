import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ProfileDetailsEditor,
  type ProfileFieldChange,
} from "../../src/components/forms/ProfileDetailsEditor";
import type { ProfileContent, ProfileLink } from "../../src/lib/domain";
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  type ProfileCustomization,
} from "../../src/lib/profile-customization";

// Failure modes covered by this isolated component test:
// - identity/contact controls can drift from the existing labels, IDs, placeholders, or limits;
// - clearing optional fields can incorrectly persist empty strings instead of undefined;
// - slug locking and the Public URL copy action can be lost during extraction;
// - Featured link and About/Services updates can drop unrelated customization values;
// - Services item edits can mutate the previous nested array instead of cloning it;
// - unavailable or disabled featured links can lose their warning and clear action;
// - visual customization controls can accidentally remain on the Profile details surface;
// - profiles without saved customization can fail to initialize content controls.

const links = [
  { id: "booking", label: "Book a call", destination: "https://example.com/book", enabled: true },
  { id: "old", label: "Old link", destination: "https://example.com/old", enabled: false },
] satisfies readonly ProfileLink[];

const draft: ProfileContent = {
  name: "Alex Morgan",
  slug: "alex-morgan",
  bio: "Designer helping small teams",
  email: "alex@example.com",
  phone: "+63 917 555 0184",
  website: "https://example.com",
  links: links.map((link) => ({ ...link })),
};

function ControlledDetails({
  initialCustomization = {
    ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
    accent: "jade",
    typeScale: "editorial",
    identityColors: { name: { kind: "preset", value: "ink" } },
  },
  errors = [],
  onCustomizationChange,
}: {
  errors?: readonly string[];
  initialCustomization?: ProfileCustomization;
  onCustomizationChange: (next: ProfileCustomization | undefined) => void;
}) {
  const [customization, setCustomization] = useState<ProfileCustomization | undefined>(
    initialCustomization,
  );
  const onChange: ProfileFieldChange = () => undefined;

  return (
    <ProfileDetailsEditor
      customization={customization}
      copyMessage=""
      draft={draft}
      errors={errors}
      links={links}
      onChange={onChange}
      onCopyUrl={vi.fn()}
      onCustomizationChange={(next) => {
        onCustomizationChange(next);
        setCustomization(next);
      }}
      slugLocked={false}
    />
  );
}

function lastCustomizationChange(mock: ReturnType<typeof vi.fn>): ProfileCustomization | undefined {
  return mock.mock.lastCall?.[0] as ProfileCustomization | undefined;
}

describe("ProfileDetailsEditor", () => {
  it("renders identity/contact fields, normalizes optional values, and keeps the slug locked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCopyUrl = vi.fn();

    render(
      <ProfileDetailsEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        copyMessage=""
        draft={draft}
        imageContent={<div>Profile image slot</div>}
        links={links}
        message={<div>Draft message</div>}
        onboarding={<div>Onboarding slot</div>}
        onChange={onChange}
        onCopyUrl={onCopyUrl}
        onCustomizationChange={vi.fn()}
        slugLocked
      />,
    );

    expect(screen.getByRole("heading", { name: "Profile identity" })).toBeInTheDocument();
    expect(screen.getByText("Draft message")).toBeInTheDocument();
    expect(screen.getByText("Onboarding slot")).toBeInTheDocument();
    expect(screen.getByText("Profile image slot")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("id", "profile-name");
    expect(screen.getByLabelText("Bio or role")).toHaveAttribute("id", "profile-bio");
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "profile-email");
    expect(screen.getByLabelText("Phone")).toHaveAttribute("id", "profile-phone");
    expect(screen.getByLabelText("Website")).toHaveAttribute("id", "profile-website");
    expect(screen.getByLabelText("Stable profile slug")).toHaveAttribute("id", "profile-slug");
    expect(screen.getByLabelText("Bio or role")).toHaveAttribute("maxlength", "140");
    expect(screen.getByPlaceholderText("e.g. Alex Morgan")).toHaveValue("Alex Morgan");
    expect(screen.getByPlaceholderText("you@example.com")).toHaveValue("alex@example.com");
    expect(screen.getByPlaceholderText("+63 917 555 0184")).toHaveValue("+63 917 555 0184");
    expect(screen.getByPlaceholderText("https://yourwebsite.com")).toHaveValue(
      "https://example.com",
    );
    expect(screen.getByLabelText("Stable profile slug")).toBeDisabled();
    expect(screen.getByText("The slug is immutable after first publication.")).toBeInTheDocument();
    expect(screen.getByText("Public URL")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Bio or role"));
    await user.clear(screen.getByLabelText("Email"));
    await user.clear(screen.getByLabelText("Phone"));
    await user.clear(screen.getByLabelText("Website"));

    expect(onChange).toHaveBeenCalledWith("bio", undefined);
    expect(onChange).toHaveBeenCalledWith("email", undefined);
    expect(onChange).toHaveBeenCalledWith("phone", undefined);
    expect(onChange).toHaveBeenCalledWith("website", undefined);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(onCopyUrl).toHaveBeenCalledOnce();
  });

  it("updates Featured link while preserving unrelated customization values", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    render(
      <ControlledDetails
        initialCustomization={{
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          accent: "jade",
          typeScale: "editorial",
          identityColors: { name: { kind: "preset", value: "ink" } },
        }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    expect(screen.getByLabelText("Featured link")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Old link (disabled)" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Featured link"), "booking");

    expect(lastCustomizationChange(onCustomizationChange)).toEqual({
      ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
      accent: "jade",
      typeScale: "editorial",
      identityColors: { name: { kind: "preset", value: "ink" } },
      featuredLinkId: "booking",
    });
  });

  it("supports About and Services content with cloned service items and exact limits", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    const items = ["Design systems"];
    render(
      <ControlledDetails
        initialCustomization={{
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          accent: "jade",
          section: { kind: "services", body: "What I offer", items },
        }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    expect(screen.getByLabelText("Services intro")).toHaveAttribute("maxlength", "160");
    expect(screen.getByLabelText("Service 1")).toHaveAttribute("maxlength", "60");
    expect(screen.queryByLabelText("About copy")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Services intro"));
    const introChange = lastCustomizationChange(onCustomizationChange);
    expect(introChange?.section).toMatchObject({ kind: "services", body: "" });
    if (introChange?.section?.kind === "services") {
      expect(introChange.section.items).not.toBe(items);
    }
    expect(items).toEqual(["Design systems"]);

    await user.type(screen.getByLabelText("Services intro"), "Updated offer");
    const updatedIntroChange = lastCustomizationChange(onCustomizationChange);
    expect(updatedIntroChange?.section).toMatchObject({
      kind: "services",
      body: "Updated offer",
    });
    if (updatedIntroChange?.section?.kind === "services") {
      expect(updatedIntroChange.section.items).not.toBe(items);
    }
    expect(items).toEqual(["Design systems"]);

    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(screen.getByLabelText("Service 2")).toBeInTheDocument();
    expect(lastCustomizationChange(onCustomizationChange)?.accent).toBe("jade");
    expect(lastCustomizationChange(onCustomizationChange)?.section).toEqual({
      kind: "services",
      body: "Updated offer",
      items: ["Design systems", ""],
    });

    await user.type(screen.getByLabelText("Service 2"), "Brand strategy");
    expect(lastCustomizationChange(onCustomizationChange)?.section).toEqual({
      kind: "services",
      body: "Updated offer",
      items: ["Design systems", "Brand strategy"],
    });

    await user.click(screen.getByRole("button", { name: "Remove Service 1" }));
    expect(lastCustomizationChange(onCustomizationChange)?.section).toEqual({
      kind: "services",
      body: "Updated offer",
      items: ["Brand strategy"],
    });

    await user.click(screen.getByRole("button", { name: "Add service" }));
    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(
      screen.getAllByRole("textbox").filter((input) => input.getAttribute("maxlength") === "60"),
    ).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Add service" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Services section" }));
    expect(lastCustomizationChange(onCustomizationChange)).toMatchObject({
      accent: "jade",
    });
    expect(lastCustomizationChange(onCustomizationChange)?.section).toBeUndefined();
    expect(items).toEqual(["Design systems"]);
  });

  it("supports switching to About and preserves unrelated customization fields", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    render(<ControlledDetails onCustomizationChange={onCustomizationChange} />);

    await user.click(screen.getByRole("radio", { name: "About" }));
    expect(lastCustomizationChange(onCustomizationChange)).toMatchObject({
      accent: "jade",
      typeScale: "editorial",
      section: { kind: "about", body: "" },
    });
    expect(screen.getByLabelText("About copy")).toHaveAttribute("maxlength", "280");

    await user.type(screen.getByLabelText("About copy"), "A little about me");
    expect(lastCustomizationChange(onCustomizationChange)?.section).toEqual({
      kind: "about",
      body: "A little about me",
    });
  });

  it("switches into Services and starts with an empty, editable item list", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    render(
      <ControlledDetails
        initialCustomization={{ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, section: undefined }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Services" }));
    expect(lastCustomizationChange(onCustomizationChange)?.section).toEqual({
      kind: "services",
      body: "",
      items: [],
    });
    expect(screen.getByLabelText("Services intro")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add service" }));
    expect(screen.getByLabelText("Service 1")).toBeInTheDocument();
  });

  it("preserves Featured link, section, and field validation accessibility", () => {
    const onCustomizationChange = vi.fn();
    render(
      <ControlledDetails
        errors={[
          "A profile section kind is invalid.",
          "A Services section body must be nonblank.",
          "Every service item must be nonblank.",
        ]}
        initialCustomization={{
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          featuredLinkId: "old",
          section: { kind: "services", body: "", items: [""] },
        }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    const featuredLink = screen.getByLabelText("Featured link");
    const featuredErrorId = featuredLink.getAttribute("aria-describedby");
    expect(featuredErrorId).toEqual(expect.stringMatching(/-featured-link-error$/));
    expect(document.getElementById(featuredErrorId!)).toHaveAttribute("role", "alert");
    expect(document.getElementById(featuredErrorId!)).toHaveTextContent(/missing or disabled/i);

    const sectionKindErrorId = screen
      .getByRole("radio", { name: "About" })
      .getAttribute("aria-describedby");
    expect(sectionKindErrorId).toEqual(expect.stringMatching(/-kind-error$/));
    expect(document.getElementById(sectionKindErrorId!)).toHaveAttribute("role", "alert");
    expect(document.getElementById(sectionKindErrorId!)).toHaveTextContent(
      "A profile section kind is invalid.",
    );

    const servicesIntro = screen.getByLabelText("Services intro");
    expect(servicesIntro).toHaveAttribute("aria-invalid", "true");
    expect(servicesIntro.getAttribute("aria-describedby")).toEqual(
      expect.stringMatching(/-services-intro-error$/),
    );
    expect(screen.getByText("A Services section body must be nonblank.")).toHaveAttribute(
      "role",
      "alert",
    );

    const serviceItem = screen.getByLabelText("Service 1");
    expect(serviceItem).toHaveAttribute("aria-invalid", "true");
    expect(serviceItem.getAttribute("aria-describedby")).toEqual(
      expect.stringMatching(/-service-0-error$/),
    );
    expect(screen.getByText("Every service item must be nonblank.")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("warns about and clears an unavailable Featured link", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    render(
      <ControlledDetails
        initialCustomization={{ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, featuredLinkId: "missing" }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    expect(screen.getByRole("option", { name: "Unavailable featured link" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/missing or disabled/i);
    await user.click(screen.getByRole("button", { name: "Clear featured link" }));
    expect(lastCustomizationChange(onCustomizationChange)?.featuredLinkId).toBeUndefined();
  });

  it("warns about and clears a disabled Featured link", async () => {
    const user = userEvent.setup();
    const onCustomizationChange = vi.fn();
    render(
      <ControlledDetails
        initialCustomization={{ ...DEFAULT_WARM_STUDIO_CUSTOMIZATION, featuredLinkId: "old" }}
        onCustomizationChange={onCustomizationChange}
      />,
    );

    expect(screen.getByRole("option", { name: "Old link (disabled)" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/missing or disabled/i);
    await user.click(screen.getByRole("button", { name: "Clear featured link" }));
    expect(lastCustomizationChange(onCustomizationChange)?.featuredLinkId).toBeUndefined();
  });

  it("keeps visual controls in Customize and offers content controls on legacy profiles", async () => {
    const onCustomizationChange = vi.fn();
    const { rerender } = render(
      <ProfileDetailsEditor
        customization={DEFAULT_WARM_STUDIO_CUSTOMIZATION}
        copyMessage=""
        draft={draft}
        links={links}
        onChange={() => undefined}
        onCopyUrl={vi.fn()}
        onCustomizationChange={onCustomizationChange}
        slugLocked={false}
      />,
    );

    expect(screen.queryByRole("radio", { name: "Coral" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Default name color" })).not.toBeInTheDocument();
    expect(screen.queryByText("Type scale")).not.toBeInTheDocument();
    expect(screen.queryByText("Link/button treatment")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Featured link")).toBeInTheDocument();
    expect(screen.queryByText("Content order")).not.toBeInTheDocument();
    expect(screen.queryByText("Media")).not.toBeInTheDocument();

    rerender(
      <ProfileDetailsEditor
        copyMessage=""
        customization={undefined}
        draft={draft}
        links={links}
        onChange={() => undefined}
        onCopyUrl={vi.fn()}
        onCustomizationChange={onCustomizationChange}
        slugLocked={false}
      />,
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Featured link")).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText("Featured link"), "booking");
    expect(onCustomizationChange).toHaveBeenCalledWith(
      expect.objectContaining({ preset: "paper", featuredLinkId: "booking" }),
    );
  });
});
