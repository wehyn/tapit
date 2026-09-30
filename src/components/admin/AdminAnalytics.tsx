"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ActivityIcon, CardsIcon, ChartLineUpIcon, UsersThreeIcon } from "@phosphor-icons/react";

import {
  aggregateAnalytics,
  getDemoProfiles,
  type AnalyticsRange,
  useDemoState,
} from "@/lib/demo/store";

import { SelectField } from "@/components/ui/Field";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "lifetime", label: "Lifetime" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

type Source = "nfc" | "qr" | "direct" | "unknown";
type ProfileAnalyticsBucket = {
  bucketStart: number;
  source?: string;
  views: number;
  uniqueViews: number;
  clicks: number;
  linkClicks: Record<string, number>;
};
type ProfileAnalyticsSummary = {
  views: number;
  uniqueViews: number;
  clicks: number;
  linkClicks: Record<string, number>;
  sourceTotals: Record<Source, number>;
  trend: Array<{ bucketStart: number; total: number }>;
};
type ProfileAnalyticsLink = { id: string; label?: string; destination?: string };

function sourceKey(source: string | undefined): Source {
  return source === "nfc" || source === "qr" || source === "direct" ? source : "unknown";
}

function summarizeProfileAnalytics(
  buckets: readonly ProfileAnalyticsBucket[],
): ProfileAnalyticsSummary {
  const summary: ProfileAnalyticsSummary = {
    views: 0,
    uniqueViews: 0,
    clicks: 0,
    linkClicks: {},
    sourceTotals: { nfc: 0, qr: 0, direct: 0, unknown: 0 },
    trend: [],
  };
  const trendByDay = new Map<number, number>();

  for (const bucket of buckets) {
    summary.views += bucket.views;
    summary.uniqueViews += bucket.uniqueViews;
    summary.clicks += bucket.clicks;
    summary.sourceTotals[sourceKey(bucket.source)] += bucket.views + bucket.clicks;
    trendByDay.set(
      bucket.bucketStart,
      (trendByDay.get(bucket.bucketStart) ?? 0) + bucket.views + bucket.clicks,
    );
    for (const [linkId, clicks] of Object.entries(bucket.linkClicks)) {
      summary.linkClicks[linkId] = (summary.linkClicks[linkId] ?? 0) + clicks;
    }
  }

  summary.trend = [...trendByDay.entries()]
    .map(([bucketStart, total]) => ({ bucketStart, total }))
    .sort((left, right) => left.bucketStart - right.bucketStart);
  return summary;
}

function analyticsCutoff(range: AnalyticsRange, now: number): number {
  return range === "lifetime" ? 0 : now - Number(range.slice(0, -1)) * 86400000;
}

