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
        className="fixed right-4 bottom-4 z-50 rounded-full border border-tapit-line bg-tapit-paper px-4 py-2 text-xs font-medium text-tapit-ink shadow-lg"
        onClick={() => setEditing(true)}
        type="button"
      >
        Analytics choices
      </button>
    );

  return (
    <aside
      aria-label="Analytics choices"
      className="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-xl rounded-2xl border border-tapit-line bg-tapit-paper p-5 text-tapit-ink shadow-xl sm:left-auto"
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
          className="rounded-full bg-tapit-accent px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            setAnalyticsConsent("allow");
            setEditing(false);
          }}
          type="button"
        >
          Allow unique views
        </button>
        <button
          className="rounded-full border border-tapit-line px-4 py-2 text-sm font-semibold"
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
