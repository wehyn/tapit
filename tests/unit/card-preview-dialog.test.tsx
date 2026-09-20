import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CardPreviewDialog } from "@/components/card-builder/CardPreviewDialog";
import type { CardDesignPreview } from "@/lib/card-design";

const file: CardDesignPreview = {
  name: "studio-card.png",
  size: 2048,
  url: "blob:http://localhost/card-preview",
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof CardPreviewDialog>> = {}) {
  return render(
    <CardPreviewDialog
      file={file}
      onChooseAnother={vi.fn()}
      onClose={vi.fn()}
      onOrder={vi.fn()}
      orderingComingSoon={false}
      {...overrides}
    />,
  );
}

describe("CardPreviewDialog", () => {
  it("renders an accessible dialog with the approved content and image", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Looks good?" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Looks good?" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Preview of studio-card.png" })).toHaveAttribute(
      "src",
      file.url,
    );
    expect(screen.getByRole("button", { name: "Order a card now" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Choose another design" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close card preview" })).toBeVisible();
  });

  it("closes from the close button or Escape and restores focus on unmount", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.type = "button";
    document.body.append(trigger);
    trigger.focus();
    const view = renderDialog({ onClose });

    expect(screen.getByRole("dialog")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Close card preview" }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("traps forward and reverse focus from the dialog root and its boundaries", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    const first = screen.getByRole("button", { name: "Close card preview" });
    const last = screen.getByRole("button", { name: "Choose another design" });

    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();
    dialog.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("pulls forward and reverse focus into the dialog from outside", () => {
    const outside = document.createElement("button");
    outside.type = "button";
    document.body.append(outside);
    renderDialog();

    const first = screen.getByRole("button", { name: "Close card preview" });
    const last = screen.getByRole("button", { name: "Choose another design" });

    outside.focus();
    fireEvent.keyDown(outside, { key: "Tab" });
    expect(first).toHaveFocus();
    outside.focus();
    fireEvent.keyDown(outside, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    outside.remove();
  });

  it("uses the latest Escape callback after rerender", () => {
    const initialOnClose = vi.fn();
    const replacementOnClose = vi.fn();
    const view = renderDialog({ onClose: initialOnClose });

    view.rerender(
      <CardPreviewDialog
        file={file}
        onChooseAnother={vi.fn()}
        onClose={replacementOnClose}
        onOrder={vi.fn()}
        orderingComingSoon={false}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });

    expect(initialOnClose).not.toHaveBeenCalled();
    expect(replacementOnClose).toHaveBeenCalledOnce();
  });

  it("keeps both actions available and announces when ordering is coming soon", () => {
    const onChooseAnother = vi.fn();
    const onOrder = vi.fn();

    renderDialog({ orderingComingSoon: true, onChooseAnother, onOrder });

    expect(screen.getByRole("status")).toHaveTextContent("Ordering is coming soon");
    fireEvent.click(screen.getByRole("button", { name: "Order a card now" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose another design" }));
    expect(onOrder).toHaveBeenCalledOnce();
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });
});
