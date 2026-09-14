"use client";

import { useMemo, useState } from "react";
import { ChartLineIcon, ShieldCheckIcon, TrendUpIcon } from "@phosphor-icons/react";

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
    <div className="border-l border-tapit-line pl-4 first:border-l-0 first:pl-0 sm:pl-5">
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
  const [now] = useState(() => Date.now());
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range, profile.id),
    [profile.id, range, state.analytics],
  );
  const trend = useMemo(() => {
    const days = range === "lifetime" ? Number.POSITIVE_INFINITY : Number(range.slice(0, -1));
    const cutoff = Number.isFinite(days) ? now - days * 24 * 60 * 60 * 1000 : 0;
    return state.analytics
      .filter((bucket) => bucket.profileId === profile.id && bucket.bucketStart >= cutoff)
      .sort((left, right) => left.bucketStart - right.bucketStart);
  }, [now, profile.id, range, state.analytics]);
  const peak = Math.max(1, ...trend.map((bucket) => bucket.views + bucket.clicks));
  const linkResults = profile.draft.links
    .map((link) => ({ ...link, clicks: totals.linkClicks[link.id] ?? 0 }))
    .sort((left, right) => right.clicks - left.clicks);

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 pb-12 pt-5 sm:px-8 lg:gap-8 lg:px-10 lg:pt-8">
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

      <Panel
        description="Each column is one aggregate time bucket. Views and clicks are shown together to make momentum easy to read."
        title="Engagement trend"
      >
        <div className="mt-6 flex items-center gap-2 text-sm text-tapit-muted">
          <ChartLineIcon aria-hidden="true" size={18} weight="bold" />
          {trend.length > 0
            ? `${trend.length} aggregate buckets in this range`
            : "No aggregate activity in this range"}
        </div>
        <div
          className="mt-5 flex h-44 items-end gap-2 border-b border-tapit-line px-1 sm:gap-3"
          aria-label="Aggregate engagement trend"
        >
          {trend.length > 0 ? (
            trend.map((bucket) => {
              const total = bucket.views + bucket.clicks;
              return (
                <div
                  className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  key={bucket.bucketStart}
                >
                  <span className="text-[0.65rem] font-semibold text-tapit-muted">
                    {total.toLocaleString()}
                  </span>
                  <div
                    className="w-full max-w-10 rounded-t-lg bg-tapit-accent"
                    style={{ height: `${Math.max(10, (total / peak) * 125)}px` }}
                    title={`${bucket.views} views, ${bucket.clicks} clicks`}
                  />
                  <span className="text-[0.65rem] text-tapit-muted">
                    {new Date(bucket.bucketStart).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="mb-6 w-full text-center text-sm text-tapit-muted">
              Share your profile to start a trend.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Engagement summary">
        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          <Metric detail="All profile entry paths" label="Profile views" value={totals.views} />
          <Metric
            detail="Privacy-preserving estimate"
            label="Unique views"
            value={totals.uniqueViews}
          />
          <Metric detail="Destination selections" label="Link clicks" value={totals.clicks} />
        </dl>
        <p className="mt-5 flex items-center gap-2 text-sm text-tapit-muted">
          <TrendUpIcon aria-hidden="true" size={17} weight="bold" />
          Aggregate totals for the selected range
        </p>
      </Panel>

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
        <div className="mt-6 overflow-hidden rounded-tapit border border-tapit-line">
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
        <p className="mt-5 flex items-start gap-3 text-sm leading-6 text-tapit-muted">
          <ShieldCheckIcon
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-tapit-accent"
            size={21}
            weight="bold"
          />
          These metrics are designed to answer how a profile is performing without identifying the
          people who viewed it.
        </p>
      </Panel>
    </div>
  );
}
