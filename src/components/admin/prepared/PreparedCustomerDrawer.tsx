"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import {
  RowAvatar,
  RowStatus,
  rowCardCount,
  rowContact,
  rowName,
  rowRole,
} from "./PreparedRowParts";
import { actionsForRow, splitActions, type CustomerAction } from "./selectors";
import type { PreparedRow } from "./types";

export type PreparedRowHandlers = {
  onEdit: () => void;
  onGenerate: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onLegacyRevoke: () => void;
  onLegacyReplace: () => void;
  onChangeRole: (role: "customer" | "admin") => void;
  onOwnerAccess: (enabled: boolean) => void;
  onPromoteToDemo: () => void;
  onApproveDeletion: () => void;
};

type ActionSpec =
  { href: string } | { onSelect: () => void; danger?: "soft" | "solid"; icon?: IconName };

type ButtonVariant = NonNullable<ComponentProps<typeof Button>["variant"]>;

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-tapit-muted">{label}</dt>
      <dd className="break-words text-tapit-ink first-letter:uppercase">{value}</dd>
    </div>
  );
}

export function PreparedCustomerDrawer({
  open,
  onClose,
  row,
  ...handlers
}: {
  open: boolean;
  onClose: () => void;
  row: PreparedRow;
} & PreparedRowHandlers) {
  const titleId = useId();
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);
  const pressedBackdrop = useRef(false);
  const [now] = useState(() => Date.now());
  if (!open) return null;

  const days =
    row.linkExpiresAt === null ? 0 : Math.max(0, Math.ceil((row.linkExpiresAt - now) / 86400000));
  const { primary, manage } = splitActions(actionsForRow(row));

  function specFor(action: CustomerAction): ActionSpec | null {
    switch (action) {
      case "Edit":
        return { onSelect: handlers.onEdit };
      case "Regenerate link":
      case "Generate link":
        return { onSelect: handlers.onGenerate };
      case "Revoke":
        return { onSelect: handlers.onRevoke };
      case "Delete draft":
        return { onSelect: handlers.onDelete, danger: "soft", icon: "trash" };
      case "View profile":
        return { href: "/admin/profiles" };
      case "View cards":
        return { href: "/admin/cards" };
      case "Open setup link":
        return "setupToken" in row && row.setupToken ? { href: "/setup/" + row.setupToken } : null;
      case "Revoke invitation":
        return { onSelect: handlers.onLegacyRevoke };
      case "Replace invitation":
        return { onSelect: handlers.onLegacyReplace };
      case "Promote to Demo":
        return { onSelect: handlers.onPromoteToDemo };
      case "Promote to Administrator":
        return { onSelect: () => handlers.onChangeRole("admin") };
      case "Demote to customer":
        return { onSelect: () => handlers.onChangeRole("customer") };
      case "Grant owner access":
      case "Revoke owner access":
        return { onSelect: () => handlers.onOwnerAccess(action === "Grant owner access") };
      case "Approve deletion":
        return { onSelect: handlers.onApproveDeletion, danger: "solid" };
    }
  }

  // Every action closes the drawer first so confirm dialogs and navigation never stack on it.
  function renderAction(action: CustomerAction, variant: ButtonVariant, className = "") {
    const spec = specFor(action);
    if (spec === null) return null;
    if ("href" in spec) {
      return (
        <ButtonLink
          className={className}
          href={spec.href}
          key={action}
          onClick={onClose}
          variant={variant}
        >
          {action}
        </ButtonLink>
      );
    }
    const danger =
      spec.danger === "solid" ? "danger" : spec.danger === "soft" ? "danger-soft" : null;
    return (
      <Button
        className={className}
        key={action}
        onClick={() => {
          onClose();
          spec.onSelect();
        }}
        type="button"
        variant={danger ?? variant}
      >
        {spec.icon ? <Icon name={spec.icon} size={17} /> : null}
        {action}
      </Button>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end bg-tapit-ink/45"
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      onMouseDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-full w-full max-w-md flex-col gap-6 overflow-y-auto overscroll-contain bg-tapit-surface p-6 shadow-card sm:rounded-l-card"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start gap-3">
          <RowAvatar className="size-12" row={row} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-semibold text-tapit-ink" id={titleId}>
              {rowName(row)}
            </h2>
            <p className="break-words text-sm text-tapit-muted">{rowContact(row)}</p>
          </div>
          <Button
            aria-label="Close"
            className="size-11 shrink-0 px-0"
            onClick={onClose}
            type="button"
            variant="quiet"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <RowStatus row={row} />
          {row.kind === "prepared" ? (
            row.setupState === "waiting" ? (
              <Chip tone="warn">Link expires in {days} days</Chip>
            ) : (
              <Chip>No active link</Chip>
            )
          ) : null}
        </div>
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tapit-muted">
            Details
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-control bg-tapit-soft-surface p-4 text-sm">
            {row.kind === "prepared" ? (
              <Detail label="Profile URL" value={rowContact(row)} />
            ) : (
              <>
                <Detail label="Role" value={rowRole(row)} />
                <Detail label="Account" value={row.status} />
                <Detail label="Profile" value={row.profileStatus ?? "Not created"} />
                <Detail label="Cards" value={rowCardCount(row)} />
                {row.setupState === "active" && row.role === "customer" ? (
                  <Detail
                    label="Owner access override"
                    value={row.cardOwnerAccessOverride ? "Granted" : "Not granted"}
                  />
                ) : null}
                <Detail label="Deletion" value={row.deletionStatus} />
                {row.invitationStatus ? (
                  <Detail label="Invitation" value={row.invitationStatus} />
                ) : null}
              </>
            )}
          </dl>
        </section>
        {primary.length ? (
          <div className="flex flex-wrap gap-2">
            {primary.map((action, index) =>
              renderAction(action, index === 0 ? "primary" : "secondary"),
            )}
          </div>
        ) : null}
        {manage.length ? (
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tapit-muted">
              Manage account
            </h3>
            <div className="flex flex-col gap-1">
              {manage.map((action) => renderAction(action, "quiet", "w-full justify-start"))}
            </div>
          </section>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
