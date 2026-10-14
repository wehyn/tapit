"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useEffect, useMemo, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ShieldCheckIcon } from "@phosphor-icons/react";

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

type DailyEngagementBucket = { bucketStart: number; views: number; clicks: number };
type EngagementPeriod = { start: number; end: number; views: number; clicks: number };

function groupEngagementTrend(
  dailyBuckets: DailyEngagementBucket[],
  range: AnalyticsRange,
  now: number,
): EngagementPeriod[] {
  const dayMs = 86400000;
  const cutoff = range === "lifetime" ? 0 : now - Number(range.slice(0, -1)) * dayMs;
  const utcDayStart = (timestamp: number) => {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  const byDay = new Map<number, { views: number; clicks: number }>();
  for (const bucket of dailyBuckets) {
    if (bucket.bucketStart < cutoff) continue;
    const dayStart = utcDayStart(bucket.bucketStart);
    const daily = byDay.get(dayStart) ?? { views: 0, clicks: 0 };
    daily.views += bucket.views;
    daily.clicks += bucket.clicks;
    byDay.set(dayStart, daily);
  }

  const today = utcDayStart(now);
  const periods: EngagementPeriod[] = [];
  const addPeriod = (start: number, end: number) => {
    let views = 0;
    let clicks = 0;
    for (let day = start; day <= end; day += dayMs) {
      const totals = byDay.get(day);
      views += totals?.views ?? 0;
      clicks += totals?.clicks ?? 0;
    }
    periods.push({ start, end, views, clicks });
  };

  if (range === "7d") {
    for (let day = Math.ceil(cutoff / dayMs) * dayMs; day <= today; day += dayMs) {
      addPeriod(day, day);
    }
  } else if (range === "lifetime") {
    let firstDay: number | undefined;
    for (const day of byDay.keys()) {
      if (firstDay === undefined || day < firstDay) firstDay = day;
    }
    if (firstDay !== undefined) {
      const firstDate = new Date(firstDay);
      const currentDate = new Date(today);
      let month = Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1);
      const currentMonth = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), 1);
      while (month <= currentMonth) {
        const nextMonthDate = new Date(month);
        nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
        const nextMonth = nextMonthDate.getTime();
        addPeriod(Math.max(month, firstDay), Math.min(nextMonth - dayMs, today));
        month = nextMonth;
      }
    }
  } else {
    const mondayStart = (timestamp: number) => {
      const day = utcDayStart(timestamp);
      return day - ((new Date(day).getUTCDay() + 6) % 7) * dayMs;
    };
    const firstWeek = mondayStart(cutoff);
    const currentWeek = mondayStart(today);
    for (let week = firstWeek; week <= currentWeek; week += 7 * dayMs) {
      addPeriod(Math.max(week, utcDayStart(cutoff)), Math.min(week + 6 * dayMs, today));
    }
  }

  return periods;
}

