"use client";

import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Icon } from "@/components/ui/Icon";
import {
  PROFILE_LAYOUT_BLOCKS,
  type ProfileLayoutBlock,
  type ProfileLayoutOrder,
} from "@/lib/profile-customization";

const labels: Record<ProfileLayoutBlock, string> = {
  slideshow: "Slideshow",
  links: "Links (including featured link)",
  section: "About/Services",
};

function reorder(
  order: ProfileLayoutOrder,
  block: ProfileLayoutBlock,
  targetIndex: number,
): ProfileLayoutOrder {
  const fromIndex = order.indexOf(block);
  if (
    fromIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= order.length ||
    fromIndex === targetIndex
  ) {
    return order;
  }
  const next = [...order];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return order;
  next.splice(targetIndex, 0, moved);
  return next;
}

export function ProfileLayoutOrderEditor({
  value,
  onChange,
  error,
}: {
  barePanels?: boolean;
  value: ProfileLayoutOrder;
  onChange: (next: ProfileLayoutOrder) => void;
  error?: string;
}) {
  const errorId = useId();
  const [dragging, setDragging] = useState<ProfileLayoutBlock | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function move(block: ProfileLayoutBlock, targetIndex: number) {
    const next = reorder(value, block, targetIndex);
    if (next === value) return;
    onChange(next);
    const position = next.indexOf(block) + 1;
    setAnnouncement(`${labels[block]} moved to position ${position} of ${next.length}.`);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLSpanElement>, block: ProfileLayoutBlock) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(block);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (dragging === null || (event.buttons !== 1 && event.pointerType !== "touch")) return;
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-layout-order-block]");
    const target = row?.dataset.layoutOrderBlock;
    if (target && PROFILE_LAYOUT_BLOCKS.includes(target as ProfileLayoutBlock)) {
      move(dragging, value.indexOf(target as ProfileLayoutBlock));
    }
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(null);
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-tapit-ink">Content order</legend>
      <p className="text-sm text-tapit-muted">
        Drag rows to reorder them, or use the Move up and Move down buttons.
      </p>
      <ol className="grid gap-2" aria-describedby={error ? errorId : undefined}>
        {value.map((block, index) => (
          <li
            key={block}
            data-layout-order-block={block}
            aria-posinset={index + 1}
            aria-setsize={value.length}
            aria-roledescription="sortable row"
            className={`flex min-h-14 items-center gap-3 rounded-control px-4 py-3 transition-colors ${dragging === block ? "bg-tapit-accent-soft" : "bg-tapit-soft-surface"}`}
          >
            <span
              aria-hidden="true"
              title="Drag to reorder"
              onPointerDown={(event) => handlePointerDown(event, block)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointerDrag}
              onPointerCancel={finishPointerDrag}
              className="flex size-10 shrink-0 touch-none cursor-grab items-center justify-center rounded-control text-tapit-muted active:cursor-grabbing"
            >
              <Icon className="size-5" name="dragHandle" weight="bold" />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-tapit-ink">
              {labels[block]}
            </span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                aria-label={`Move ${labels[block]} up`}
                disabled={index === 0}
                onClick={() => move(block, index - 1)}
                className="grid size-10 place-items-center rounded-control text-tapit-muted transition-colors hover:bg-tapit-surface hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon className="size-4" name="arrowUp" weight="bold" />
              </button>
              <button
                type="button"
                aria-label={`Move ${labels[block]} down`}
                disabled={index === value.length - 1}
                onClick={() => move(block, index + 1)}
                className="grid size-10 place-items-center rounded-control text-tapit-muted transition-colors hover:bg-tapit-surface hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Icon className="size-4" name="arrowDown" weight="bold" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {error ? (
        <p id={errorId} className="text-sm text-tapit-danger" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </fieldset>
  );
}
