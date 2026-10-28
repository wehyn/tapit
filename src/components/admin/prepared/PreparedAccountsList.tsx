"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { PreparedCustomerRow } from "./PreparedCustomerRow";
import { CopyButton } from "./CopyButton";
import type { PreparedFilter } from "./selectors";
import type { PreparedRow } from "./types";

export function PreparedAccountsList({
  rows,
  filter,
  search,
  loading,
  notice,
  onFilter,
  onSearch,
  onStart,
  onEdit,
  onGenerate,
  onRevoke,
  onDelete,
  onLegacyRevoke,
  onLegacyReplace,
  onChangeRole,
  onOwnerAccess,
  onApproveDeletion,
  legacySetupLink,
}: {
  rows: PreparedRow[];
  filter: PreparedFilter;
  search: string;
  loading: boolean;
  notice: { tone: "success" | "error"; text: string } | null;
  onFilter: (filter: PreparedFilter) => void;
  onSearch: (search: string) => void;
  onStart: () => void;
  onEdit: (row: PreparedRow) => void;
  onGenerate: (row: PreparedRow) => void;
  onRevoke: (row: PreparedRow) => void;
  onDelete: (row: PreparedRow) => void;
  onLegacyRevoke: (row: PreparedRow) => void;
  onLegacyReplace: (row: PreparedRow) => void;
  onChangeRole: (
    row: Extract<PreparedRow, { setupState: "active" }>,
    role: "customer" | "admin",
  ) => void;
  onOwnerAccess: (row: Extract<PreparedRow, { setupState: "active" }>, enabled: boolean) => void;
  onApproveDeletion: (row: Extract<PreparedRow, { setupState: "active" }>) => void;
  legacySetupLink: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6 pt-2">
      <AdminPageHeader description="Manage accounts and prepared handoffs." title="Customers" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button onClick={onStart}>
          <Icon name="plus" size={18} />
          Set up for someone
        </Button>
        <div className="max-w-full overflow-x-auto">
          <Segmented
            label="Filter customers"
            value={filter}
            onChange={onFilter}
            options={[
              { label: "All", value: "all" },
              { label: "Waiting", value: "waiting" },
              { label: "Drafts", value: "drafts" },
              { label: "Active", value: "active" },
            ]}
          />
        </div>
      </div>
      <div className="max-w-md">
        <Field
          id="prepared-search"
          label="Search customers"
          placeholder="Search name, email or slug"
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {legacySetupLink ? (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
          <a className="break-all font-semibold text-tapit-accent-strong" href={legacySetupLink}>
            {legacySetupLink}
          </a>
          <CopyButton text={legacySetupLink} label="Copy setup link" />
        </div>
      ) : null}
      {loading ? (
        <Notice>Loading customer handoffs…</Notice>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.length ? (
            rows.map((row) => (
              <PreparedCustomerRow
                key={row.id}
                row={row}
                onEdit={() => onEdit(row)}
                onGenerate={() => onGenerate(row)}
                onRevoke={() => onRevoke(row)}
                onDelete={() => onDelete(row)}
                onLegacyRevoke={() => onLegacyRevoke(row)}
                onLegacyReplace={() => onLegacyReplace(row)}
                onChangeRole={(role) => row.setupState === "active" && onChangeRole(row, role)}
                onOwnerAccess={(enabled) =>
                  row.setupState === "active" && onOwnerAccess(row, enabled)
                }
                onApproveDeletion={() => row.setupState === "active" && onApproveDeletion(row)}
              />
            ))
          ) : (
            <Notice>No customer accounts match this search.</Notice>
          )}
        </div>
      )}
    </div>
  );
}
