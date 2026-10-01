"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

import { useDemoState } from "@/lib/demo/store";

import { Field } from "@/components/ui/Field";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  target?: string;
  targetAccountEmail?: string;
  occurredAt: string | number;
  before?: string;
  after?: string;
};

type AuditChange = {
  field: string;
  before: string;
  after: string;
};

const readableActions: Record<string, string> = {
  "account.deletion_approved": "Account deletion approved",
  "account.deletion_requested": "Account deletion requested",
  "account.erased": "Customer account deleted",
  "account.pending_deleted": "Pending account deleted",
  "auth.google_account_provisioned": "Google account created",
  "auth.google_account_restarted": "Account setup restarted",
  "card.assigned": "Card assigned to profile",
  "card.attached": "Card attached to profile",
  "card.claim_code_generated": "Card claim code generated",
  "card.claim_code_invalidated": "Card claim code deactivated",
  "card.claimed": "Card claimed by customer",
  "card.deactivated": "Card deactivated",
  "card.registered": "Card registered",
  "card.replaced": "Card replaced",
  "customer.created": "Customer account created",
  "customer.onboarding_completed": "Customer onboarding completed",
  "customer.password_reset_requested": "Password reset requested",
  "customer.role_changed": "Customer role changed",
  "customer.self_service_created": "Customer account created",
  "customer.setup_completed": "Customer setup completed",
  "customer.setup_resent": "Customer setup link resent",
  "invitation.accepted": "Customer invitation accepted",
  "invitation.replaced": "Customer invitation link replaced",
  "invitation.revoked": "Customer invitation revoked",
  "profile.draft_updated": "Profile draft updated",
  "profile.links_updated": "Profile links updated",
  "profile.media_uploaded": "Profile media uploaded",
  "profile.photo_removed": "Profile photo removed",
  "profile.photo_uploaded": "Profile photo uploaded",
  "profile.published": "Profile published",
  "profile.slug_changed": "Profile slug changed",
  "profile.suspended": "Profile suspended",
  "profile.unpublished": "Profile unpublished",
  "profile.updated": "Profile updated",
  "settings.support_updated": "Support contact updated",
};

const changeFieldLabels: Record<string, string> = {
  deletionStatus: "Deletion status",
  links: "Profile links",
  role: "Account role",
  slug: "Profile slug",
  status: "Account status",
};

const hiddenAuditFields = /(?:id|token|secret|password|hash)$/i;
const hiddenAuditDateFields = new Set([
  "acceptedAt",
  "createdAt",
  "deletedAt",
  "expiresAt",
  "invalidatedAt",
]);

export function readableAuditAction(action: string): string {
  return (
    readableActions[action] ??
    action.replaceAll(/[._]/g, " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function displayFieldName(key: string): string {
  return (
    changeFieldLabels[key] ??
    key.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

function displayAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(String).join(", ");
  const normalized = String(value);
  if (key === "role") {
    if (normalized === "admin") return "Administrator";
    if (normalized === "customer") return "Customer";
  }
  if (key === "deletionStatus") {
    const deletionLabels: Record<string, string> = {
      active: "No deletion requested",
      requested: "Deletion requested",
    };
    return deletionLabels[normalized] ?? normalized;
  }
  if (key === "status") {
    const statusLabels: Record<string, string> = {
      active: "Active",
      claimable: "Ready to claim",
      deleted: "Deleted",
      draft: "Draft",
      inactive: "Inactive",
      pending: "Pending",
      published: "Published",
      registered: "Registered",
      replaced: "Replaced",
      requested: "Deletion requested",
      suspended: "Suspended",
    };
    return statusLabels[normalized] ?? normalized;
  }
  return normalized;
}

function parseAuditValue(value: string | undefined): { structured: boolean; value: unknown } {
  if (value === undefined) return { structured: false, value: undefined };
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { structured: true, value: parsed };
    }
    return { structured: false, value: parsed };
  } catch {
    return { structured: false, value };
  }
}

function getAuditChanges(action: string, before?: string, after?: string): AuditChange[] {
  const beforeData = parseAuditValue(before);
  const afterData = parseAuditValue(after);

  if (beforeData.structured || afterData.structured) {
    const beforeFields = beforeData.structured ? (beforeData.value as Record<string, unknown>) : {};
    const afterFields = afterData.structured ? (afterData.value as Record<string, unknown>) : {};
    const keys = [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])].filter(
      (key) => !hiddenAuditFields.test(key) && !hiddenAuditDateFields.has(key),
    );
    return keys.map((key) => ({
      field: displayFieldName(key),
      before: displayAuditValue(key, beforeFields[key]),
      after: displayAuditValue(key, afterFields[key]),
    }));
  }

  if (beforeData.value === undefined && afterData.value === undefined) return [];
  const scalarChange = /role/i.test(action)
    ? { field: "Account role", valueKey: "role" }
    : /^profile\./i.test(action) && /slug/i.test(action)
      ? { field: "Profile slug", valueKey: "slug" }
      : /^profile\./i.test(action) && /status|suspend|publish/i.test(action)
        ? { field: "Profile status", valueKey: "status" }
        : /^card\./i.test(action)
          ? { field: "Card status", valueKey: "status" }
          : /status/i.test(action)
            ? { field: "Account status", valueKey: "status" }
            : /link/i.test(action)
              ? { field: "Profile links", valueKey: "links" }
              : /support/i.test(action)
                ? { field: "Support contact", valueKey: "supportUrl" }
                : { field: "Change", valueKey: "" };
  return [
    {
      field: scalarChange.field,
      before: displayAuditValue(scalarChange.valueKey, beforeData.value),
      after: displayAuditValue(scalarChange.valueKey, afterData.value),
    },
  ];
}

