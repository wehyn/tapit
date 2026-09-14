"use client";

import { useMemo, useState } from "react";

import { useDemoState } from "@/lib/demo/store";

import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

export function AuditLog() {
  const state = useDemoState();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return state.audits.filter(
      (audit) =>
        !normalized ||
        `${audit.actor} ${audit.action} ${audit.target} ${audit.before ?? ""} ${audit.after ?? ""}`
          .toLowerCase()
          .includes(normalized),
    );
  }, [query, state.audits]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8">
      <Panel
        description="Every administrator state transition records the actor, action, target, timestamp, and relevant before/after status."
        title="Audit log"
      >
        <div className="mt-6 max-w-lg">
          <Field
            id="audit-search"
            label="Search audit entries"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actor, action, or target"
            type="search"
            value={query}
          />
        </div>
      </Panel>
      <Panel title="History">
        <div className="mt-5 grid gap-3">
          {filtered.length === 0 ? <Notice>No audit actions match this filter.</Notice> : null}
          {filtered.map((audit) => (
            <article
              className="rounded-2xl border border-tapit-line bg-tapit-paper p-4 sm:p-5"
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
                  <dd className="mt-1 break-words text-tapit-ink">{audit.before ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
                    After
                  </dt>
                  <dd className="mt-1 break-words text-tapit-ink">{audit.after ?? "—"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
