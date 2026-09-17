"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  EnvelopeSimpleIcon,
  FloppyDiskIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  LinkedinLogoIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import type {
  LinkIcon,
  ProfileLink,
  ProfileRedirect,
  ProfileTheme,
  PublicProfileProjection,
} from "@/lib/domain";
import { validateRedirectDestination } from "@/lib/domain";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type LinksWorkspaceMessage = {
  tone: "success" | "error";
  text: string;
};

export type LinksWorkspaceProps = {
  profileUrl: string;
  links: ProfileLink[];
  redirect: ProfileRedirect;
  redirectError: string | null;
  theme: ProfileTheme;
  preview: PublicProfileProjection | null;
  validation: Record<string, string>;
  publicationErrors: string[];
  message: LinksWorkspaceMessage | null;
  previewMode: "phone" | "desktop";
  pendingAction: "save" | "publish" | null;
  isDirty: boolean;
  publicationLabel: string;
  onPreviewModeChange: (mode: "phone" | "desktop") => void;
  onUpdateLink: (id: string, patch: Partial<ProfileLink>) => void;
  onUpdateRedirect: (patch: Partial<ProfileRedirect>) => void;
  onAddLink: () => void;
  onMoveLink: (id: string, direction: -1 | 1) => void;
  onRemoveLink: (id: string) => void;
  onSaveDraft: () => Promise<boolean>;
  onPublish: () => void | Promise<void>;
};