function AuditHistoryEntry({ entry }: { entry: AuditEntry }) {
  const [isOpen, setIsOpen] = useState(false);
  const occurredAt = new Date(entry.occurredAt);
  const changes = getAuditChanges(entry.action, entry.before, entry.after);
  return (
    <details
      className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 shadow-[0_1px_3px_rgba(16,33,28,0.035)] sm:p-5"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="grid cursor-pointer list-none grid-cols-1 gap-3 rounded-tapit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tapit-accent sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <span className="min-w-0">
          <span className="block font-semibold text-tapit-ink">
            {readableAuditAction(entry.action)}
          </span>
          <span className="mt-1 block text-sm text-tapit-muted">
            By {entry.actor}
            {entry.targetAccountEmail
              ? ` · Account: ${entry.targetAccountEmail}`
              : entry.target
                ? ` · ${entry.target}`
                : ""}
          </span>
        </span>
        <span className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
          <time
            className="rounded-full bg-tapit-paper px-3 py-1.5 text-xs font-medium text-tapit-muted"
            dateTime={occurredAt.toISOString()}
          >
            {occurredAt.toLocaleString()}
          </time>
          <span className="text-xs font-semibold text-tapit-accent">
            {isOpen ? "Hide details" : "View details"}
          </span>
        </span>
      </summary>
      <div className="mt-4 border-t border-tapit-line pt-4">
        {changes.length === 0 ? (
          <p className="text-sm text-tapit-muted">No additional details were recorded.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {changes.map((change) => (
              <div key={change.field}>
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                  {change.field}
                </dt>
                <dd className="mt-1 break-words text-tapit-ink">
                  {change.before} <span className="px-1 text-tapit-muted">→</span> {change.after}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </details>
  );
}

function AuditHistory({ entries }: { entries: AuditEntry[] }) {
  return (
    <Panel title="History">
      <div className="mt-5 grid gap-2">
        {entries.length === 0 ? (
          <Notice>No audit actions match this filter.</Notice>
        ) : (
          entries.map((entry) => <AuditHistoryEntry entry={entry} key={entry.id} />)
        )}
      </div>
    </Panel>
  );
}

function DemoAuditLog() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.audits
      .filter(
        (audit) =>
          !normalized ||
          `${audit.actor} ${audit.targetAccountEmail ?? ""} ${audit.action} ${audit.target} ${audit.before ?? ""} ${audit.after ?? ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [query, state.audits]);

  const entries: AuditEntry[] = filtered.map((audit) => ({
    id: audit.id,
    action: audit.action,
    actor: audit.actor,
    target: audit.target,
    occurredAt: audit.occurredAt,
    before: audit.before,
    after: audit.after,
    targetAccountEmail: audit.targetAccountEmail,
  }));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <AdminPageHeader
        description="Review who changed account, profile, card, and operational settings."
        title="Audit log"
      />
      <Panel
        description="See who made each change and which account it affected. Open an entry for details."
        title="Audit log"
      >
        <div className="mt-6 flex items-end gap-3">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="mb-3 hidden text-tapit-muted sm:block"
            size={22}
          />
          <div className="max-w-lg flex-1">
            <Field
              id="audit-search"
              label="Search audit entries"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, action, or target"
              type="search"
              value={query}
            />
          </div>
        </div>
      </Panel>
      <AuditHistory entries={entries} />
    </div>
  );
}

function LiveAuditLog() {
  const [search, setSearch] = useState("");
  const audits = useQuery(api.audit.list, { search: search.trim() || undefined });
  if (audits === undefined)
    return (
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-8">
        <AdminPageHeader
          description="Review who changed account, profile, card, and operational settings."
          title="Audit log"
        />
        <Notice>Loading audit history…</Notice>
      </div>
    );

  const entries: AuditEntry[] = audits.map((audit) => ({
    id: audit._id,
    action: audit.action,
    actor: audit.actorLabel,
    occurredAt: audit.occurredAt,
    before: audit.before,
    after: audit.after,
    targetAccountEmail: audit.targetAccountEmail,
  }));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <AdminPageHeader
        description="Review who changed account, profile, card, and operational settings."
        title="Audit log"
      />
      <Panel
        description="See who made each change and which account it affected. Open an entry for details."
        title="Audit log"
      >
        <div className="mt-6 max-w-lg">
          <Field
            id="audit-search"
            label="Search audit entries"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actor, action, or status"
            type="search"
            value={search}
          />
        </div>
      </Panel>
      <AuditHistory entries={entries} />
    </div>
  );
}

export function AuditLog() {
  return !isLocalDemoMode() ? <LiveAuditLog /> : <DemoAuditLog />;
}