function SourceBreakdown({ totals }: { totals: Record<Source, number> }) {
  return (
    <div
      className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Traffic source breakdown"
    >
      {(
        [
          ["nfc", "NFC"],
          ["qr", "QR code"],
          ["direct", "Direct profile"],
          ["unknown", "Unknown / legacy"],
        ] as const
      ).map(([key, label]) => (
        <div
          className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5"
          key={key}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
            {label}
          </p>
          <p className="mt-2 text-xl font-semibold text-tapit-ink">
            {totals[key].toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-tapit-muted">Aggregate events</p>
        </div>
      ))}
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-tapit-line pl-4 first:border-l-0 first:pl-0 sm:pl-5">
      <dt className="text-sm font-semibold text-tapit-muted">{label}</dt>
      <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function ProfileAnalyticsDialog({
  name,
  slug,
  links,
  rangeLabel,
  summary,
  loading = false,
  onClose,
}: {
  name: string;
  slug: string;
  links: ProfileAnalyticsLink[];
  rangeLabel: string;
  summary: ProfileAnalyticsSummary;
  loading?: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const trigger = document.activeElement;
    dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, []);

  const linkResults = links
    .map((link) => ({ ...link, clicks: summary.linkClicks[link.id] ?? 0 }))
    .sort((left, right) => right.clicks - left.clicks);
  const peak = Math.max(1, ...summary.trend.map((bucket) => bucket.total));
  const hasActivity = summary.views > 0 || summary.clicks > 0;

  return (
    <dialog
      aria-describedby="profile-analytics-description"
      aria-labelledby="profile-analytics-title"
      aria-modal="true"
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-tapit-ink/70 px-4 py-6 text-left sm:px-8 sm:py-10"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const dialog = dialogRef.current;
        if (dialog === null) return;

        const focusableElements = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, [tabindex]",
          ),
        ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const focusIsOutsideDialog = !dialog.contains(document.activeElement);

        if (first === undefined || last === undefined) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (document.activeElement === first || focusIsOutsideDialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || focusIsOutsideDialog)) {
          event.preventDefault();
          first.focus();
        }
      }}
      ref={dialogRef}
    >
      <div className="mx-auto my-2 max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_24px_80px_rgba(21,25,24,0.24)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold tracking-tight text-tapit-ink"
              id="profile-analytics-title"
            >
              {name} analytics
            </h2>
            <p className="mt-2 text-sm text-tapit-muted" id="profile-analytics-description">
              /{slug} · {rangeLabel} · Aggregate profile activity
            </p>
          </div>
          <button
            aria-label="Close profile analytics"
            className="shrink-0 rounded-tapit border border-tapit-line px-3 py-2 text-sm font-semibold text-tapit-ink hover:bg-tapit-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            Close
          </button>
        </div>

        {loading ? (
          <div className="mt-6 p-4 text-sm text-tapit-muted">Loading profile analytics…</div>
        ) : (
          <div className="mt-6 grid gap-4">
            <section
              aria-labelledby="profile-analytics-summary-heading"
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-5"
            >
              <h3
                className="text-base font-semibold text-tapit-ink"
                id="profile-analytics-summary-heading"
              >
                Engagement summary
              </h3>
              <dl className="mt-5 grid gap-5 sm:grid-cols-3">
                <ProfileMetric label="Profile views" value={summary.views} />
                <ProfileMetric label="Unique views" value={summary.uniqueViews} />
                <ProfileMetric label="Link clicks" value={summary.clicks} />
              </dl>
            </section>

            <section
              aria-labelledby="profile-analytics-trend-heading"
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-5"
            >
              <h3
                className="text-base font-semibold text-tapit-ink"
                id="profile-analytics-trend-heading"
              >
                Engagement trend
              </h3>
              <div className="mt-5 overflow-x-auto">
                <div
                  aria-label="Aggregate engagement trend"
                  className="flex h-48 min-w-max items-end gap-3 border-b border-tapit-line px-1"
                >
                  {summary.trend.length > 0 ? (
                    summary.trend.map((bucket) => (
                      <div
                        className="flex w-12 shrink-0 flex-col items-center justify-end gap-2"
                        key={bucket.bucketStart}
                      >
                        <span className="text-[0.65rem] font-semibold text-tapit-muted">
                          {bucket.total.toLocaleString()}
                        </span>
                        <div
                          className="w-full max-w-10 rounded-t-lg bg-tapit-accent"
                          style={{ height: `${Math.max(10, (bucket.total / peak) * 125)}px` }}
                          title={`${bucket.total} views and clicks`}
                        />
                        <span className="text-[0.65rem] text-tapit-muted">
                          {new Date(bucket.bucketStart).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="mb-6 w-full text-center text-sm text-tapit-muted">
                      No activity in this range.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section
              aria-labelledby="profile-analytics-sources-heading"
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-5"
            >
              <h3
                className="text-base font-semibold text-tapit-ink"
                id="profile-analytics-sources-heading"
              >
                Traffic sources
              </h3>
              <SourceBreakdown totals={summary.sourceTotals} />
            </section>

            <section
              aria-labelledby="profile-analytics-links-heading"
              className="rounded-tapit border border-tapit-line bg-tapit-paper p-5"
            >
              <h3
                className="text-base font-semibold text-tapit-ink"
                id="profile-analytics-links-heading"
              >
                Link results
              </h3>
              <div className="mt-5 overflow-hidden rounded-tapit border border-tapit-line">
                {linkResults.length > 0 ? (
                  linkResults.map((link) => (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-tapit-line px-4 py-4 last:border-b-0 sm:px-5"
                      key={link.id}
                    >
                      <div>
                        <p className="font-semibold text-tapit-ink">
                          {link.label || "Untitled link"}
                        </p>
                        <p className="mt-1 max-w-xl truncate text-xs text-tapit-muted">
                          {link.destination || "No destination yet"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-tapit-accent">
                        {link.clicks.toLocaleString()} clicks
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-tapit-muted">
                    No links are configured for this profile.
                  </p>
                )}
              </div>
            </section>

            {!hasActivity ? <Notice>No aggregate activity in this range.</Notice> : null}
          </div>
        )}
      </div>
    </dialog>
  );
}

function DemoAdminAnalytics() {
  // Retained only as an inert compatibility helper for the merged worktree.
  const state = useDemoState();
  const profiles = getDemoProfiles(state);
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const [now] = useState(() => Date.now());
  const [selectedProfile, setSelectedProfile] = useState<(typeof profiles)[number] | null>(null);
  const closeProfileAnalytics = useCallback(() => setSelectedProfile(null), []);
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range),
    [range, state.analytics],
  );
  const selectedProfileBuckets = useMemo(() => {
    if (selectedProfile === null) return [];
    const cutoff = analyticsCutoff(range, now);
    return state.analytics
      .filter((bucket) => bucket.profileId === selectedProfile.id && bucket.bucketStart >= cutoff)
      .map((bucket) => ({ ...bucket, linkClicks: bucket.linkClicks ?? {} }));
  }, [now, range, selectedProfile, state.analytics]);
  const selectedProfileSummary = useMemo(
    () => summarizeProfileAnalytics(selectedProfileBuckets),
    [selectedProfileBuckets],
  );
  const sourceTotals = useMemo(() => {
    const cutoff = range === "lifetime" ? 0 : now - Number(range.slice(0, -1)) * 86400000;
    return state.analytics
      .filter((bucket) => bucket.bucketStart >= cutoff)
      .reduce<Record<Source, number>>(
        (summary, bucket) => {
          const source =
            bucket.source === "nfc" || bucket.source === "qr" || bucket.source === "direct"
              ? bucket.source
              : "unknown";
          summary[source] += bucket.views + bucket.clicks;
          return summary;
        },
        { nfc: 0, qr: 0, direct: 0, unknown: 0 },
      );
  }, [now, range, state.analytics]);

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <AdminPageHeader
        description="Review aggregate profile engagement and operational activity over time."
        title="Analytics"
      />
      <Panel
        description="Cross-customer totals are aggregate-only. No visitor identity or raw event history is available in this console."
        title="Operational analytics"
      >
        <div className="mt-6 flex max-w-xs items-end gap-3">
          <ChartLineUpIcon
            aria-hidden="true"
            className="mb-3 hidden text-tapit-accent sm:block"
            size={24}
          />
          <div className="flex-1">
            <SelectField
              id="admin-analytics-range"
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
        </div>
      </Panel>
      <Panel
        description="Aggregate events by entry path; no visitor identities are exposed."
        title="Traffic sources"
      >
        <SourceBreakdown totals={sourceTotals} />
      </Panel>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 sm:p-6">
          <UsersThreeIcon aria-hidden="true" className="text-tapit-accent" size={22} />
          <dt className="text-sm font-semibold text-tapit-muted">Profile views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.views.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">All active entry paths</p>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 sm:p-6">
          <ActivityIcon aria-hidden="true" className="text-tapit-accent" size={22} />
          <dt className="text-sm font-semibold text-tapit-muted">Unique views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.uniqueViews.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">Privacy-preserving estimate</p>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 sm:p-6">
          <CardsIcon aria-hidden="true" className="text-tapit-accent" size={22} />
          <dt className="text-sm font-semibold text-tapit-muted">Link clicks</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.clicks.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">Destination selections</p>
        </div>
      </dl>
      {totals.views === 0 && totals.clicks === 0 ? (
        <Notice>No aggregate activity in this range.</Notice>
      ) : null}
      <Panel
        description="Operational status helps support identify a profile or card issue without exposing visitor details."
        title="Profile and card status"
      >
        <div className="mt-6 grid gap-2">
          {profiles.map((profile) => (
            <button
              aria-label={`View analytics for ${profile.draft.name || "Unnamed profile"} (${profile.status})`}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-surface p-4 text-left transition-colors hover:border-tapit-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent"
              key={profile.id}
              onClick={() => setSelectedProfile(profile)}
              type="button"
            >
              <div>
                <p className="font-semibold text-tapit-ink">
                  {profile.draft.name || "Unnamed profile"}
                </p>
                <p className="mt-1 text-sm text-tapit-muted">
                  /{profile.draft.slug} ·{" "}
                  {state.customers.find((customer) => customer.profileId === profile.id)?.email ??
                    "unassigned"}
                </p>
              </div>
              <StatusBadge status={profile.status} />
            </button>
          ))}
          {state.cards.map((card) => (
            <div
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-surface p-4"
              key={card.id}
            >
              <div>
                <p className="break-all font-semibold text-tapit-ink">{card.token}</p>
                <p className="mt-1 break-all text-sm text-tapit-muted">{card.cardUrl}</p>
              </div>
              <StatusBadge status={card.status} />
            </div>
          ))}
        </div>
      </Panel>
      {selectedProfile ? (
        <ProfileAnalyticsDialog
          links={selectedProfile.draft.links}
          name={selectedProfile.draft.name || "Unnamed profile"}
          onClose={closeProfileAnalytics}
          rangeLabel={ranges.find((option) => option.value === range)?.label ?? range}
          slug={selectedProfile.draft.slug}
          summary={selectedProfileSummary}
        />
      ) : null}
    </div>
  );
}

function LiveAdminAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const [now] = useState(() => Date.now());
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const closeProfileAnalytics = useCallback(() => setSelectedProfileId(null), []);
  const pages = usePaginatedQuery(api.analytics.allPage, { range, now }, { initialNumItems: 500 });
  useEffect(() => {
    if (pages.status === "CanLoadMore") pages.loadMore(500);
  }, [pages]);
  const totals = useMemo(
    () =>
      pages.results.reduce(
        (summary, row) => {
          if (row.eventType === "profile_view") {
            summary.views += row.total;
            summary.uniqueViews += row.uniqueCount;
          } else {
            summary.clicks += row.total;
          }
          return summary;
        },
        { views: 0, uniqueViews: 0, clicks: 0 },
      ),
    [pages.results],
  );
  const sourceTotals = useMemo(
    () =>
      pages.results.reduce<Record<Source, number>>(
        (summary, row) => {
          const source =
            row.source === "nfc" || row.source === "qr" || row.source === "direct"
              ? row.source
              : "unknown";
          summary[source] += row.total;
          return summary;
        },
        { nfc: 0, qr: 0, direct: 0, unknown: 0 },
      ),
    [pages.results],
  );
  const profiles = useQuery(api.profiles.adminList);
  const cards = useQuery(api.cards.adminList);
  const selectedProfile = profiles?.find((profile) => profile._id === selectedProfileId) ?? null;
  const selectedProfileSummary = useMemo(
    () =>
      summarizeProfileAnalytics(
        pages.results
          .filter((row) => row.profileId === selectedProfileId)
          .map((row) => {
            const linkKey = row.linkKey ?? row.linkId;
            return {
              bucketStart: row.bucketStart,
              source: row.source,
              views: row.eventType === "profile_view" ? row.total : 0,
              uniqueViews: row.eventType === "profile_view" ? row.uniqueCount : 0,
              clicks: row.eventType === "link_click" ? row.total : 0,
              linkClicks:
                row.eventType === "link_click" && linkKey !== undefined
                  ? { [linkKey]: row.total }
                  : {},
            };
          }),
      ),
    [pages.results, selectedProfileId],
  );
  if (profiles === undefined || cards === undefined || pages.status === "LoadingFirstPage")
    return <div className="p-8 text-sm text-tapit-muted">Loading operational analytics…</div>;
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <AdminPageHeader
        description="Review aggregate profile engagement and operational activity over time."
        title="Analytics"
      />
      <Panel description="Cross-customer totals are aggregate-only." title="Operational analytics">
        {pages.status !== "Exhausted" ? (
          <Notice>Loading the complete analytics range…</Notice>
        ) : null}
        <div className="mt-6 max-w-xs">
          <SelectField
            id="admin-analytics-range"
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
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
          <dt className="text-sm font-semibold text-tapit-muted">Profile views</dt>
          <dd className="mt-3 text-3xl font-semibold text-tapit-ink">
            {totals.views.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
          <dt className="text-sm font-semibold text-tapit-muted">Unique views</dt>
          <dd className="mt-3 text-3xl font-semibold text-tapit-ink">
            {totals.uniqueViews.toLocaleString()}
          </dd>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
          <dt className="text-sm font-semibold text-tapit-muted">Link clicks</dt>
          <dd className="mt-3 text-3xl font-semibold text-tapit-ink">
            {totals.clicks.toLocaleString()}
          </dd>
        </div>
      </dl>
      {totals.views === 0 && totals.clicks === 0 ? (
        <Notice>No aggregate activity in this range.</Notice>
      ) : null}
      <Panel title="Profile and card status">
        <div className="mt-6 grid gap-2">
          {profiles.map((profile) => (
            <button
              aria-label={`View analytics for ${profile.draft.name || "Unnamed profile"} (${profile.status})`}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4 text-left hover:bg-tapit-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent"
              key={profile._id}
              onClick={() => setSelectedProfileId(profile._id)}
              type="button"
            >
              <div>
                <p className="font-semibold text-tapit-ink">
                  {profile.draft.name || "Unnamed profile"}
                </p>
                <p className="mt-1 text-sm text-tapit-muted">/{profile.draft.slug}</p>
              </div>
              <StatusBadge status={profile.status} />
            </button>
          ))}
          {cards.map((card) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={card._id}
            >
              <div>
                <p className="font-semibold text-tapit-ink">{card.token}</p>
                <p className="mt-1 text-sm text-tapit-muted">{card.cardUrl}</p>
              </div>
              <StatusBadge status={card.status} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        description="Aggregate events by entry path; no visitor identities are exposed."
        title="Traffic sources"
      >
        <SourceBreakdown totals={sourceTotals} />
      </Panel>
      {selectedProfile ? (
        <ProfileAnalyticsDialog
          links={selectedProfile.draft.links}
          loading={pages.status !== "Exhausted"}
          name={selectedProfile.draft.name || "Unnamed profile"}
          onClose={closeProfileAnalytics}
          rangeLabel={ranges.find((option) => option.value === range)?.label ?? range}
          slug={selectedProfile.draft.slug}
          summary={selectedProfileSummary}
        />
      ) : null}
    </div>
  );
}
export function AdminAnalytics() {
  return !isLocalDemoMode() ? <LiveAdminAnalytics /> : <DemoAdminAnalytics />;
}
