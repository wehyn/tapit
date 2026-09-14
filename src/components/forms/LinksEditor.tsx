"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  DotsThreeVerticalIcon,
  DotsSixVerticalIcon,
  EnvelopeSimpleIcon,
  FloppyDiskIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  LinkedinLogoIcon,
  PlusIcon,
  PhoneIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import {
  projectPublicProfile,
  publishProfile,
  validateLinkDestination,
  validatePublication,
  validatePublicationAccess,
  type LinkIcon,
  type ProfileLink,
} from "@/lib/domain";
import {
  getDemoProfileForSession,
  getDemoProfiles,
  getDemoTheme,
  updateDemoProfile,
  useDemoSession,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

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

function copyLinks(links: readonly ProfileLink[]): ProfileLink[] {
  return links.map((link) => ({ ...link }));
}

function previewForLinks(
  profile: ReturnType<typeof getDemoProfileForSession>,
  links: ProfileLink[],
) {
  const draft = { ...profile.draft, links };
  return projectPublicProfile({
    ...profile,
    status: "published",
    draft,
    published: {
      ...draft,
      publishedAt: profile.published?.publishedAt ?? new Date().toISOString(),
    },
  });
}

export function LinksEditor() {
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const theme = getDemoTheme(state, profile.id);
  const [links, setLinks] = useState<ProfileLink[]>(() => copyLinks(profile.draft.links));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const destinations = new Map<string, string>();
    for (const link of links) {
      if (!link.enabled) continue;
      if (!link.label.trim()) {
        errors[link.id] = "Add a label so visitors know where this link goes.";
      } else {
        const destinationError = validateLinkDestination(link.destination);
        if (destinationError) errors[link.id] = destinationError;
      }

      const normalizedDestination = link.destination.trim().toLowerCase();
      if (normalizedDestination && destinations.has(normalizedDestination)) {
        errors[link.id] = "This destination is already used by another link.";
      } else if (normalizedDestination) {
        destinations.set(normalizedDestination, link.id);
      }
    }
    return errors;
  }, [links]);

  const draft = { ...profile.draft, links };
  const customer =
    session?.role === "customer"
      ? state.customers.find((candidate) => candidate.email === session.email)
      : undefined;
  const lifecycleErrors = validatePublicationAccess(
    profile.status,
    customer?.status,
    customer?.deletionStatus,
  );
  const publicationErrors = [
    ...validatePublication(draft, profile.published, {
      existingSlugs: getDemoProfiles(state)
        .filter((candidate) => candidate.id !== profile.id)
        .flatMap((candidate) => [
          candidate.draft.slug,
          ...(candidate.published === null ? [] : [candidate.published.slug]),
        ]),
    }),
    ...lifecycleErrors,
  ];
  const preview =
    Object.keys(validation).length === 0 && publicationErrors.length === 0
      ? previewForLinks(profile, links)
      : null;
  const isDirty = JSON.stringify(links) !== JSON.stringify(profile.draft.links);

  function updateLink(id: string, patch: Partial<ProfileLink>) {
    setLinks((current) => current.map((link) => (link.id === id ? { ...link, ...patch } : link)));
    setMessage(null);
  }

  function addLink() {
    setLinks((current) => [
      ...current,
      { id: `link-${Date.now()}`, label: "", destination: "", enabled: true, icon: "link" },
    ]);
    setMessage(null);
  }

  function removeLink(id: string) {
    setLinks((current) => current.filter((link) => link.id !== id));
    setMessage(null);
  }

  function moveLink(id: string, direction: -1 | 1) {
    setLinks((current) => {
      const index = current.findIndex((link) => link.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(nextIndex, 0, moved);
      return next;
    });
    setMessage(null);
  }

  function saveDraft() {
    if (Object.keys(validation).length > 0) {
      setMessage({ tone: "error", text: "Fix each highlighted link before saving the draft." });
      return;
    }
    try {
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => ({
          ...currentProfile,
          draft: { ...currentProfile.draft, links: copyLinks(links) },
        })),
      );
      setMessage({
        tone: "success",
        text: "Links saved to draft. Visitors still see the last published order.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Links could not be saved.",
      });
    }
  }

  function publish() {
    if (publicationErrors.length > 0 || Object.keys(validation).length > 0) {
      setMessage({
        tone: "error",
        text:
          Object.keys(validation).length > 0
            ? "Fix each highlighted link before publishing."
            : publicationErrors.join(" "),
      });
      return;
    }
    try {
      const nextProfile = {
        ...publishProfile(
          { ...profile, draft: { ...profile.draft, links: copyLinks(links) } },
          new Date().toISOString(),
          {
            existingSlugs: getDemoProfiles(state)
              .filter((candidate) => candidate.id !== profile.id)
              .flatMap((candidate) => [
                candidate.draft.slug,
                ...(candidate.published === null ? [] : [candidate.published.slug]),
              ]),
          },
        ),
        theme: profile.theme,
      };
      updateDemoState((current) => ({
        ...updateDemoProfile(current, profile.id, () => nextProfile),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: session?.email ?? profile.draft.name,
            action: "profile.published",
            target: nextProfile.draft.slug,
            occurredAt: new Date().toISOString(),
            after: "published",
          },
          ...current.audits,
        ],
      }));
      setMessage({
        tone: "success",
        text: "Links published. The public profile now uses this order and enabled state.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Links could not be published.",
      });
    }
  }

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
                Add and organize the destinations on your public profile.
              </p>
            </div>
            <Button onClick={addLink} type="button">
              <PlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Add link
            </Button>
          </div>
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
              <span aria-hidden="true" /> <span>Link</span>
              <span>Destination</span>
              <span>Status</span>
              <span aria-hidden="true" />
            </div>
            {links.length === 0 ? (
              <div className="p-6">
                <Notice>
                  Add your first link. A published profile needs at least one valid enabled
                  destination.
                </Notice>
              </div>
            ) : null}
            {links.map((link, index) => {
              const LinkIcon = linkIconMap[link.icon ?? "link"];
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
                            updateLink(link.id, { icon: event.target.value as LinkIcon })
                          }
                          value={link.icon ?? "link"}
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
                          onChange={(event) => updateLink(link.id, { label: event.target.value })}
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
                          updateLink(link.id, { destination: event.target.value })
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
                        onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
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
                          onClick={() => moveLink(link.id, -1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowUpIcon aria-hidden="true" className="mr-2" size={16} />
                          Move up
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          disabled={index === links.length - 1}
                          onClick={() => moveLink(link.id, 1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowDownIcon aria-hidden="true" className="mr-2" size={16} />
                          Move down
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          onClick={() => removeLink(link.id)}
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
              onModeChange={setPreviewMode}
              preview={preview}
              profileUrl={`/${profile.draft.slug}`}
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
            <Button disabled={!isDirty} onClick={saveDraft} type="button" variant="secondary">
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Save draft
            </Button>
            <Button
              disabled={publicationErrors.length > 0 || Object.keys(validation).length > 0}
              onClick={publish}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
