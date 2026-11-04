"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PreparedCustomerDrawer, type PreparedRowHandlers } from "./PreparedCustomerDrawer";
import {
  RowAvatar,
  RowStatus,
  rowCardCount,
  rowContact,
  rowName,
  rowRole,
} from "./PreparedRowParts";
import type { PreparedRow } from "./types";

// Shared with the column header in PreparedAccountsList so the two stay aligned. The phone status
// track is capped so several chips wrap instead of squeezing the name column to nothing.
export const customerColumns =
  "grid-cols-[minmax(0,1fr)_fit-content(45%)] md:grid-cols-[minmax(0,2.2fr)_9rem_5.5rem_3rem_1.25rem]";

export function PreparedCustomerRow({
  row,
  ...handlers
}: { row: PreparedRow } & PreparedRowHandlers) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`relative grid items-center gap-x-4 gap-y-2 rounded-control px-4 py-3 hover:bg-tapit-soft-surface has-focus-visible:bg-tapit-soft-surface ${customerColumns}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <RowAvatar className="size-10" row={row} />
        <div className="min-w-0">
          <button
            aria-haspopup="dialog"
            className="block min-h-0 max-w-full cursor-pointer truncate text-left font-semibold text-tapit-ink after:absolute after:inset-0"
            onClick={(event) => {
              // Safari does not focus buttons on click, and the drawer restores focus here on close.
              event.currentTarget.focus();
              setOpen(true);
            }}
            type="button"
          >
            {rowName(row)}
          </button>
          <p className="truncate text-sm text-tapit-muted">{rowContact(row)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1 md:justify-start">
        <RowStatus row={row} />
      </div>
      <p className="hidden text-sm capitalize text-tapit-muted md:block">
        <span className="sr-only">Role: </span>
        {rowRole(row)}
      </p>
      <p className="hidden text-sm text-tapit-muted md:block">
        <span className="sr-only">Cards: </span>
        {rowCardCount(row)}
      </p>
      <Icon className="hidden text-tapit-muted md:block" name="caretRight" size={18} />
      <PreparedCustomerDrawer {...handlers} onClose={() => setOpen(false)} open={open} row={row} />
    </li>
  );
}
