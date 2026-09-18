import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveMutation = vi.hoisted(() => vi.fn().mockResolvedValue({ updatedAt: 1 }));

vi.mock("convex/react", () => ({
  useMutation: () => saveMutation,
  useQuery: () => undefined,
}));

import {
  appendProfileLink,
  areProfileLinksEqual,
  canAddProfileLink,
  canPreviewLinks,
  normalizeLinkIcon,
  normalizeProfileLinks,
  normalizeProfileRedirect,
  areProfileRedirectsEqual,
  canSaveLinksDraft,
  LinksEditor,
  LiveLinksEditorContent,
} from "@/components/forms/LinksEditor";
import { getDemoState, resetDemoState, setDemoSession } from "@/lib/demo/store";

const baseLink = {
  label: "Link",
  destination: "https://example.com",
  enabled: true,
  icon: "link" as const,
};

describe("LinksEditor controller boundaries", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDemoState();
    setDemoSession({ email: "mara@example.test", role: "customer" });
  });

  it("stops adding links at the 100-link limit", () => {
    expect(canAddProfileLink(99)).toBe(true);
    expect(canAddProfileLink(100)).toBe(false);
    expect(canAddProfileLink(101)).toBe(false);

    const hundredLinks = Array.from({ length: 100 }, (_, index) => ({
      ...baseLink,
      id: `link-${index}`,
    }));
    expect(appendProfileLink(hundredLinks, "link-overflow")).toHaveLength(100);
    expect(appendProfileLink(hundredLinks.slice(0, 99), "link-99")).toHaveLength(100);
  });

  it("normalizes unsupported persisted icons to the generic icon", () => {
    expect(normalizeLinkIcon(undefined)).toBe("link");
    expect(normalizeLinkIcon("legacy-icon")).toBe("link");
    expect(normalizeLinkIcon("linkedin")).toBe("linkedin");
  });

  it("compares normalized persisted links without a false dirty state", () => {
    const persistedLinks = [{ id: "site", ...baseLink, icon: undefined }];
    const normalizedLinks = normalizeProfileLinks(persistedLinks);

    expect(normalizedLinks[0]?.icon).toBe("link");
    expect(areProfileLinksEqual(normalizedLinks, persistedLinks)).toBe(true);
    expect(
      areProfileLinksEqual(normalizedLinks, [
        { id: "site", ...baseLink, destination: "https://changed.example", icon: undefined },
      ]),
    ).toBe(false);
  });

  it("only shows a preview when validation and publication checks pass", () => {
    expect(canPreviewLinks({}, [])).toBe(true);
    expect(canPreviewLinks({ site: "Link destination is unsafe." }, [])).toBe(false);
    expect(canPreviewLinks({}, ["Claim the attached card before publishing this profile."])).toBe(
      false,
    );
  });

  it("normalizes a missing redirect and compares redirect edits", () => {
    const disabled = normalizeProfileRedirect(undefined);
    expect(disabled).toEqual({ enabled: false, destination: "" });
    expect(areProfileRedirectsEqual(disabled, undefined)).toBe(true);
    expect(
      areProfileRedirectsEqual({ enabled: true, destination: "https://example.com" }, undefined),
    ).toBe(false);
    expect(
      areProfileRedirectsEqual(
        { enabled: true, destination: "https://example.com" },
        { enabled: true, destination: "https://example.com" },
      ),
    ).toBe(true);
  });

  it("blocks saving an enabled invalid redirect while allowing a valid redirect-only edit", () => {
    expect(canSaveLinksDraft({ enabled: true, destination: "not a URL" })).toBe(false);
    expect(canSaveLinksDraft({ enabled: true, destination: "https://example.com" })).toBe(true);
  });

  it("updates live redirect-only edits and saves the corrected destination", async () => {
    render(
      createElement(LiveLinksEditorContent, {
        profile: {
          _id: "profile-1",
          _creationTime: 1,
          ownerId: "customer-1",
          scope: "default",
          status: "published",
          draft: {
            name: "Mara Velasquez",
            slug: "mara-velasquez",
            links: [{ id: "site", ...baseLink }],
          },
          published: {
            name: "Mara Velasquez",
            slug: "mara-velasquez",
            links: [{ id: "site", ...baseLink }],
            publishedAt: new Date(1).toISOString(),
          },
        } as never,
      }),
    );

    const toggle = screen.getByRole("checkbox", { name: "Enable card tap and scan redirect" });
    const destination = screen.getByRole("textbox", { name: "HTTPS destination URL" });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.change(destination, { target: { value: "https://www.harleystudio.com" } });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(saveMutation).toHaveBeenCalledWith({
      profileId: "profile-1",
      links: [{ id: "site", ...baseLink }],
      redirect: { enabled: true, destination: "https://www.harleystudio.com" },
    });
  });

  it("saves a demo redirect as draft and publishes it separately", async () => {
    render(createElement(LinksEditor));

    const toggle = screen.getByRole("checkbox", { name: "Enable card tap and scan redirect" });
    const destination = screen.getByRole("textbox", { name: "HTTPS destination URL" });
    expect(toggle).not.toBeChecked();
    expect(destination).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();

    fireEvent.click(toggle);
    fireEvent.change(destination, { target: { value: "https://www.harleystudio.com" } });
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText("Links saved to draft. Visitors still see the last published order.");

    let profile = getDemoState().profiles.find((candidate) => candidate.id === "profile-mara");
    expect(profile?.draft.redirect).toEqual({
      enabled: true,
      destination: "https://www.harleystudio.com",
    });
    expect(profile?.draft.links).toEqual(profile?.published?.links);
    expect(profile?.published?.redirect).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Publish changes" }));
    await screen.findByText(
      "Links published. The public profile now uses this order and enabled state.",
    );

    profile = getDemoState().profiles.find((candidate) => candidate.id === "profile-mara");
    expect(profile?.published?.redirect).toEqual({
      enabled: true,
      destination: "https://www.harleystudio.com",
    });
  });
});
