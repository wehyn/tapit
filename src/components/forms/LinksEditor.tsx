"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { FloppyDiskIcon, PlusIcon } from "@phosphor-icons/react";

import {
  hasUnpublishedChanges,
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

import { LinksWorkspace } from "@/components/forms/LinksWorkspace";
import { useDraftSaveRegistration } from "@/components/layout/DraftSaveContext";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { api } from "../../../convex/_generated/api";

function copyLinks(links: readonly ProfileLink[]): ProfileLink[] {
  return links.map((link) => ({ ...link }));
}

const MAX_DRAFT_SAVE_ATTEMPTS = 3;

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

function DemoLinksEditor() {
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const theme = getDemoTheme(state, profile.id);
  const [links, setLinks] = useState<ProfileLink[]>(() => copyLinks(profile.draft.links));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | null>(null);

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
  const hasChangesSincePublish = hasUnpublishedChanges(draft, profile.published);
  const publicationLabel =
    profile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const draftRevisionRef = useRef(0);
  const latestLinksRef = useRef(links);

  useEffect(() => {
    latestLinksRef.current = links;
  }, [links]);

  function updateLink(id: string, patch: Partial<ProfileLink>) {
    draftRevisionRef.current += 1;
    setLinks((current) => current.map((link) => (link.id === id ? { ...link, ...patch } : link)));
    setMessage(null);
  }

  function addLink() {
    draftRevisionRef.current += 1;
    setLinks((current) => [
      ...current,
      { id: `link-${Date.now()}`, label: "", destination: "", enabled: true, icon: "link" },
    ]);
    setMessage(null);
  }

  function removeLink(id: string) {
    draftRevisionRef.current += 1;
    setLinks((current) => current.filter((link) => link.id !== id));
    setMessage(null);
  }

  function moveLink(id: string, direction: -1 | 1) {
    setLinks((current) => {
      const index = current.findIndex((link) => link.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      draftRevisionRef.current += 1;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(nextIndex, 0, moved);
      return next;
    });
    setMessage(null);
  }

  const saveDraft = useCallback(async () => {
    if (!isDirty) return true;
    if (Object.keys(validation).length > 0) {
      setMessage({ tone: "error", text: "Fix each highlighted link before saving the draft." });
      return false;
    }
    setPendingAction("save");
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
      return true;
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Links could not be saved.",
      });
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [isDirty, links, profile.id, validation]);

  useDraftSaveRegistration(saveDraft);

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
    setPendingAction("publish");
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
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <LinksWorkspace
      profileUrl={`/${profile.draft.slug}`}
      links={links}
      theme={theme}
      preview={preview}
      validation={validation}
      publicationErrors={publicationErrors}
      message={message}
      previewMode={previewMode}
      pendingAction={pendingAction}
      isDirty={isDirty}
      publicationLabel={publicationLabel}
      onPreviewModeChange={setPreviewMode}
      onUpdateLink={updateLink}
      onAddLink={addLink}
      onMoveLink={moveLink}
      onRemoveLink={removeLink}
      onSaveDraft={saveDraft}
      onPublish={publish}
    />
  );
}

export function LinksEditor() {
  return !isLocalDemoMode() ? <LiveLinksEditor /> : <DemoLinksEditor />;
}

function LiveLinksEditor() {
  const profile = useQuery(api.profiles.mine);
  if (profile === undefined) return <div className="min-h-[60vh] bg-tapit-paper" />;
  if (profile === null) return <Notice tone="error">Your profile could not be found.</Notice>;
  return <LiveLinksEditorContent profile={profile} />;
}

