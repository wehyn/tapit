"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

import { useDemoState } from "@/lib/demo/store";

import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

export function AuditLog() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.audits
      .filter(
        (audit) =>
          !normalized ||
          `${audit.actor} ${audit.action} ${audit.target} ${audit.before ?? ""} ${audit.after ?? ""}`
            .toLowerCase()
            .includes(normalized),
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [query, state.audits]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Every administrator state transition records the actor, action, target, timestamp, and relevant before/after status."
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
      <Panel title="History">
        <div className="mt-5 grid gap-2">
          {filtered.length === 0 ? <Notice>No audit actions match this filter.</Notice> : null}
          {filtered.map((audit) => (
            <article
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-4 sm:p-5"
              key={audit.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-tapit-ink">{audit.action}</p>
                  <p className="mt-1 text-sm text-tapit-muted">
                    {audit.actor} · {audit.target}
                  </p>
                </div>
                <time className="text-xs text-tapit-muted" dateTime={audit.occurredAt}>
                  {new Date(audit.occurredAt).toLocaleString()}
                </time>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    Before
                  </dt>
                  <dd className="mt-1 break-words text-tapit-ink">
                    {audit.before ?? "Not recorded"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    After
                  </dt>
                  <dd className="mt-1 break-words text-tapit-ink">
                    {audit.after ?? "Not recorded"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
