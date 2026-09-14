import Link from "next/link";

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
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10">
      <section
        aria-labelledby="state-title"
        className="w-full max-w-md rounded-[2rem] border border-tapit-line bg-tapit-surface p-8 text-center shadow-[0_20px_60px_rgba(23,33,31,0.07)] sm:p-10"
      >
        <Brand />
        <div
          aria-hidden="true"
          className="mx-auto mt-10 grid size-14 place-items-center rounded-full bg-tapit-accent-soft text-lg font-semibold text-tapit-accent"
        >
          T
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-tapit-ink" id="state-title">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-tapit-muted">{message}</p>
        {actionHref && actionLabel ? (
          <Link
            className="mt-7 inline-flex rounded-full bg-tapit-accent px-5 py-3 text-sm font-semibold text-white hover:bg-tapit-accent-strong"
            href={actionHref}
          >
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
