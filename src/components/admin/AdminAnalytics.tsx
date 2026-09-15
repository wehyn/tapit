"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";

const ranges: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "lifetime", label: "Lifetime" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function DemoAdminAnalytics() {
  // Retained only as an inert compatibility helper for the merged worktree.
  const state = useDemoState();
  const profiles = getDemoProfiles(state);
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range),
    [range, state.analytics],
  );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
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
      <dl className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
          <UsersThreeIcon aria-hidden="true" className="text-tapit-accent" size={22} />
          <dt className="text-sm font-semibold text-tapit-muted">Profile views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.views.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">All active entry paths</p>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
          <ActivityIcon aria-hidden="true" className="text-tapit-accent" size={22} />
          <dt className="text-sm font-semibold text-tapit-muted">Unique views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.uniqueViews.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">Privacy-preserving estimate</p>
        </div>
        <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5">
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
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={profile.id}
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
            </div>
          ))}
          {state.cards.map((card) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={card.id}
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
    </div>
  );
}

function LiveAdminAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const [now] = useState(() => Date.now());
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
  const profiles = useQuery(api.profiles.adminList);
  const cards = useQuery(api.cards.adminList);
  if (profiles === undefined || cards === undefined || pages.status === "LoadingFirstPage")
    return <div className="p-8 text-sm text-tapit-muted">Loading operational analytics…</div>;
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
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
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-4"
              key={profile._id}
            >
              <div>
                <p className="font-semibold text-tapit-ink">
                  {profile.draft.name || "Unnamed profile"}
                </p>
                <p className="mt-1 text-sm text-tapit-muted">/{profile.draft.slug}</p>
              </div>
              <StatusBadge status={profile.status} />
            </div>
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
    </div>
  );
}
export function AdminAnalytics() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
    <LiveAdminAnalytics />
  ) : (
    <DemoAdminAnalytics />
  );
}
