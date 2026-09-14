"use client";

import { useMemo, useState } from "react";

import {
  projectPublicProfile,
  publishProfile,
  validateLinkDestination,
  validatePublication,
  type LinkIcon,
  type ProfileLink,
} from "@/lib/domain";
import {
  getDemoProfileForSession,
  getDemoTheme,
  updateDemoProfile,
  useDemoSession,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { PublicProfile } from "@/components/profile/PublicProfile";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";

const iconOptions: Array<{ value: LinkIcon; label: string }> = [
  { value: "link", label: "Generic link" },
  { value: "globe", label: "Website / globe" },
  { value: "mail", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "calendar", label: "Booking / calendar" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
];

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
  const publicationErrors = validatePublication(draft, profile.published);
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
  }

  function publish() {
    if (Object.keys(validation).length > 0) {
      setMessage({ tone: "error", text: "Fix each highlighted link before publishing." });
      return;
    }
    try {
      const nextProfile = {
        ...publishProfile(
          { ...profile, draft: { ...profile.draft, links: copyLinks(links) } },
          new Date().toISOString(),
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
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <Panel
        description="Choose a clear label, a safe destination, and the order visitors should see. Disabled links stay in your draft for later reuse."
        title="Profile links"
      >
        {message ? (
          <div className="mt-6">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        <div className="mt-6 grid gap-4" aria-label="Editable profile links">
          {links.length === 0 ? (
            <Notice>
              Add your first link. A published profile needs at least one valid enabled destination.
            </Notice>
          ) : null}

          {links.map((link, index) => (
            <article
              className="rounded-2xl border border-tapit-line bg-tapit-paper p-4"
              key={link.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tapit-muted">
                    Link {index + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-tapit-ink">
                    {link.label || "Untitled link"}
                  </p>
                </div>
                <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-tapit-line bg-tapit-surface px-3 text-sm font-semibold text-tapit-ink">
                  <input
                    checked={link.enabled}
                    className="size-4 accent-tapit-accent"
                    onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
                    type="checkbox"
                  />
                  Enabled
                </label>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  error={validation[link.id]}
                  id={`${link.id}-label`}
                  label="Label"
                  onChange={(event) => updateLink(link.id, { label: event.target.value })}
                  placeholder="e.g. Portfolio"
                  value={link.label}
                />
                <SelectField
                  id={`${link.id}-icon`}
                  label="Preset icon"
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
                </SelectField>
              </div>
              <Field
                className="mt-4"
                id={`${link.id}-destination`}
                label="Destination"
                onChange={(event) => updateLink(link.id, { destination: event.target.value })}
                placeholder="https:// or mailto: or tel:"
                value={link.destination}
              />
              {validation[link.id] ? (
                <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
                  {validation[link.id]}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-tapit-line pt-4">
                <Button
                  disabled={index === 0}
                  onClick={() => moveLink(link.id, -1)}
                  type="button"
                  variant="secondary"
                >
                  Move up
                </Button>
                <Button
                  disabled={index === links.length - 1}
                  onClick={() => moveLink(link.id, 1)}
                  type="button"
                  variant="secondary"
                >
                  Move down
                </Button>
                <Button onClick={() => removeLink(link.id)} type="button" variant="quiet">
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={addLink} type="button" variant="secondary">
            Add link
          </Button>
          <Button disabled={!isDirty} onClick={saveDraft} type="button" variant="secondary">
            Save draft
          </Button>
          <Button disabled={publicationErrors.length > 0} onClick={publish} type="button">
            Publish
          </Button>
        </div>

        <div className="mt-6 rounded-2xl border border-tapit-line bg-tapit-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={profile.status} />
            {isDirty ? (
              <span className="text-sm text-tapit-muted">Unsaved link changes</span>
            ) : (
              <span className="text-sm text-tapit-muted">Draft is saved</span>
            )}
          </div>
          {publicationErrors.length > 0 ? (
            <ul className="mt-4 grid gap-2 text-sm text-tapit-muted">
              {publicationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </Panel>

      <Panel
        className="h-fit lg:sticky lg:top-6"
        description="Preview the current link draft without publishing it."
        title="Live preview"
      >
        <div className="mt-5 flex gap-2" role="group" aria-label="Preview layout">
          <Button
            onClick={() => setPreviewMode("phone")}
            type="button"
            variant={previewMode === "phone" ? "primary" : "secondary"}
          >
            Phone
          </Button>
          <Button
            onClick={() => setPreviewMode("desktop")}
            type="button"
            variant={previewMode === "desktop" ? "primary" : "secondary"}
          >
            Desktop
          </Button>
        </div>
        {preview ? (
          <div
            className={`mt-5 overflow-auto rounded-[1.5rem] border border-tapit-line ${previewMode === "phone" ? "max-w-[22rem]" : "w-full"}`}
          >
            <PublicProfile
              preview
              profile={preview}
              profileUrl={`/${profile.draft.slug}`}
              theme={theme}
              trackView={false}
            />
          </div>
        ) : (
          <Notice tone="error">Add a valid name and link to see the preview.</Notice>
        )}
      </Panel>
    </div>
  );
}