const iconOptions: Array<{ value: LinkIcon; label: string }> = [
  { value: "link", label: "Generic link" },
  { value: "globe", label: "Website / globe" },
  { value: "mail", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "calendar", label: "Booking / calendar" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
];

const linkIconMap = {
  link: LinkSimpleIcon,
  globe: GlobeIcon,
  mail: EnvelopeSimpleIcon,
  phone: PhoneIcon,
  calendar: CalendarDotsIcon,
  linkedin: LinkedinLogoIcon,
  instagram: InstagramLogoIcon,
} as const;

export function LinksWorkspace({
  profileUrl,
  links,
  redirect,
  redirectError,
  theme,
  preview,
  validation,
  publicationErrors,
  message,
  previewMode,
  pendingAction,
  isDirty,
  publicationLabel,
  onPreviewModeChange,
  onUpdateLink,
  onUpdateRedirect,
  onAddLink,
  onMoveLink,
  onRemoveLink,
  onSaveDraft,
  onPublish,
}: LinksWorkspaceProps) {
  const hasValidRedirectDestination =
    redirect.destination.trim().length > 0 &&
    validateRedirectDestination(redirect.destination) === null;

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 pb-28 pt-8 sm:px-8 lg:px-10 lg:pt-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.42fr)]">
        <section aria-labelledby="links-workspace-title">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1
                className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-5xl"
                id="links-workspace-title"
              >
                Your links
              </h1>
              <p className="mt-2 max-w-xl text-base leading-7 text-tapit-muted">
                Add and organize destinations such as Portfolio or TikTok. Use valid HTTPS links;
                email and phone actions can use mailto: or tel:.
              </p>
            </div>
            <Button onClick={onAddLink} type="button">
              <PlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Add link
            </Button>
          </div>
          <section
            aria-labelledby="profile-redirect-title"
            className="mt-7 overflow-hidden rounded-tapit border border-tapit-line bg-white shadow-[0_18px_50px_rgba(21,25,24,0.05)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-5 sm:px-5 sm:py-6">
              <div className="min-w-0 max-w-2xl">
                <h2
                  className="text-lg font-semibold tracking-[-0.02em] text-tapit-ink"
                  id="profile-redirect-title"
                >
                  Redirect card taps and scans
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-tapit-muted">
                  When enabled and published, active NFC and QR card visits are counted, then sent
                  to your destination.
                </p>
              </div>
              <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-tapit-ink">
                <input
                  aria-label="Enable card tap and scan redirect"
                  checked={redirect.enabled}
                  className="peer sr-only"
                  onChange={(event) => onUpdateRedirect({ enabled: event.target.checked })}
                  type="checkbox"
                />
                <span
                  aria-hidden="true"
                  className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-tapit-soft-surface transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-tapit-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus"
                />
                <span>Enabled</span>
              </label>
            </div>
            <div className="border-t border-tapit-line bg-tapit-surface/50 px-4 py-5 sm:px-5 sm:py-6">
              <label
                className="block text-sm font-medium text-tapit-ink"
                htmlFor="profile-redirect-destination"
              >
                HTTPS destination URL
              </label>
              <input
                aria-describedby="profile-redirect-help profile-redirect-feedback"
                aria-invalid={Boolean(redirectError)}
                className={`mt-2 min-h-11 w-full min-w-0 rounded-tapit border bg-white px-3 text-base text-tapit-ink outline-none transition placeholder:text-tapit-muted/70 focus:border-tapit-accent focus:ring-2 focus:ring-tapit-focus/30 ${redirectError ? "border-tapit-danger" : "border-tapit-line"}`}
                id="profile-redirect-destination"
                onChange={(event) => onUpdateRedirect({ destination: event.target.value })}
                placeholder="https://example.com"
                type="url"
                value={redirect.destination}
              />
              <p className="mt-2 text-xs leading-5 text-tapit-muted" id="profile-redirect-help">
                Use the full address, including https://.
              </p>
              {redirectError ? (
                <p
                  className="mt-2 text-xs font-medium text-tapit-danger"
                  id="profile-redirect-feedback"
                  role="alert"
                >
                  {redirectError}
                </p>
              ) : hasValidRedirectDestination ? (
                <p
                  className="mt-2 text-xs font-medium text-tapit-accent"
                  id="profile-redirect-feedback"
                >
                  Valid HTTPS destination
                </p>
              ) : null}
            </div>
          </section>
          <h2 className="sr-only">Profile links</h2>
          {message ? (
            <div className="mt-6">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          ) : null}
          <div
            className="mt-7 overflow-hidden rounded-tapit border border-tapit-line bg-white shadow-[0_18px_50px_rgba(21,25,24,0.05)]"
            aria-label="Editable profile links"
          >
            <div className="hidden border-b border-tapit-line bg-tapit-surface px-5 py-4 text-sm font-medium text-tapit-muted md:grid md:grid-cols-[1.5rem_minmax(11rem,0.75fr)_minmax(12rem,1fr)_6rem_2.5rem] md:gap-4">
              <span aria-hidden="true" />
              <span>Link</span>
              <span>Destination</span>
              <span>Status</span>
              <span aria-hidden="true" />
            </div>
            {links.length === 0 ? (
              <div className="p-6">
                <Notice>
                  Add your first link, such as Portfolio or TikTok. Use a valid HTTPS destination;
                  email and phone actions support mailto: and tel:.
                </Notice>
              </div>
            ) : null}
            {links.map((link, index) => {
              const selectedIcon: LinkIcon =
                link.icon !== undefined &&
                Object.prototype.hasOwnProperty.call(linkIconMap, link.icon)
                  ? link.icon
                  : "link";
              const LinkIcon = linkIconMap[selectedIcon];
              return (
                <article
                  className="group border-b border-tapit-line px-4 py-5 last:border-b-0 sm:px-5 sm:py-6"
                  key={link.id}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 md:grid-cols-[1.5rem_minmax(11rem,0.75fr)_minmax(12rem,1fr)_6rem_2.5rem] md:gap-4">
                    <div
                      className="hidden pt-3 text-tapit-muted md:block"
                      title="Use actions to reorder"
                    >
                      <DotsSixVerticalIcon aria-hidden="true" size={18} weight="bold" />
                    </div>
                    <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                      <div className="relative grid size-10 shrink-0 place-items-center rounded-tapit bg-tapit-accent-soft text-tapit-accent">
                        <LinkIcon aria-hidden="true" size={19} weight="bold" />
                        <label className="sr-only" htmlFor={`${link.id}-icon`}>
                          Preset icon for {link.label || "link"}
                        </label>
                        <select
                          aria-label={`Preset icon for ${link.label || "link"}`}
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          id={`${link.id}-icon`}
                          onChange={(event) =>
                            onUpdateLink(link.id, { icon: event.target.value as LinkIcon })
                          }
                          value={selectedIcon}
                        >
                          {iconOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="sr-only" htmlFor={`${link.id}-label`}>
                          Label for {link.label || "link"}
                        </label>
                        <input
                          aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                          aria-invalid={Boolean(validation[link.id])}
                          className={`min-h-11 w-full min-w-0 rounded-tapit border border-transparent bg-transparent px-2 text-base font-medium text-tapit-ink outline-none transition placeholder:text-tapit-muted/70 focus:border-tapit-accent focus:bg-tapit-paper ${validation[link.id] ? "border-tapit-danger" : ""}`}
                          id={`${link.id}-label`}
                          onChange={(event) => onUpdateLink(link.id, { label: event.target.value })}
                          placeholder="e.g. Portfolio"
                          value={link.label}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="sr-only" htmlFor={`${link.id}-destination`}>
                        Destination for {link.label || "link"}
                      </label>
                      <input
                        aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                        aria-invalid={Boolean(validation[link.id])}
                        className="min-h-11 w-full min-w-0 rounded-tapit border border-transparent bg-transparent px-2 text-sm text-tapit-muted outline-none transition placeholder:text-tapit-muted/70 focus:border-tapit-accent focus:bg-tapit-paper"
                        id={`${link.id}-destination`}
                        onChange={(event) =>
                          onUpdateLink(link.id, { destination: event.target.value })
                        }
                        placeholder="https:// or mailto: or tel:"
                        value={link.destination}
                      />
                    </div>
                    <label
                      className="col-start-1 flex min-h-11 items-center gap-2 text-sm font-medium text-tapit-ink md:col-auto"
                      title="Enabled links appear on your profile"
                    >
                      <input
                        aria-label={`Enable ${link.label || "link"}`}
                        checked={link.enabled}
                        className="peer sr-only"
                        onChange={(event) =>
                          onUpdateLink(link.id, { enabled: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span
                        aria-hidden="true"
                        className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-tapit-soft-surface transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-tapit-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus"
                      />
                      <span className="hidden md:inline">Enabled</span>
                    </label>
                    <details className="relative col-start-2 justify-self-end md:col-auto md:justify-self-auto">
                      <summary
                        aria-label={`Actions for ${link.label || "link"}`}
                        className="grid size-11 cursor-pointer list-none place-items-center rounded-tapit border border-transparent text-tapit-muted transition hover:border-tapit-line hover:bg-tapit-paper hover:text-tapit-ink"
                      >
                        <DotsThreeVerticalIcon aria-hidden="true" size={20} weight="bold" />
                      </summary>
                      <div className="absolute right-0 z-10 mt-2 grid min-w-36 gap-1 rounded-tapit border border-tapit-line bg-white p-2 shadow-xl">
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          disabled={index === 0}
                          onClick={() => onMoveLink(link.id, -1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowUpIcon aria-hidden="true" className="mr-2" size={16} />
                          Move up
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          disabled={index === links.length - 1}
                          onClick={() => onMoveLink(link.id, 1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowDownIcon aria-hidden="true" className="mr-2" size={16} />
                          Move down
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          onClick={() => onRemoveLink(link.id)}
                          type="button"
                          variant="quiet"
                        >
                          <TrashIcon aria-hidden="true" className="mr-2" size={16} />
                          Delete
                        </Button>
                      </div>
                    </details>
                  </div>
                  {validation[link.id] ? (
                    <p
                      className="mt-1.5 text-xs font-medium text-tapit-danger sm:ml-6"
                      id={`${link.id}-error`}
                      role="alert"
                    >
                      {validation[link.id]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          {publicationErrors.length > 0 ? (
            <ul className="mt-4 grid gap-2 text-sm text-tapit-muted">
              {publicationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <section className="h-fit lg:sticky lg:top-6" aria-label="Live profile preview">
          {preview ? (
            <WorkspacePreview
              mode={previewMode}
              onModeChange={onPreviewModeChange}
              preview={preview}
              profileUrl={profileUrl}
              theme={theme}
            />
          ) : (
            <Notice tone="error">Add a valid name and link to see the preview.</Notice>
          )}
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <CheckCircleIcon
              aria-hidden="true"
              className="shrink-0 text-tapit-accent"
              size={21}
              weight="fill"
            />
            <span className="font-semibold text-tapit-ink">
              {isDirty ? "Draft changes" : "Draft saved"}
            </span>
            <span className="hidden text-tapit-muted sm:inline">Last saved just now</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!isDirty || pendingAction !== null}
              loading={pendingAction === "save"}
              onClick={onSaveDraft}
              type="button"
              variant="secondary"
            >
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {pendingAction === "save" ? "Saving..." : "Save draft"}
            </Button>
            <Button
              disabled={
                publicationErrors.length > 0 ||
                Object.keys(validation).length > 0 ||
                publicationLabel === "Published" ||
                pendingAction !== null
              }
              loading={pendingAction === "publish"}
              onClick={onPublish}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {pendingAction === "publish" ? "Publishing..." : publicationLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
