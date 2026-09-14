"use client";

import { useMemo, useState } from "react";

import {
  aggregateAnalytics,
  getDemoProfileForSession,
  type AnalyticsRange,
  useDemoSession,
  useDemoState,
} from "@/lib/demo/store";

import { SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "lifetime", label: "Lifetime" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl border border-tapit-line bg-tapit-surface p-5">
      <dt className="text-sm font-semibold text-tapit-muted">{label}</dt>
      <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
        {value.toLocaleString()}
      </dd>
      <p className="mt-2 text-xs leading-5 text-tapit-muted">{detail}</p>
    </div>
  );
}

export function CustomerAnalytics() {
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range, profile.id),
    [profile.id, range, state.analytics],
  );
  const linkResults = profile.draft.links
    .map((link) => ({ ...link, clicks: totals.linkClicks[link.id] ?? 0 }))
    .sort((left, right) => right.clicks - left.clicks);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8">
      <Panel
        description="Aggregate activity for your profile only. Tapit does not expose visitor identities or raw visit history."
        title="Profile analytics"
      >
        <div className="mt-6 max-w-xs">
          <SelectField
            id="analytics-range"
            label="Time range"
            onChange={(event) => setRange(event.target.value as AnalyticsRange)}
            value={range}
          >
            {ranges.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </div>
      </Panel>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Metric detail="All profile entry paths" label="Profile views" value={totals.views} />
        <Metric
          detail="Privacy-preserving estimate"
          label="Unique views"
          value={totals.uniqueViews}
        />
        <Metric detail="Destination selections" label="Link clicks" value={totals.clicks} />
      </dl>

      {totals.views === 0 && totals.clicks === 0 ? (
        <Notice>
          No activity in this range yet. Share your profile or active card to begin collecting
          aggregate results.
        </Notice>
      ) : null}

      <Panel
        description="Clicks are grouped by the link label you chose. Disabled links remain visible here only when they have historical activity."
        title="Link results"
      >
        <div className="mt-6 overflow-hidden rounded-2xl border border-tapit-line">
          {linkResults.length === 0 ? (
            <div className="p-5 text-sm text-tapit-muted">
              Add links to see destination results.
            </div>
          ) : null}
          {linkResults.map((link) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-b border-tapit-line px-4 py-4 last:border-b-0 sm:px-5"
              key={link.id}
            >
              <div>
                <p className="font-semibold text-tapit-ink">{link.label || "Untitled link"}</p>
                <p className="mt-1 max-w-xl truncate text-xs text-tapit-muted">
                  {link.destination || "No destination yet"}
                </p>
              </div>
              <p className="text-sm font-semibold text-tapit-accent">
                {link.clicks.toLocaleString()} clicks
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        description="Views and clicks are stored as aggregate time buckets. There is no visitor-level history to inspect or export."
        title="Privacy note"
      >
        <p className="mt-5 text-sm leading-6 text-tapit-muted">
          These metrics are designed to answer how a profile is performing without identifying the
          people who viewed it.
        </p>
      </Panel>
    </div>
  );
}
