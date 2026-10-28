import type { PreparedRow } from "./types";

export type PreparedFilter = "all" | "waiting" | "drafts" | "active";

export function filterPreparedRows(
  rows: PreparedRow[],
  filter: PreparedFilter,
  search: string,
): PreparedRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesFilter =
      filter === "all" || row.setupState === (filter === "drafts" ? "draft" : filter);
    return (
      matchesFilter &&
      (!query || `${row.profileName} ${row.email} ${row.profileSlug}`.toLowerCase().includes(query))
    );
  });
}

export const rowPresentation = {
  waiting: {
    chips: ["Waiting for user", "Expiry"],
  },
  draft: {
    chips: ["Unclaimed draft", "No active link"],
  },
  active: {
    chips: ["Active"],
  },
} as const;

export type CustomerAction =
  | "Edit"
  | "Regenerate link"
  | "Revoke"
  | "Generate link"
  | "Delete draft"
  | "View profile"
  | "View cards"
  | "Open setup link"
  | "Revoke invitation"
  | "Replace invitation"
  | "Promote to administrator"
  | "Demote to customer"
  | "Grant owner access"
  | "Revoke owner access"
  | "Approve deletion";

export function actionsForRow(row: PreparedRow): CustomerAction[] {
  if (row.setupState === null) {
    if (row.status !== "invited") return [];
    return [
      ...(row.setupToken ? ["Open setup link" as const] : []),
      ...(row.invitationId && row.invitationStatus === "pending"
        ? ["Revoke invitation" as const]
        : []),
      ...(row.email ? ["Replace invitation" as const] : []),
    ];
  }
  switch (row.setupState) {
    case "waiting":
      return ["Edit", "Regenerate link", "Revoke"];
    case "draft":
      return ["Edit", "Generate link", "Delete draft"];
    case "active":
      return [
        ...(row.profileSlug ? ["View profile" as const] : []),
        ...(row.profileStatus !== null ? ["View cards" as const] : []),
        ...(row.setupToken ? ["Open setup link" as const] : []),
        ...(row.legacyInvitationActive
          ? ["Revoke invitation" as const, "Replace invitation" as const]
          : []),
        ...(row.status === "active"
          ? [
              row.role === "customer"
                ? ("Promote to administrator" as const)
                : ("Demote to customer" as const),
            ]
          : []),
        ...(row.status === "active" && row.deletionStatus === "active" && row.role === "customer"
          ? [
              row.cardOwnerAccessOverride
                ? ("Revoke owner access" as const)
                : ("Grant owner access" as const),
            ]
          : []),
        ...(row.hasDeletionRequest ? ["Approve deletion" as const] : []),
      ];
  }
}
