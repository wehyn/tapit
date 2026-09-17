import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { LinkIcon } from "@/lib/domain";
import { LinksWorkspace } from "@/components/forms/LinksWorkspace";

describe("LinksWorkspace", () => {
  it("renders the shared links table, preview, and action callbacks", async () => {
    const user = userEvent.setup();
    const onAddLink = vi.fn();
    const onSaveDraft = vi.fn();
    const onUpdateRedirect = vi.fn();

    render(
      <LinksWorkspace
        profileUrl="/mara-velasquez"
        links={[
          {
            id: "linkedin",
            label: "LinkedIn",
            destination: "https://www.linkedin.com/in/mara-velasquez",
            enabled: true,
            icon: "linkedin",
          },
        ]}
        redirect={{ enabled: false, destination: "" }}
        redirectError={null}
        theme="paper"
        preview={{
          id: "preview",
          slug: "mara-velasquez",
          name: "Mara Velasquez",
          theme: "paper",
          links: [],
        }}
        validation={{}}
        publicationErrors={[]}
        message={null}
        previewMode="phone"
        pendingAction={null}
        isDirty={true}
        publicationLabel="Publish changes"
        onPreviewModeChange={vi.fn()}
        onUpdateLink={vi.fn()}
        onUpdateRedirect={onUpdateRedirect}
        onAddLink={onAddLink}
        onMoveLink={vi.fn()}
        onRemoveLink={vi.fn()}
        onSaveDraft={onSaveDraft}
        onPublish={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your links" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add link" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Label for LinkedIn" })).toHaveValue("LinkedIn");
    expect(screen.getByRole("region", { name: "Live profile preview" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Add link" }));
    expect(onAddLink).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Redirect card taps and scans" })).toBeVisible();
    expect(screen.getByText("Use the full address, including https://.")).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Enable card tap and scan redirect" }));
    expect(onUpdateRedirect).toHaveBeenCalledWith({ enabled: true });
    fireEvent.change(screen.getByRole("textbox", { name: "HTTPS destination URL" }), {
      target: { value: "https://example.com" },
    });
    expect(onUpdateRedirect).toHaveBeenLastCalledWith({ destination: "https://example.com" });
  });

  it("exposes invalid rows and a loading save state", () => {
    render(
      <LinksWorkspace
        profileUrl="/mara-velasquez"
        links={[
          {
            id: "linkedin",
            label: "LinkedIn",
            destination: "https://www.linkedin.com/in/mara-velasquez",
            enabled: true,
            icon: "linkedin",
          },
        ]}
        redirect={{ enabled: true, destination: "" }}
        redirectError={"Redirect destination must be a valid HTTPS URL without credentials."}
        canSaveDraft={false}
        theme="paper"
        preview={{
          id: "preview",
          slug: "mara-velasquez",
          name: "Mara Velasquez",
          theme: "paper",
          links: [],
        }}
        validation={{ linkedin: "Add a label so visitors know where this link goes." }}
        publicationErrors={[]}
        message={null}
        previewMode="phone"
        pendingAction="save"
        isDirty={false}
        publicationLabel="Publish changes"
        onPreviewModeChange={vi.fn()}
        onUpdateLink={vi.fn()}
        onUpdateRedirect={vi.fn()}
        onAddLink={vi.fn()}
        onMoveLink={vi.fn()}
        onRemoveLink={vi.fn()}
        onSaveDraft={vi.fn()}
        onPublish={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole("button", { name: "Saving..." });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute("aria-busy", "true");
    expect(saveButton).toHaveAttribute("data-state", "loading");
    expect(screen.getByRole("textbox", { name: "Label for LinkedIn" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Add a label so visitors know where this link goes.")).toBeVisible();
  });

  it.each(["legacy-icon", "constructor", "__proto__"])(
    "falls back to the generic icon for an unsupported runtime icon: %s",
    (runtimeIcon) => {
      render(
        <LinksWorkspace
          profileUrl="/mara-velasquez"
          links={[
            {
              id: "linkedin",
              label: "LinkedIn",
              destination: "https://www.linkedin.com/in/mara-velasquez",
              enabled: true,
              icon: runtimeIcon as LinkIcon,
            },
          ]}
          redirect={{ enabled: false, destination: "" }}
          redirectError={null}
          theme="paper"
          preview={{
            id: "preview",
            slug: "mara-velasquez",
            name: "Mara Velasquez",
            theme: "paper",
            links: [],
          }}
          validation={{}}
          publicationErrors={[]}
          message={null}
          previewMode="phone"
          pendingAction={null}
          isDirty={false}
          publicationLabel="Publish changes"
          onPreviewModeChange={vi.fn()}
          onUpdateLink={vi.fn()}
          onUpdateRedirect={vi.fn()}
          onAddLink={vi.fn()}
          onMoveLink={vi.fn()}
          onRemoveLink={vi.fn()}
          onSaveDraft={vi.fn()}
          onPublish={vi.fn()}
        />,
      );

      expect(screen.getByRole("combobox", { name: "Preset icon for LinkedIn" })).toHaveValue(
        "link",
      );
    },
  );
});