function LiveLinksEditorContent({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useQuery<typeof api.profiles.mine>>>;
}) {
  const saveLinks = useMutation(api.links.replaceDraft);
  const [links, setLinks] = useState<ProfileLink[] | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const navigationSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const registeredSave = useCallback(() => navigationSaveRef.current(), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);

  const current = useMemo(
    () =>
      links ?? profile?.draft.links.map((link) => ({ ...link, icon: link.icon as LinkIcon })) ?? [],
    [links, profile],
  );
  const errors = useMemo(() => {
    const seen = new Set<string>();
    return current.reduce<Record<string, string>>((result, link) => {
      if (!link.enabled) return result;
      const key = link.destination.trim().toLowerCase();
      if (!link.label.trim()) result[link.id] = "Add a label.";
      else if (validateLinkDestination(link.destination))
        result[link.id] = validateLinkDestination(link.destination)!;
      if (key && seen.has(key)) result[link.id] = "This destination is already used.";
      if (key) seen.add(key);
      return result;
    }, {});
  }, [current]);
  const latestLinksRef = useRef(current);

  useEffect(() => {
    latestLinksRef.current = current;
  }, [current]);

  const liveProfile = profile;

  function update(id: string, patch: Partial<ProfileLink>) {
    draftRevisionRef.current += 1;
    setLinks(current.map((link) => (link.id === id ? { ...link, ...patch } : link)));
    setMessage(null);
  }
  function add() {
    if (current.length >= 100)
      return setMessage({ tone: "error", text: "A profile cannot contain more than 100 links." });
    draftRevisionRef.current += 1;
    setLinks([
      ...current,
      { id: `link-${Date.now()}`, label: "", destination: "", enabled: true, icon: "link" },
    ]);
  }
  async function save(): Promise<boolean> {
    if (!profile) return true;
    if (current.length === 0 && !profile.draft.links.length) return true;
    if (Object.keys(errors).length > 0) {
      setMessage({ tone: "error", text: "Fix each highlighted link before saving." });
      return false;
    }
    setPending(true);
    try {
      let linksToSave = latestLinksRef.current;
      for (let attempt = 0; attempt < MAX_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
        const revisionAtStart = draftRevisionRef.current;
        await saveLinks({ profileId: liveProfile._id, links: linksToSave });
        const latestLinks = latestLinksRef.current;
        if (
          revisionAtStart === draftRevisionRef.current ||
          JSON.stringify(latestLinks) === JSON.stringify(linksToSave)
        ) {
          setLinks(null);
          setMessage({
            tone: "success",
            text: "Links saved to draft. Visitors still see the last published order.",
          });
          return true;
        }
        linksToSave = latestLinks;
      }
      throw new Error("Your links changed while they were saving. Try again.");
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Links could not be saved.",
      });
      return false;
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    navigationSaveRef.current = save;
  });
  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pb-28 pt-8 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-5xl">
            Your links
          </h1>
          <p className="mt-2 text-base leading-7 text-tapit-muted">
            Add and organize destinations such as Portfolio or TikTok. Use valid HTTPS links; email
            and phone actions can use mailto: or tel:.
          </p>
        </div>
        <Button onClick={add} type="button">
          <PlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
          Add link
        </Button>
      </div>
      {message ? (
        <div className="mt-6">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}
      <div className="mt-8 grid gap-3">
        {current.map((link, index) => (
          <div
            className="grid gap-3 rounded-tapit border border-tapit-line bg-white p-4 sm:grid-cols-[1fr_1.5fr_auto]"
            key={link.id}
          >
            <input
              aria-label={`Label for link ${index + 1}`}
              className="min-h-11 rounded-tapit border border-tapit-line px-3"
              onChange={(event) => update(link.id, { label: event.target.value })}
              value={link.label}
              placeholder="Label"
            />
            <input
              aria-label={`Destination for link ${index + 1}`}
              className="min-h-11 rounded-tapit border border-tapit-line px-3"
              onChange={(event) => update(link.id, { destination: event.target.value })}
              value={link.destination}
              placeholder="https://example.com"
            />
            <div className="flex items-center gap-2">
              <input
                aria-label={`Enable link ${index + 1}`}
                checked={link.enabled}
                onChange={(event) => update(link.id, { enabled: event.target.checked })}
                type="checkbox"
              />
              <button
                className="text-sm text-tapit-danger"
                onClick={() => setLinks(current.filter((candidate) => candidate.id !== link.id))}
                type="button"
              >
                Remove
              </button>
            </div>
            {errors[link.id] ? (
              <p className="text-sm text-tapit-danger sm:col-span-3">{errors[link.id]}</p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-white/95 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-[960px] justify-end">
          <Button disabled={pending} onClick={save} type="button">
            <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
            {pending ? "Saving..." : "Save draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
