import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileWorkspaceFrame } from "../../src/components/forms/ProfileWorkspaceFrame";
import { projectPublicProfile } from "../../src/lib/domain";
import { createDefaultDemoState } from "../../src/lib/demo/fixtures";

const defaultProfile = createDefaultDemoState().profiles[0];
const defaultProjection =
  defaultProfile === undefined ? null : projectPublicProfile(defaultProfile);

function renderEditorPreview(
  customization?: NonNullable<typeof defaultProjection>["customization"],
) {
  if (defaultProjection === null) throw new Error("The demo profile fixture is missing.");

  render(
    <ProfileWorkspaceFrame
      controls={<div />}
      hasDraftChanges={false}
      hasPublishedProfile
      onPublish={() => {}}
      onSave={() => {}}
      preview={{ ...defaultProjection, customization }}
      profileUrl="/mara-velasquez"
      publishDisabled
      publishLabel="Publish profile"
      saveDisabled
      title="Your profile"
    />,
  );

  const mobilePreview = screen.getByRole("group", { name: "Mobile web profile preview" });
  const profilePanel = mobilePreview.querySelector("section");
  if (profilePanel === null) throw new Error("The profile preview panel is missing.");

  return { mobilePreview, profilePanel };
}

describe("profile workspace mobile preview", () => {
  it("uses the published mobile spacing and card for the default theme", () => {
    const { mobilePreview, profilePanel } = renderEditorPreview(undefined);

    expect(within(mobilePreview).getByText("Powered by Tapit", { exact: true })).toHaveClass(
      "mt-auto",
    );
    expect(within(mobilePreview).queryByText("Tapit", { exact: true })).not.toBeInTheDocument();
    expect(profilePanel).toHaveClass("flex", "flex-col", "min-h-full");
    expect(profilePanel).toHaveClass("rounded-tapit", "border");
    expect(within(mobilePreview).getByRole("list", { name: "Profile links" })).toHaveClass(
      "mt-9",
      "gap-3",
    );
    expect(within(mobilePreview).getByRole("link", { name: "LinkedIn" })).toHaveClass(
      "min-h-14",
      "px-5",
      "py-4",
      "text-sm",
    );
  });

  it("keeps Warm Studio edge-to-edge while using the published mobile spacing", () => {
    const { mobilePreview, profilePanel } = renderEditorPreview({
      preset: "warm-studio",
      accent: "coral",
      typeScale: "comfortable",
      linkTreatment: "outlined",
      contentOrder: "links-first",
    });

    expect(within(mobilePreview).getByText("Powered by Tapit", { exact: true })).toHaveClass(
      "mt-auto",
    );
    expect(within(mobilePreview).queryByText("Tapit", { exact: true })).not.toBeInTheDocument();
    expect(profilePanel).toHaveClass("flex", "flex-col", "min-h-full");
    expect(profilePanel).toHaveClass("rounded-none", "border-0");
    expect(within(mobilePreview).getByRole("list", { name: "Profile links" })).toHaveClass(
      "mt-6",
      "gap-3",
    );
    expect(within(mobilePreview).getByRole("link", { name: "LinkedIn" })).toHaveClass(
      "min-h-14",
      "px-5",
      "py-4",
      "text-sm",
    );
  });
});