function formatTrendPeriod(period: EngagementPeriod): string {
  const start = new Date(period.start);
  const end = new Date(period.end);
  const format = (date: Date, year = false) =>
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    });
  if (period.start === period.end) return format(start);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${format(start, !sameYear)}–${format(end, !sameYear)}`;
}

export type AnalyticsSource = "nfc" | "qr" | "direct" | "unknown";
export type SourceTotals = Record<AnalyticsSource, number>;

/** Aggregate-only source totals; rows from before attribution was added remain unknown. */
export function aggregateSourceTotals(
  rows: ReadonlyArray<{ total: number; source?: string }>,
): SourceTotals {
  return rows.reduce<SourceTotals>(
    (totals, row) => {
      const source =
        row.source === "nfc" || row.source === "qr" || row.source === "direct"
          ? row.source
          : "unknown";
      totals[source] += row.total;
      return totals;
    },
    { nfc: 0, qr: 0, direct: 0, unknown: 0 },
  );
}

function SourceBreakdown({ totals }: { totals: SourceTotals }) {
  const labels: Array<[AnalyticsSource, string]> = [
    ["nfc", "NFC"],
    ["qr", "QR code"],
    ["direct", "Direct profile"],
    ["unknown", "Unknown / legacy"],
  ];
  return (
    <div className="mt-6 grid gap-2 sm:grid-cols-4" aria-label="Traffic source breakdown">
      {labels.map(([source, label]) => (
        <div className="rounded-tapit border border-tapit-line bg-tapit-paper p-4" key={source}>
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
            {label}
          </dt>
          <dd className="mt-2 text-xl font-semibold text-tapit-ink">
            {totals[source].toLocaleString()}
          </dd>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-tapit border border-tapit-line bg-tapit-paper p-3 sm:p-5">
      <dt className="text-xs font-semibold text-tapit-muted sm:text-sm">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight text-tapit-ink sm:text-3xl">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function DemoCustomerAnalytics() {
  // Retained only as an inert compatibility helper for the merged worktree.
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const [now] = useState(() => Date.now());
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range, profile.id),
    [profile.id, range, state.analytics],
  );
  const sourceTotals = useMemo(() => {
    const cutoff = range === "lifetime" ? 0 : now - Number(range.slice(0, -1)) * 86400000;
    return aggregateSourceTotals(
      state.analytics
        .filter((bucket) => bucket.profileId === profile.id && bucket.bucketStart >= cutoff)
        .map((bucket) => ({ total: bucket.views + bucket.clicks, source: bucket.source })),
    );
  }, [now, profile.id, range, state.analytics]);
  const trend = useMemo(
    () =>
      groupEngagementTrend(
        state.analytics
          .filter((bucket) => bucket.profileId === profile.id)
          .map(({ bucketStart, views, clicks }) => ({ bucketStart, views, clicks })),
        range,
        now,
      ),
    [now, profile.id, range, state.analytics],
  );
  const peak = Math.max(1, ...trend.map((period) => period.views + period.clicks));
  const linkResults = profile.draft.links
    .map((link) => ({ ...link, clicks: totals.linkClicks[link.id] ?? 0 }))
    .sort((left, right) => right.clicks - left.clicks);

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 pb-12 pt-5 sm:px-8 lg:gap-8 lg:px-10 lg:pt-8">
      <Panel>
        <h1 className="tapit-display text-2xl font-semibold tracking-tight text-tapit-ink sm:text-3xl">
          Profile analytics
        </h1>
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

      <Panel title="Engagement summary">
        <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <Metric label="Profile views" value={totals.views} />
          <Metric label="Unique views" value={totals.uniqueViews} />
          <Metric label="Link clicks" value={totals.clicks} />
        </dl>
      </Panel>

      <Panel title="Engagement trend">
        <div
          aria-label="Aggregate engagement trend"
          className="mt-5 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tapit-accent"
          role="region"
          tabIndex={0}
        >
          <div
            className="flex h-44 items-end gap-2 border-b border-tapit-line px-1 sm:gap-3"
            style={{ minWidth: `${Math.max(100, trend.length * 56)}px` }}
          >
            {trend.length > 0 ? (
              trend.map((period) => {
                const total = period.views + period.clicks;
                const label = formatTrendPeriod(period);
                return (
                  <div
                    aria-label={`${label}: ${total} total, ${period.views} views, ${period.clicks} clicks`}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    key={period.start}
                    role="group"
                  >
                    <span className="text-[0.65rem] font-semibold text-tapit-muted">
                      {total.toLocaleString()}
                    </span>
                    <div
                      className="w-full max-w-10 rounded-t-lg bg-tapit-accent"
                      style={{ height: `${Math.max(10, (total / peak) * 125)}px` }}
                      title={`${period.views} views, ${period.clicks} clicks`}
                    />
                    <span className="text-[0.6rem] text-tapit-muted">{label}</span>
                  </div>
                );
              })
            ) : (
              <p className="mb-6 w-full text-center text-sm text-tapit-muted">
                Share your profile to start a trend.
              </p>
            )}
          </div>
        </div>
      </Panel>
      {totals.views === 0 && totals.clicks === 0 ? (
        <Notice>
          No activity in this range yet. Share your profile or active card to begin collecting
          aggregate results.
        </Notice>
      ) : null}

      <Panel
        description="Sources include profile views and link clicks. Unknown / legacy means events without recorded attribution."
        title="Views and clicks by source"
      >
        <SourceBreakdown totals={sourceTotals} />
      </Panel>

      <Panel title="Link results">
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

function LiveCustomerAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const [now] = useState(() => Date.now());
  const profile = useQuery(api.profiles.mine);
  const pages = usePaginatedQuery(api.analytics.minePage, { range, now }, { initialNumItems: 50 });
  useEffect(() => {
    // Finish the first 1,000 rows before continuing in 500-row batches.
    if (pages.status === "CanLoadMore")
      pages.loadMore(pages.results.length < 1_000 ? 1_000 - pages.results.length : 500);
  }, [pages]);
  const buckets = pages.results;
  const totals = useMemo(
    () =>
      buckets.reduce(
        (summary, row) => {
          if (row.eventType === "profile_view") {
            summary.views += row.total;
            summary.uniqueViews += row.uniqueCount;
          } else {
            summary.clicks += row.total;
            if (row.linkKey !== undefined)
              summary.linkClicks[row.linkKey] = (summary.linkClicks[row.linkKey] ?? 0) + row.total;
          }
          return summary;
        },
        { views: 0, uniqueViews: 0, clicks: 0, linkClicks: {} as Record<string, number> },
      ),
    [buckets],
  );
  const sourceTotals = useMemo(
    () =>
      buckets.reduce<SourceTotals>(
        (summary, row) => {
          const source =
            (row as { source?: string }).source === "nfc" ||
            (row as { source?: string }).source === "qr" ||
            (row as { source?: string }).source === "direct"
              ? (row as { source: AnalyticsSource }).source
              : "unknown";
          summary[source] += row.total;
          return summary;
        },
        { nfc: 0, qr: 0, direct: 0, unknown: 0 },
      ),
    [buckets],
  );
  const trend = useMemo(() => {
    const dailyBuckets = new Map<number, DailyEngagementBucket>();
    for (const row of buckets) {
      const date = new Date(row.bucketStart);
      const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      const daily = dailyBuckets.get(dayStart) ?? {
        bucketStart: row.bucketStart,
        views: 0,
        clicks: 0,
      };
      daily.bucketStart = Math.min(daily.bucketStart, row.bucketStart);
      if (row.eventType === "profile_view") daily.views += row.total;
      else daily.clicks += row.total;
      dailyBuckets.set(dayStart, daily);
    }
    return groupEngagementTrend([...dailyBuckets.values()], range, now);
  }, [buckets, now, range]);
  const loading = profile === undefined || pages.status === "LoadingFirstPage";
  const peak = Math.max(1, ...trend.map((period) => period.views + period.clicks));
  const linkResults = (profile?.draft.links ?? [])
    .map((link) => ({ ...link, clicks: totals?.linkClicks[link.id] ?? 0 }))
    .sort((left, right) => right.clicks - left.clicks);

  if (loading) return <div className="p-8 text-sm text-tapit-muted">Loading analytics…</div>;
  if (profile === null)
    return <Notice tone="error">Your profile analytics are unavailable.</Notice>;

  return (
    <div className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 pb-12 pt-5 sm:px-8 lg:gap-8 lg:px-10 lg:pt-8">
      <Panel>
        <h1 className="tapit-display text-2xl font-semibold tracking-tight text-tapit-ink sm:text-3xl">
          Profile analytics
        </h1>
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
      {pages.status !== "Exhausted" ? (
        <Notice>Analytics totals are partial while the complete range loads.</Notice>
      ) : null}
      <Panel title="Engagement summary">
        <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <Metric label="Profile views" value={totals.views} />
          <Metric label="Unique views" value={totals.uniqueViews} />
          <Metric label="Link clicks" value={totals.clicks} />
        </dl>
      </Panel>
      <Panel title="Engagement trend">
        <div
          aria-label="Aggregate engagement trend"
          className="mt-5 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tapit-accent"
          role="region"
          tabIndex={0}
        >
          <div
            className="flex h-44 items-end gap-2 border-b border-tapit-line px-1 sm:gap-3"
            style={{ minWidth: `${Math.max(100, trend.length * 56)}px` }}
          >
            {trend.length > 0 ? (
              trend.map((period) => {
                const total = period.views + period.clicks;
                const label = formatTrendPeriod(period);
                return (
                  <div
                    aria-label={`${label}: ${total} total, ${period.views} views, ${period.clicks} clicks`}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
                    key={period.start}
                    role="group"
                  >
                    <span className="text-[0.65rem] font-semibold text-tapit-muted">
                      {total.toLocaleString()}
                    </span>
                    <div
                      className="w-full max-w-10 rounded-t-lg bg-tapit-accent"
                      style={{ height: `${Math.max(10, (total / peak) * 125)}px` }}
                      title={`${period.views} views, ${period.clicks} clicks`}
                    />
                    <span className="text-[0.6rem] text-tapit-muted">{label}</span>
                  </div>
                );
              })
            ) : (
              <p className="mb-6 w-full text-center text-sm text-tapit-muted">
                {pages.status === "Exhausted"
                  ? "Share your profile to start a trend."
                  : "Loading trend…"}
              </p>
            )}
          </div>
        </div>
      </Panel>
      {pages.status === "Exhausted" && totals.views === 0 && totals.clicks === 0 ? (
        <Notice>No activity in this range yet.</Notice>
      ) : null}
      <Panel
        description="Sources include profile views and link clicks. Unknown / legacy means events without recorded attribution."
        title="Views and clicks by source"
      >
        <SourceBreakdown totals={sourceTotals} />
      </Panel>
      <Panel title="Link results">
        <div className="mt-6 overflow-hidden rounded-tapit border border-tapit-line">
          {linkResults.length === 0 ? (
            <div className="p-5 text-sm text-tapit-muted">
              Add links to see destination results.
            </div>
          ) : (
            linkResults.map((link) => (
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
            ))
          )}
        </div>
      </Panel>
      <Panel title="Privacy note">
        <p className="mt-5 flex items-start gap-3 text-sm leading-6 text-tapit-muted">
          <ShieldCheckIcon
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-tapit-accent"
            size={21}
            weight="bold"
          />
          Aggregate metrics contain no visitor-level history.
        </p>
      </Panel>
    </div>
  );
}
export function CustomerAnalytics() {
  return !isLocalDemoMode() ? <LiveCustomerAnalytics /> : <DemoCustomerAnalytics />;
}
