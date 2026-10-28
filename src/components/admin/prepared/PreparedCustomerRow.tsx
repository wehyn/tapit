"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip, StatusChip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { actionsForRow, rowPresentation } from "./selectors";
import type { PreparedRow } from "./types";
import { initials } from "./presentation";

export function PreparedCustomerRow({
  row,
  onEdit,
  onGenerate,
  onRevoke,
  onDelete,
  onLegacyRevoke,
  onLegacyReplace,
  onChangeRole,
  onApproveDeletion,
}: {
  row: PreparedRow;
  onEdit: () => void;
  onGenerate: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  onLegacyRevoke: () => void;
  onLegacyReplace: () => void;
  onChangeRole: (role: "customer" | "admin") => void;
  onApproveDeletion: () => void;
}) {
  const [now] = useState(() => Date.now());
  const days =
    row.linkExpiresAt === null ? 0 : Math.max(0, Math.ceil((row.linkExpiresAt - now) / 86400000));
  const prepared = row.kind === "prepared";
  const presentation = row.setupState === null ? null : rowPresentation[row.setupState];
  const actions = actionsForRow(row);
  const primaryActionNames: string[] = [
    "Edit",
    "Regenerate link",
    "Revoke",
    "Generate link",
    "Delete draft",
    "View profile",
    "View cards",
    "Open setup link",
  ];
  const primaryActions = actions.filter((action) => primaryActionNames.includes(action));
  const secondaryActions = actions.filter((action) => !primaryActionNames.includes(action));

  function renderAction(action: (typeof actions)[number]) {
    switch (action) {
      case "Edit":
        return (
          <Button key={action} onClick={onEdit} variant="quiet">
            Edit
          </Button>
        );
      case "Regenerate link":
        return (
          <Button key={action} onClick={onGenerate} variant="secondary">
            Regenerate link
          </Button>
        );
      case "Generate link":
        return (
          <Button key={action} onClick={onGenerate} variant="secondary">
            Generate link
          </Button>
        );
      case "Revoke":
        return (
          <Button key={action} onClick={onRevoke} variant="quiet">
            Revoke
          </Button>
        );
      case "Delete draft":
        return (
          <Button key={action} onClick={onDelete} variant="danger-soft">
            <Icon name="trash" size={17} />
            Delete draft
          </Button>
        );
      case "View profile":
        return (
          <ButtonLink key={action} href="/admin/profiles" variant="secondary">
            View profile
          </ButtonLink>
        );
      case "View cards":
        return (
          <ButtonLink key={action} href="/admin/cards" variant="secondary">
            View cards
          </ButtonLink>
        );
      case "Open setup link":
        return "setupToken" in row && row.setupToken ? (
          <ButtonLink key={action} href={"/setup/" + row.setupToken} variant="secondary">
            Open setup link
          </ButtonLink>
        ) : null;
      case "Revoke invitation":
        return (
          <Button key={action} onClick={onLegacyRevoke} variant="quiet">
            Revoke invitation
          </Button>
        );
      case "Replace invitation":
        return (
          <Button key={action} onClick={onLegacyReplace} variant="quiet">
            Replace invitation
          </Button>
        );
      case "Promote to administrator":
        return (
          <Button key={action} onClick={() => onChangeRole("admin")} variant="quiet">
            Promote to administrator
          </Button>
        );
      case "Demote to customer":
        return (
          <Button key={action} onClick={() => onChangeRole("customer")} variant="quiet">
            Demote to customer
          </Button>
        );
      case "Approve deletion":
        return (
          <Button key={action} onClick={onApproveDeletion} variant="danger">
            Approve deletion
          </Button>
        );
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3 sm:flex-1">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-tapit-accent-soft text-sm font-semibold text-tapit-accent-strong">
          {initials(row.profileName || row.email)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-tapit-ink">
            {row.profileName || row.email || "Prepared account"}
          </p>
          <p className="truncate text-sm text-tapit-muted">
            {row.email || "tapit.com/" + row.profileSlug}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {prepared ? (
              <>
                <Chip tone={row.setupState === "waiting" ? "warn" : "neutral"}>
                  {presentation?.chips[0]}
                </Chip>
                {row.setupState === "waiting" ? (
                  <Chip tone="warn">Link expires in {days} days</Chip>
                ) : (
                  <Chip>No active link</Chip>
                )}
              </>
            ) : row.setupState === "active" ? (
              <Chip tone="ok">Active</Chip>
            ) : (
              <StatusChip status={row.status ?? "invited"} />
            )}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:max-w-2xl sm:items-end">
        {!prepared ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold text-tapit-muted">Role</dt>
              <dd className="text-tapit-ink">{row.role}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-tapit-muted">Account</dt>
              <dd className="text-tapit-ink">{row.status ?? "active"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-tapit-muted">Deletion</dt>
              <dd className="text-tapit-ink">{row.deletionStatus ?? "active"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-tapit-muted">Profile</dt>
              <dd className="text-tapit-ink">{row.profileStatus ?? "Not created"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-tapit-muted">Cards</dt>
              <dd className="text-tapit-ink">{row.cardCount ?? 0}</dd>
            </div>
            {row.invitationStatus ? (
              <div>
                <dt className="text-xs font-semibold text-tapit-muted">Invitation</dt>
                <dd className="text-tapit-ink">{row.invitationStatus}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {primaryActions.map(renderAction)}
        </div>
        {secondaryActions.length ? (
          <details className="text-sm text-tapit-muted">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-tapit-muted">
              More actions
            </summary>
            <div className="flex flex-wrap gap-2 pt-2 sm:justify-end">
              {secondaryActions.map(renderAction)}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}
