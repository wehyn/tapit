"use client";

import { Brand } from "@/components/layout/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

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
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-4 py-6 sm:px-6 sm:py-8">
      <section
        aria-labelledby="state-title"
        className="w-full max-w-lg rounded-card bg-tapit-surface p-6 shadow-card"
      >
        <Brand />
        <div className="mt-8 flex items-start gap-4">
          <div
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent-strong"
          >
            <Icon name="warning" size={24} weight="bold" />
          </div>
          <div>
            <h1
              className="tapit-display break-words text-lg font-semibold leading-tight tracking-tight text-tapit-ink"
              id="state-title"
            >
              {title}
            </h1>
            <p className="mt-3 whitespace-pre-line text-left text-sm leading-6 text-tapit-muted">
              {message}
            </p>
          </div>
        </div>
        {actionHref && actionLabel ? (
          <ButtonLink
            className="mt-8 max-w-full transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus focus-visible:ring-offset-2"
            href={actionHref}
          >
            <Icon name={actionHref === "/" ? "arrowLeft" : "fingerprint"} size={17} />
            {actionLabel}
          </ButtonLink>
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
export function LostCardPage({
  instructions,
  supportUrl,
}: {
  instructions?: string;
  supportUrl?: string;
}) {
  const content = instructions?.trim();
  return (
    <StatePage
      actionHref={!content ? supportUrl : undefined}
      actionLabel={!content && supportUrl ? "Contact support" : undefined}
      message={`If you found this card, please contact and return it using the instructions below.${content ? `\n\n${content}` : supportUrl ? "" : " Please return it to its issuing organization."}`}
      title="Lost card"
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
