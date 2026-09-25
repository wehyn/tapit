import type { ProfileContent, ProfileStatus, PublishedProfileSnapshot } from "@/lib/domain";

import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface AdminProfileDetailsView {
  currentSlug: string;
  draft: ProfileContent;
  published: PublishedProfileSnapshot | null;
  status: ProfileStatus;
  customerEmail: string | null;
  assignedCardCount: number;
  assignedCardCountIsCapped: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  suspendedAt: string | null;
}

export interface ProfileDetailsProps {
  view: AdminProfileDetailsView;
  slugValue: string;
  onSlugChange: (value: string) => void;
  onSlugSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
  slugError?: string | null;
  slugSuccess?: string | null;
}

function Definition({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-tapit-muted">
        {label}
      </dt>
      <dd className="mt-2 break-words text-base leading-7 text-tapit-ink">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

function ContentSection({ content, heading }: { content: ProfileContent; heading: string }) {
  const redirectEnabled = content.redirect?.enabled === true;
  return (
    <section
      aria-label={heading}
      className="rounded-tapit border border-tapit-line bg-tapit-paper p-5 sm:p-7"
    >
      <h3 className="text-base font-semibold text-tapit-ink">{heading}</h3>
      <dl className="mt-6 grid min-w-0 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tapit-muted">
            Image preview
          </dt>
          <dd className="mt-2">
            {content.imageUrl ? (
              // The projection supplies a public preview URL; storage identifiers are never rendered.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${content.name || "Profile"} profile image`}
                className="size-28 rounded-tapit border border-tapit-line bg-tapit-surface object-cover"
                src={content.imageUrl}
              />
            ) : (
              <span className="text-sm text-tapit-muted">No image</span>
            )}
          </dd>
        </div>
        <Definition label="Name" value={content.name} />
        <Definition label="Bio" value={content.bio} />
        <Definition label="Public email" value={content.email} />
        <Definition label="Phone" value={content.phone} />
        <Definition label="Website" value={content.website} />
        <Definition label="Theme" value={content.theme ?? "Default"} />
        <Definition label="Redirect" value={redirectEnabled ? "Enabled" : "Disabled"} />
        <div className="sm:col-span-2 lg:col-span-3">
          <Definition label="Redirect destination" value={content.redirect?.destination} />
        </div>
      </dl>
      <div className="mt-8 border-t border-tapit-line pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-tapit-ink">Links</h4>
          <p className="text-sm text-tapit-muted">
            {content.links.length} {content.links.length === 1 ? "link" : "links"}
          </p>
        </div>
        {content.links.length === 0 ? (
          <p className="mt-2 text-sm text-tapit-muted">No links saved.</p>
        ) : (
          <ol className="mt-4 grid gap-4">
            {content.links.map((link, index) => (
              <li
                className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5"
                key={`${link.id}-${index}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-tapit-muted">
                  Link {index + 1}
                </p>
                <dl className="mt-4 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
                  <Definition label="Label" value={link.label} />
                  <Definition label="Destination" value={link.destination} />
                  <Definition label="Icon" value={link.icon ?? "None"} />
                  <Definition label="Enabled" value={link.enabled ? "Yes" : "No"} />
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function ProfileDetails({
  view,
  slugValue,
  onSlugChange,
  onSlugSubmit,
  isSubmitting,
  slugError,
  slugSuccess,
}: ProfileDetailsProps) {
  const cardCount = view.assignedCardCountIsCapped
    ? "1,000+"
    : new Intl.NumberFormat().format(view.assignedCardCount);
  const timestamps = [
    ["Created", view.createdAt],
    ["Updated", view.updatedAt],
    ["Published", view.publishedAt],
    ["Unpublished", view.unpublishedAt],
    ["Suspended", view.suspendedAt],
  ] as const;

  return (
    <div className="grid min-w-0 gap-8">
      <section
        aria-labelledby="admin-profile-overview-heading"
        className="rounded-tapit border border-tapit-line bg-tapit-paper p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
              Profile overview
            </p>
            <h2
              className="mt-2 text-xl font-semibold tracking-tight text-tapit-ink"
              id="admin-profile-overview-heading"
            >
              Account and lifecycle
            </h2>
          </div>
          <StatusBadge status={view.status} />
        </div>
        <dl className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5">
            <Definition label="Customer email" value={view.customerEmail} />
          </div>
          <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5">
            <Definition label="Assigned cards" value={cardCount} />
          </div>
        </dl>
        <div className="mt-7 border-t border-tapit-line pt-6">
          <h3 className="text-sm font-semibold text-tapit-ink">Lifecycle</h3>
          <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {timestamps.map(([label, value]) => (
              <Definition key={label} label={`${label} at`} value={value} />
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="admin-profile-slug-heading"
        className="rounded-tapit border border-tapit-accent/20 bg-tapit-accent-soft/30 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-accent-strong">
              Public address
            </p>
            <h2
              className="mt-2 text-xl font-semibold tracking-tight text-tapit-ink"
              id="admin-profile-slug-heading"
            >
              Administrator slug
            </h2>
            <p className="mt-3 text-sm leading-7 text-tapit-muted">
              Changing the slug does not publish draft content. The old direct URL will stop
              resolving, and the former slug may later be assigned to another profile.
            </p>
          </div>
          <code className="max-w-full break-all rounded-tapit border border-tapit-accent/20 bg-tapit-surface px-3 py-2 text-sm text-tapit-ink">
            /{view.currentSlug}
          </code>
        </div>
        <form
          className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={onSlugSubmit}
        >
          <Field
            autoCapitalize="none"
            autoComplete="off"
            error={slugError ?? undefined}
            id="admin-profile-details-slug"
            label="Profile slug"
            onChange={(event) => onSlugChange(event.target.value)}
            spellCheck={false}
            value={slugValue}
          />
          <Button
            className="min-h-12 sm:min-w-36"
            disabled={isSubmitting || slugValue.trim() === view.currentSlug}
            loading={isSubmitting}
            type="submit"
          >
            Save slug
          </Button>
        </form>
        {slugSuccess ? <Notice tone="success">{slugSuccess}</Notice> : null}
      </section>

      <section aria-labelledby="admin-profile-draft-heading" className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
            Working copy
          </p>
          <h2
            className="mt-2 text-xl font-semibold tracking-tight text-tapit-ink"
            id="admin-profile-draft-heading"
          >
            Saved draft
          </h2>
        </div>
        <ContentSection content={view.draft} heading="Saved draft content" />
      </section>

      <section aria-labelledby="admin-profile-published-heading" className="grid gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
            Visitor-facing version
          </p>
          <h2
            className="mt-2 text-xl font-semibold tracking-tight text-tapit-ink"
            id="admin-profile-published-heading"
          >
            Published snapshot
          </h2>
        </div>
        {view.published ? (
          <ContentSection content={view.published} heading="Published snapshot content" />
        ) : (
          <Notice>No published snapshot exists for this profile.</Notice>
        )}
      </section>
    </div>
  );
}
