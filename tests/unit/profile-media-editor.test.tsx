import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfileMediaEditor } from "../../src/components/forms/ProfileMediaEditor";
import {
  DEFAULT_PROFILE_MEDIA,
  MAX_PROFILE_SLIDESHOW_IMAGES,
  type ProfileMediaPresentation,
} from "../../src/lib/profile-media";
import type { Id } from "../../convex/_generated/dataModel";

const assetId = (value: string) => value as Id<"profileMediaAssets">;

function image(id: string, altText = `${id} detail`) {
  return { assetId: assetId(id), altText, url: `https://cdn.test/${id}.webp` };
}

const media: ProfileMediaPresentation = {
  ...DEFAULT_PROFILE_MEDIA,
  background: { ...image("background", "Studio wall"), positionX: 50, positionY: 50 },
  slideshow: [image("one", "Desk detail"), image("two", "Plant detail")],
};

describe("ProfileMediaEditor", () => {
  it("uploads, bounds controls, reuses a slideshow asset, and never mutates input media", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onUpload = vi.fn().mockResolvedValue(image("uploaded", "Uploaded image"));
    const { container } = render(
      <ProfileMediaEditor media={media} onChange={onChange} onUpload={onUpload} />,
    );

    expect(screen.getByLabelText("Hero height: 320px")).toHaveAttribute("min", "220");
    expect(screen.getByLabelText("Hero height: 320px")).toHaveAttribute("max", "520");
    await user.click(screen.getByRole("button", { name: "Use slideshow image 1 as background" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        background: expect.objectContaining({ assetId: "one", url: "https://cdn.test/one.webp" }),
      }),
    );
    expect(media.background?.assetId).toBe(assetId("background"));

    const file = new File(["image"], "new.webp", { type: "image/webp" });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    expect(onUpload).toHaveBeenCalledWith(file, "background");
  });

  it("removes a background without removing the slideshow", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileMediaEditor media={media} onChange={onChange} onUpload={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remove background" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ slideshow: media.slideshow }));
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty("background");
    expect(media.background).toBeDefined();
  });

  it("preserves configured media settings when removing the only background", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onlyBackground = {
      ...media,
      heroHeight: 400,
      background: media.background,
      slideshow: [],
    };
    render(<ProfileMediaEditor media={onlyBackground} onChange={onChange} onUpload={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remove background" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        heroHeight: 400,
        autoplay: onlyBackground.autoplay,
        slideshow: [],
      }),
    );
    expect(onChange.mock.calls[0]![0]).not.toHaveProperty("background");
  });

  it("merges a completed upload into edits made while it was pending", async () => {
    const user = userEvent.setup();
    let resolveUpload!: (uploaded: ReturnType<typeof image>) => void;
    const upload = new Promise<ReturnType<typeof image>>((resolve) => {
      resolveUpload = resolve;
    });
    const onUpload = vi.fn().mockReturnValue(upload);
    const onChange = vi.fn();
    const view = render(
      <ProfileMediaEditor media={media} onChange={onChange} onUpload={onUpload} />,
    );

    await user.upload(
      screen.getByLabelText("Upload background image"),
      new File(["image"], "new.webp", { type: "image/webp" }),
    );
    fireEvent.change(screen.getByLabelText("Hero height: 320px"), { target: { value: "401" } });
    view.rerender(
      <ProfileMediaEditor
        media={onChange.mock.lastCall![0]}
        onChange={onChange}
        onUpload={onUpload}
      />,
    );

    await act(async () => resolveUpload(image("uploaded")));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        heroHeight: 401,
        background: expect.objectContaining({ assetId: assetId("uploaded") }),
      }),
    );
  });

  it("creates immutable media values for hero and crop changes", () => {
    const onChange = vi.fn();
    render(<ProfileMediaEditor media={media} onChange={onChange} onUpload={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Hero height: 320px"), { target: { value: "321" } });
    fireEvent.change(screen.getByLabelText("Crop horizontal position: 50%"), {
      target: { value: "51" },
    });
    fireEvent.change(screen.getByLabelText("Crop vertical position: 50%"), {
      target: { value: "51" },
    });
    expect(onChange).toHaveBeenCalled();
    for (const [next] of onChange.mock.calls) {
      expect(next).not.toBe(media);
      expect(next.slideshow).not.toBe(media.slideshow);
      expect(next.background).not.toBe(media.background);
    }
    expect(media.heroHeight).toBe(320);
    expect(media.background?.positionX).toBe(50);
    expect(media.background?.positionY).toBe(50);
  });

  it("reorders and removes slides while retaining remaining images", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileMediaEditor media={media} onChange={onChange} onUpload={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Move slideshow image 2 up" }));
    const reordered = onChange.mock.calls[0]![0] as ProfileMediaPresentation;
    expect(reordered.slideshow.map((item) => item.assetId)).toEqual([
      assetId("two"),
      assetId("one"),
    ]);
    expect(reordered).not.toBe(media);
    onChange.mockClear();
    await user.click(screen.getByRole("button", { name: "Remove slideshow image 1" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slideshow: [expect.objectContaining({ assetId: assetId("two") })],
      }),
    );
    expect(media.slideshow).toHaveLength(2);
  });

  it("toggles autoplay without mutating the input", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileMediaEditor media={media} onChange={onChange} onUpload={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Autoplay slideshow while visible" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoplay: false }));
    expect(media.autoplay).toBe(true);
  });

  it("disables slideshow uploads at ten images", () => {
    const fullMedia = {
      ...media,
      slideshow: Array.from({ length: MAX_PROFILE_SLIDESHOW_IMAGES }, (_, index) =>
        image(`slide-${index}`),
      ),
    };
    render(<ProfileMediaEditor media={fullMedia} onChange={vi.fn()} onUpload={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Upload slideshow image" })).toBeDisabled();
  });

  it("associates validation and upload errors with affected controls", async () => {
    const user = userEvent.setup();
    render(
      <ProfileMediaEditor
        media={media}
        onChange={vi.fn()}
        onUpload={vi.fn().mockRejectedValue(new Error("Upload failed"))}
        error="Media settings need attention."
      />,
    );
    expect(screen.getByLabelText("Upload background image")).toHaveAttribute(
      "aria-label",
      "Upload background image",
    );
    expect(screen.getByLabelText("Upload slideshow images")).toHaveAttribute(
      "aria-label",
      "Upload slideshow images",
    );
    expect(screen.getByLabelText("Hero height: 320px")).toHaveAttribute("aria-invalid", "false");
    expect(screen.getByLabelText("Hero height: 320px")).not.toHaveAttribute("aria-describedby");
    expect(screen.getByLabelText("Background image description")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByLabelText("Slideshow image 1 description")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByLabelText("Crop horizontal position: 50%")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByLabelText("Crop vertical position: 50%")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByRole("checkbox")).not.toHaveAttribute("aria-describedby");
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent("Media settings need attention.");
    await user.upload(
      screen.getByLabelText("Upload background image"),
      new File(["image"], "bad.webp", { type: "image/webp" }),
    );
    expect(screen.getByRole("button", { name: "Replace background" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("-background-upload-error"),
    );
    expect(screen.getByLabelText("Upload background image")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Upload slideshow images")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByLabelText("Upload slideshow images")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Media settings need attention. Upload failed",
    );
  });

  it("scopes slideshow upload errors to the slideshow target", async () => {
    const user = userEvent.setup();
    render(
      <ProfileMediaEditor
        media={media}
        onChange={vi.fn()}
        onUpload={vi.fn().mockRejectedValue(new Error("Slideshow upload failed"))}
      />,
    );

    await user.upload(
      screen.getByLabelText("Upload slideshow images"),
      new File(["image"], "bad.webp", { type: "image/webp" }),
    );

    expect(screen.getByLabelText("Upload slideshow images")).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("-slideshow-upload-error"),
    );
    expect(screen.getByLabelText("Upload slideshow images")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Upload background image")).not.toHaveAttribute(
      "aria-describedby",
    );
    expect(screen.getByLabelText("Upload background image")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("alert")).toHaveTextContent("Slideshow upload failed");
  });

  it("removes the last media region without changing the caller object", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onlySlide = { ...media, background: undefined, slideshow: [media.slideshow[0]!] };
    render(<ProfileMediaEditor media={onlySlide} onChange={onChange} onUpload={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Remove slideshow image 1" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
    expect(onlySlide.slideshow).toHaveLength(1);
  });
});
