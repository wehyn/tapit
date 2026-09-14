"use client";

import { useMemo, useState } from "react";

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

export function AdminAnalytics() {
  const state = useDemoState();
  const profiles = getDemoProfiles(state);
  const [range, setRange] = useState<AnalyticsRange>("lifetime");
  const totals = useMemo(
    () => aggregateAnalytics(state.analytics, range),
    [range, state.analytics],
  );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8">
      <Panel
        description="Cross-customer totals are aggregate-only. No visitor identity or raw event history is available in this console."
        title="Operational analytics"
      >
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
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-tapit-line bg-tapit-surface p-5">
          <dt className="text-sm font-semibold text-tapit-muted">Profile views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.views.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">All active entry paths</p>
        </div>
        <div className="rounded-2xl border border-tapit-line bg-tapit-surface p-5">
          <dt className="text-sm font-semibold text-tapit-muted">Unique views</dt>
          <dd className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            {totals.uniqueViews.toLocaleString()}
          </dd>
          <p className="mt-2 text-xs text-tapit-muted">Privacy-preserving estimate</p>
        </div>
        <div className="rounded-2xl border border-tapit-line bg-tapit-surface p-5">
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
        <div className="mt-6 grid gap-3">
          {profiles.map((profile) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tapit-line bg-tapit-paper p-4"
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tapit-line bg-tapit-paper p-4"
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
