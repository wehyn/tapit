import type { ProfileContent, ProfileStatus, PublishedProfileSnapshot } from "@/lib/domain";

import Image from "next/image";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { StatusChip } from "@/components/ui/Chip";

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
      <dt className="text-xs font-semibold text-tapit-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-tapit-ink">{value || "Not provided"}</dd>
    </div>
  );
}

function ProfileIdentity({ view }: { view: AdminProfileDetailsView }) {
  const { draft } = view;
  return (
    <section aria-label="Profile identity" className="flex flex-col items-center gap-4 text-center">
      {draft.imageUrl ? (
        <Image
          alt=""
          className="tapit-image-outline size-16 rounded-full bg-tapit-surface object-cover"
          height={64}
          src={draft.imageUrl}
          unoptimized
          width={64}
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-16 place-items-center rounded-full bg-tapit-accent-soft text-xl font-semibold text-tapit-accent-strong"
        >
          {draft.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="flex flex-col items-center gap-2">
        <p className="text-lg font-semibold text-tapit-ink">{draft.name || "Unnamed profile"}</p>
        {draft.bio ? <p className="text-sm text-tapit-muted">{draft.bio}</p> : null}
        <StatusChip status={view.status} />
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-control bg-tapit-soft-surface px-4 py-3">
          <span className="text-sm text-tapit-muted">Published</span>
          <span className="text-sm text-tapit-ink">{view.publishedAt ?? "Not recorded"}</span>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-3 rounded-control bg-tapit-soft-surface px-4 py-3">
          <span className="text-sm text-tapit-muted">Theme</span>
          <span className="text-sm capitalize text-tapit-ink">{draft.theme ?? "paper"}</span>
        </div>
      </div>
      <ButtonLink href={`/${view.currentSlug}`} variant="secondary">
        Open public page
        <Icon name="link" size={16} />
      </ButtonLink>
    </section>
  );
}

function ContentSection({ content, heading }: { content: ProfileContent; heading: string }) {
  const redirectEnabled = content.redirect?.enabled === true;
  const customization = content.customization;
  const section = customization?.section;
  const featuredLink = customization?.featuredLinkId
    ? content.links.find((link) => link.id === customization.featuredLinkId)
    : undefined;
  const media = content.media;
  const backgroundImageUrl = media?.background?.previewUrl || media?.background?.url;
  return (
    <section
      aria-label={heading}
      className="flex min-w-0 flex-col gap-6 rounded-card bg-tapit-soft-surface p-6"
    >
      <h3 className="text-base font-semibold text-tapit-ink">{heading}</h3>
      <dl className="grid min-w-0 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-semibold text-tapit-muted">Image preview</dt>
          <dd className="mt-2">
            {content.imageUrl ? (
              <Image
                alt={`${content.name || "Profile"} profile image`}
                className="tapit-image-outline size-28 rounded-card bg-tapit-surface object-cover"
                height={112}
                src={content.imageUrl}
                unoptimized
                width={112}
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
      {customization ? (
        <section
          aria-label="Appearance details"
          className="flex flex-col gap-4 rounded-control bg-tapit-surface p-4 shadow-card"
        >
          <h4 className="text-sm font-semibold text-tapit-ink">Appearance and layout</h4>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Definition label="Preset" value={customization.preset} />
            <Definition label="Accent" value={customization.accent} />
            <Definition label="Type scale" value={customization.typeScale} />
            <Definition label="Link treatment" value={customization.linkTreatment} />
            <Definition label="Content order" value={customization.contentOrder} />
            <Definition label="Featured link" value={featuredLink?.label ?? "None"} />
            {customization.identityColors?.name ? (
              <Definition
                label="Name color"
                value={
                  customization.identityColors.name.kind === "preset"
                    ? customization.identityColors.name.value
                    : customization.identityColors.name.hex
                }
              />
            ) : null}
            {customization.identityColors?.bio ? (
              <Definition
                label="Bio color"
                value={
                  customization.identityColors.bio.kind === "preset"
                    ? customization.identityColors.bio.value
                    : customization.identityColors.bio.hex
                }
              />
            ) : null}
          </dl>
        </section>
      ) : null}
      {section ? (
        <section
          aria-label={section.kind === "about" ? "About section" : "Services section"}
          className="flex flex-col gap-3 rounded-control bg-tapit-surface p-4 shadow-card"
        >
          <h4 className="text-sm font-semibold text-tapit-ink">
            {section.kind === "about" ? "About" : "Services"}
          </h4>
          <p className="whitespace-pre-wrap text-sm text-tapit-muted">
            {section.body || "No section copy saved."}
          </p>
          {section.kind === "services" && section.items?.length ? (
            <ul className="list-inside list-disc text-sm text-tapit-ink">
              {section.items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {media ? (
        <section
          aria-label="Profile media"
          className="flex flex-col gap-4 rounded-control bg-tapit-surface p-4 shadow-card"
        >
          <h4 className="text-sm font-semibold text-tapit-ink">Media</h4>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
            <Definition label="Hero height" value={`${media.heroHeight}px`} />
            <Definition
              label="Slideshow autoplay"
              value={media.autoplay ? "Enabled" : "Disabled"}
            />
            <Definition label="Slideshow images" value={String(media.slideshow.length)} />
          </dl>
          {media.background ? (
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
              {backgroundImageUrl ? (
                <Image
                  alt={media.background.altText}
                  className="tapit-image-outline h-24 w-full rounded-card object-cover"
                  height={96}
                  src={backgroundImageUrl}
                  unoptimized
                  width={160}
                />
              ) : null}
              <div className="flex flex-col gap-2">
                <Definition label="Background description" value={media.background.altText} />
                <p className="text-xs text-tapit-muted">
                  Crop position {media.background.positionX}% horizontal,{" "}
                  {media.background.positionY}% vertical
                </p>
              </div>
            </div>
          ) : null}
          {media.slideshow.length > 0 ? (
            <ol className="grid gap-2 sm:grid-cols-2">
              {media.slideshow.map((image, index) => {
                const imageUrl = image.previewUrl || image.url;
                return (
                  <li
                    className="flex items-center gap-3 rounded-control bg-tapit-soft-surface p-3"
                    key={`${image.assetId}-${index}`}
                  >
                    {imageUrl ? (
                      <Image
                        alt={image.altText}
                        className="tapit-image-outline size-14 shrink-0 rounded-card object-cover"
                        height={56}
                        src={imageUrl}
                        unoptimized
                        width={56}
                      />
                    ) : null}
                    <span className="text-sm text-tapit-ink">
                      {image.altText || `Image ${index + 1}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </section>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-tapit-ink">Links</h4>
          <p className="text-sm text-tapit-muted">
            {content.links.length} {content.links.length === 1 ? "link" : "links"}
          </p>
        </div>
        {content.links.length === 0 ? (
          <p className="text-sm text-tapit-muted">No links saved.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {content.links.map((link, index) => (
              <li
                className="rounded-control bg-tapit-surface p-4 shadow-card"
                key={`${link.id}-${index}`}
              >
                <p className="text-xs font-semibold text-tapit-muted">Link {index + 1}</p>
                <dl className="mt-4 grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2">
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
      <ProfileIdentity view={view} />

      <section
        aria-labelledby="admin-profile-overview-heading"
        className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-soft-surface p-6"
      >
        <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-overview-heading">
          Account and lifecycle
        </h2>
        <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="rounded-control bg-tapit-surface p-4 shadow-card">
            <Definition label="Customer email" value={view.customerEmail} />
          </div>
          <div className="rounded-control bg-tapit-surface p-4 shadow-card">
            <Definition label="Assigned cards" value={cardCount} />
          </div>
        </dl>
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-tapit-ink">Lifecycle</h3>
          <dl className="grid min-w-0 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {timestamps.map(([label, value]) => (
              <Definition key={label} label={`${label} at`} value={value} />
            ))}
          </dl>
        </div>
      </section>

      <section
        aria-labelledby="admin-profile-slug-heading"
        className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-soft-surface p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-slug-heading">
              Administrator slug
            </h2>
            <p className="text-sm text-tapit-muted">
              Changing the slug does not publish draft content. The old direct URL will stop
              resolving, and the former slug may later be assigned to another profile.
            </p>
          </div>
          <code className="max-w-full break-all rounded-control bg-tapit-surface px-3 py-2 text-sm text-tapit-ink shadow-card">
            /{view.currentSlug}
          </code>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
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
            className="min-h-11 sm:min-w-36"
            disabled={isSubmitting || slugValue.trim() === view.currentSlug}
            loading={isSubmitting}
            type="submit"
          >
            Save slug
          </Button>
        </form>
        {slugSuccess ? <Notice tone="success">{slugSuccess}</Notice> : null}
      </section>

      <section aria-labelledby="admin-profile-draft-heading" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-draft-heading">
          Saved draft
        </h2>
        <ContentSection content={view.draft} heading="Saved draft content" />
      </section>

      <section aria-labelledby="admin-profile-published-heading" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-tapit-ink" id="admin-profile-published-heading">
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
