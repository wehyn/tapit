"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeToAnalyticsConsent,
} from "@/lib/analytics/consent";

export function AnalyticsConsent() {
  const choice = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    getAnalyticsConsent,
    () => "unset",
  );
  const [editing, setEditing] = useState(false);

  if (choice !== "unset" && !editing)
    return (
      <button
        className="fixed right-4 bottom-4 z-50 rounded-full border border-tapit-line bg-tapit-surface px-4 py-2 text-xs font-semibold text-tapit-ink shadow-[0_12px_32px_rgba(23,35,30,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus focus-visible:ring-offset-2"
        onClick={() => setEditing(true)}
        type="button"
      >
        Analytics choices
      </button>
    );

  return (
    <aside
      aria-label="Analytics choices"
      className="fixed right-3 bottom-3 left-3 z-50 mx-auto max-w-xl rounded-tapit border border-tapit-line bg-tapit-surface p-5 text-tapit-ink shadow-[0_16px_40px_rgba(23,35,30,0.16)] sm:right-5 sm:bottom-5 sm:left-auto sm:p-6"
    >
      <h2 className="text-base font-semibold">Choose how visits are counted</h2>
      <p className="mt-2 text-sm leading-6 text-tapit-muted">
        Tapit counts page views and link clicks. If you allow unique-view analytics, we also store a
        random key in this browser session to estimate repeat visits. You can change your choice
        here. Read our{" "}
        <Link className="underline" href="/privacy">
          privacy notice
        </Link>
        .
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="min-h-11 rounded-full bg-tapit-accent px-4 py-2 text-sm font-semibold text-white hover:bg-tapit-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus focus-visible:ring-offset-2"
          onClick={() => {
            setAnalyticsConsent("allow");
            setEditing(false);
          }}
          type="button"
        >
          Allow unique views
        </button>
        <button
          className="min-h-11 rounded-full border border-tapit-line bg-tapit-surface px-4 py-2 text-sm font-semibold text-tapit-ink hover:bg-tapit-soft-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus focus-visible:ring-offset-2"
          onClick={() => {
            setAnalyticsConsent("decline");
            setEditing(false);
          }}
          type="button"
        >
          Count visits only
        </button>
      </div>
    </aside>
  );
}
