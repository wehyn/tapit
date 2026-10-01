"use client";

import { useEffect, useRef } from "react";

const PROFILE_VIEW_MAX_WAIT_MS = 750;

export function ProfileRedirectingPage({
  visitKey,
  profileId,
  destination,
  recordView,
}: {
  visitKey: string;
  profileId: string;
  destination: string;
  recordView: () => Promise<void>;
}) {
  const redirectAttempt = useRef<
    { visitKey: string; profileId: string; analytics: Promise<void> } | undefined
  >(undefined);
  const recordViewRef = useRef(recordView);

  useEffect(() => {
    recordViewRef.current = recordView;
  }, [recordView]);

  useEffect(() => {
    const analytics =
      redirectAttempt.current?.visitKey === visitKey &&
      redirectAttempt.current.profileId === profileId
        ? redirectAttempt.current.analytics
        : recordViewRef.current();
    redirectAttempt.current = { visitKey, profileId, analytics };
    let cancelled = false;
    let navigated = false;
    const navigate = () => {
      if (cancelled || navigated) return;
      navigated = true;
      window.clearTimeout(timeoutId);
      window.location.replace(destination);
    };
    const timeoutId = window.setTimeout(navigate, PROFILE_VIEW_MAX_WAIT_MS);
    void analytics
      .catch(() => {
        // A best-effort profile view must not block the redirect.
      })
      .finally(navigate);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [destination, profileId, visitKey]);

  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-4 py-6 sm:px-8 sm:py-10"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center rounded-tapit border border-tapit-line bg-tapit-surface p-6 sm:p-9">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-tapit-accent-soft">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-tapit-line border-t-tapit-accent" />
        </div>
        <h1 className="tapit-display mt-8 text-3xl font-semibold tracking-tight text-tapit-ink">
          Redirecting
        </h1>
        <p className="mt-3 text-sm text-tapit-muted" role="status">
          Taking you to the destination...
        </p>
      </div>
    </main>
  );
}
