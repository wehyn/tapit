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
      <dt className="text-xs font-semibold uppercase tracking-wide text-tapit-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-tapit-ink">
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
      className="rounded-tapit border border-tapit-line bg-tapit-paper p-4 sm:p-5"
    >
      <h3 className="text-lg font-semibold text-tapit-ink">{heading}</h3>
      <dl className="mt-4 grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-tapit-muted">
            Image preview
          </dt>
          <dd className="mt-2">
            {content.imageUrl ? (
              // The projection supplies a public preview URL; storage identifiers are never rendered.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={`${content.name || "Profile"} profile image`}
                className="size-24 rounded-tapit border border-tapit-line object-cover"
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
        <div className="sm:col-span-2">
          <Definition label="Redirect destination" value={content.redirect?.destination} />
        </div>
      </dl>
      <div className="mt-5">
        <h4 className="text-sm font-semibold text-tapit-ink">Links</h4>
        {content.links.length === 0 ? (
          <p className="mt-2 text-sm text-tapit-muted">No links saved.</p>
        ) : (
          <ol className="mt-3 grid gap-3">
            {content.links.map((link, index) => (
              <li
                className="rounded-tapit border border-tapit-line bg-tapit-surface p-3"
                key={`${link.id}-${index}`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-tapit-muted">
                  Link {index + 1}
                </p>
                <dl className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
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
    <div className="grid min-w-0 gap-6">
      <section aria-labelledby="admin-profile-overview-heading">
        <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-overview-heading">
          Profile details
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={view.status} />
          <span className="text-sm text-tapit-muted">
            Current slug: <code className="break-all text-tapit-ink">{view.currentSlug}</code>
          </span>
        </div>
        <dl className="mt-4 grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2">
          <Definition label="Customer email" value={view.customerEmail} />
          <Definition label="Assigned cards" value={cardCount} />
          <div className="sm:col-span-2">
            <Definition label="Current public URL" value={`/${view.currentSlug}`} />
          </div>
          {timestamps.map(([label, value]) => (
            <Definition key={label} label={`${label} at`} value={value} />
          ))}
        </dl>
      </section>

      <section aria-labelledby="admin-profile-slug-heading" className="grid gap-4">
        <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-slug-heading">
          Administrator slug
        </h2>
        <p className="text-sm leading-6 text-tapit-muted">
          Changing this slug does not publish draft content. The old direct URL will stop resolving,
          and the former slug may later be assigned to another profile and open that profile.
        </p>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
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
            disabled={isSubmitting || slugValue.trim() === view.currentSlug}
            loading={isSubmitting}
            type="submit"
          >
            Save slug
          </Button>
        </form>
        {slugSuccess ? <Notice tone="success">{slugSuccess}</Notice> : null}
      </section>

      <section aria-labelledby="admin-profile-draft-heading" className="grid gap-3">
        <h2 className="text-xl font-semibold text-tapit-ink" id="admin-profile-draft-heading">
          Saved draft
        </h2>
        <ContentSection content={view.draft} heading="Saved draft content" />
      </section>

      <section aria-labelledby="admin-profile-published-heading" className="grid gap-3">
        <h2 className="text-xl font-semibold text-tapit-ink" id="admin-profile-published-heading">
          Published snapshot
        </h2>
        {view.published ? (
          <ContentSection content={view.published} heading="Published snapshot content" />
        ) : (
          <Notice>No published snapshot exists for this profile.</Notice>
        )}
      </section>
    </div>
  );
}
