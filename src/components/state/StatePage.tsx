"use client";

import Link from "next/link";
import { ArrowLeft, Fingerprint, WarningCircle } from "@phosphor-icons/react";

import { Brand } from "@/components/layout/Brand";

export function StatePage({
  actionHref,
  actionLabel,
  message,
  title,
}: {
  actionHref?: string;
  actionLabel?: string;
  message: string;
  title: string;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-4 py-8 sm:px-6 sm:py-10">
      <section
        aria-labelledby="state-title"
        className="w-full max-w-lg rounded-tapit border border-tapit-line bg-tapit-surface p-6 sm:p-9"
      >
        <Brand />
        <div className="mt-12 flex items-start gap-4 sm:mt-14">
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-tapit-line bg-tapit-soft-surface text-tapit-accent"
          >
            <WarningCircle size={24} weight="bold" />
          </div>
          <div>
            <h1
              className="tapit-display break-words text-2xl font-semibold leading-tight tracking-tight text-tapit-ink"
              id="state-title"
            >
              {title}
            </h1>
            <p className="mt-3 text-left text-sm leading-6 text-tapit-muted">{message}</p>
          </div>
        </div>
        {actionHref && actionLabel ? (
          <Link
            className="mt-8 inline-flex min-h-12 max-w-full items-center gap-2 rounded-full bg-tapit-accent px-5 py-3 text-sm font-semibold text-white hover:bg-tapit-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus focus-visible:ring-offset-2"
            href={actionHref}
          >
            {actionHref === "/" ? (
              <ArrowLeft aria-hidden="true" size={17} />
            ) : (
              <Fingerprint aria-hidden="true" size={17} />
            )}
            {actionLabel}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

export function InactiveCardPage({ supportUrl }: { supportUrl?: string }) {
  return (
    <StatePage
      actionHref={supportUrl}
      actionLabel={supportUrl ? "Contact support" : undefined}
      message="This card no longer points to a public profile. Use the support link if you need help."
      title="This card is inactive"
    />
  );
}
export function UnavailableProfilePage({ supportUrl }: { supportUrl?: string }) {
  return (
    <StatePage
      actionHref={supportUrl}
      actionLabel={supportUrl ? "Contact support" : undefined}
      message="The owner has temporarily hidden this profile. Use the support link if you need help."
      title="This profile is currently unavailable"
    />
  );
}
export function MissingProfilePage() {
  return (
    <StatePage
      actionHref="/"
      actionLabel="Return to Tapit"
      message="Check the address or ask the profile owner for a current link."
      title="Profile not found"
    />
  );
}
export function ServiceErrorPage() {
  return (
    <StatePage
      actionHref="/"
      actionLabel="Try again"
      message="Tapit could not load this profile right now. Please try again in a moment."
      title="Something went wrong"
    />
  );
}
