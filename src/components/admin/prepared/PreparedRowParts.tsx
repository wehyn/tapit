import { Chip, StatusChip } from "@/components/ui/Chip";
import { initials } from "./presentation";
import { rowPresentation } from "./selectors";
import type { PreparedRow } from "./types";

export function rowName(row: PreparedRow) {
  return row.profileName || row.email || "Prepared account";
}

export function rowContact(row: PreparedRow) {
  return row.email || "tapit.com/" + row.profileSlug;
}

export function rowRole(row: PreparedRow) {
  return row.kind === "prepared" ? "customer" : row.role;
}

export function rowCardCount(row: PreparedRow) {
  return row.kind === "prepared" ? 0 : row.cardCount;
}

export function RowAvatar({ className, row }: { className: string; row: PreparedRow }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-tapit-accent-soft text-sm font-semibold text-tapit-accent-strong ${className}`}
    >
      {initials(row.profileName || row.email)}
    </span>
  );
}

export function RowStatus({ row }: { row: PreparedRow }) {
  if (row.kind === "prepared") {
    return (
      <Chip tone={row.setupState === "waiting" ? "warn" : "neutral"}>
        {rowPresentation[row.setupState].chips[0]}
      </Chip>
    );
  }
  if (row.setupState === "active") {
    return (
      <>
        <Chip tone="ok">Active</Chip>
        {row.isDemo ? <StatusChip status="Demo" /> : null}
        {row.hasDeletionRequest ? <Chip tone="warn">Deletion requested</Chip> : null}
      </>
    );
  }
  return <StatusChip status={row.status} />;
}
