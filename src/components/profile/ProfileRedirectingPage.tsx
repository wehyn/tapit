"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const PROFILE_VIEW_MAX_WAIT_MS = 750;

export function ProfileRedirectingPage({
  visitKey,
  profileId,
  destination,
  claimHref,
  recordView,
}: {
  visitKey: string;
  profileId: string;
  destination: string;
  claimHref?: string;
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
    if (claimHref !== undefined) {
      void analytics.catch(() => {
        // A best-effort profile view must not block the card actions.
      });
      return;
    }
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
  }, [claimHref, destination, profileId, visitKey]);

  return (
    <main
      aria-busy={claimHref === undefined}
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-4 py-6 sm:px-8 sm:py-12"
    >
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col justify-center rounded-card bg-tapit-surface p-6 shadow-card">
        {claimHref ? (
          <>
            <h1 className="tapit-display text-xl font-semibold tracking-tight text-tapit-ink">
              This card opens a profile destination
            </h1>
            <p className="mt-3 text-sm text-tapit-muted">
              Continue to the profile destination, or enter your one-time claim code to confirm card
              ownership.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
                href={claimHref}
              >
                Claim this card
              </Link>
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-control px-4 text-sm font-semibold text-tapit-ink hover:bg-tapit-soft-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
                href={destination}
              >
                Continue to destination
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="grid h-24 w-24 place-items-center rounded-full bg-tapit-accent-soft">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-current/20 border-r-tapit-accent text-tapit-muted" />
            </div>
            <h1 className="tapit-display mt-8 text-xl font-semibold tracking-tight text-tapit-ink">
              Redirecting
            </h1>
            <p className="mt-3 text-sm text-tapit-muted" role="status">
              Taking you to the destination...
            </p>
          </>
        )}
      </div>
    </main>
  );
}
