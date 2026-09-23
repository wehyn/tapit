import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";

const file = new File([new Uint8Array([1, 2, 3])], "profile.jpg", { type: "image/jpeg" });

describe("ProfileImageCropDialog", () => {
  it("applies the selected crop and supports keyboard movement", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<ProfileImageCropDialog file={file} onApply={onApply} onCancel={vi.fn()} />);

    const viewport = screen.getByRole("application", { name: "Crop profile photo" });
    const image = await screen.findByRole("img", { name: "Profile photo crop preview" });
    Object.defineProperty(image, "naturalWidth", { value: 600, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 400, configurable: true });
    fireEvent.load(image);
    fireEvent.keyDown(viewport, { key: "ArrowRight" });
    await user.click(screen.getByRole("button", { name: "Apply crop" }));

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({ x: 101, y: 0, size: 400 });
  });

  it("cancels without applying the crop", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(<ProfileImageCropDialog file={file} onApply={onApply} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("cannot cancel or reapply while export or upload is busy", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onCancel = vi.fn();

    render(<ProfileImageCropDialog busy file={file} onApply={onApply} onCancel={onCancel} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply crop" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("keeps a square crop viewport, round final preview, and source-pixel drag scale", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(<ProfileImageCropDialog file={file} onApply={onApply} onCancel={vi.fn()} />);
    const viewport = screen.getByRole("application", { name: "Crop profile photo" });
    const image = await screen.findByRole("img", { name: "Profile photo crop preview" });
    Object.defineProperty(image, "naturalWidth", { value: 1200, configurable: true });
    Object.defineProperty(image, "naturalHeight", { value: 800, configurable: true });
    fireEvent.load(image);
    expect(viewport.className).not.toContain("rounded-full");
    expect(image.className).toContain("rounded-full");

    fireEvent.mouseDown(viewport, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(viewport, { clientX: 72, clientY: 100 });
    fireEvent.mouseUp(viewport);
    const apply = screen.getByRole("button", { name: "Apply crop" });
    expect(apply).not.toBeDisabled();
    await user.click(apply);

    expect(onApply).toHaveBeenCalledWith({ x: 280, y: 0, size: 800 });
  });
});
