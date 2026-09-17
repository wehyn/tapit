"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";

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
  const publishMutation = useMutation(api.profiles.publish);
  const [links, setLinks] = useState<ProfileLink[] | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | null>(null);
  const navigationSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const registeredSave = useCallback(() => navigationSaveRef.current(), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);

  const currentDraft = useMemo(
    () => ({
      ...profile.draft,
      links: links ?? profile.draft.links.map((link) => ({ ...link, icon: link.icon as LinkIcon })),
    }),
    [links, profile.draft],
  );
  const publishedForValidation = profile.published
    ? {
        ...profile.published,
        links: profile.published.links.map((link) => ({
          ...link,
          icon: link.icon as LinkIcon,
        })),
        publishedAt: new Date(profile.published.publishedAt).toISOString(),
      }
    : null;
  const publicationErrors = validatePublication(currentDraft, publishedForValidation, {
    immutableSlug: profile.published?.slug,
  });
  const validation = useMemo(() => {
    const seen = new Set<string>();
    return currentDraft.links.reduce<Record<string, string>>((result, link) => {
      if (!link.enabled) return result;
      const key = link.destination.trim().toLowerCase();
      if (!link.label.trim())
        result[link.id] = "Add a label so visitors know where this link goes.";
      else {
        const destinationError = validateLinkDestination(link.destination);
        if (destinationError) result[link.id] = destinationError;
      }
      if (key && seen.has(key))
        result[link.id] = "This destination is already used by another link.";
      if (key) seen.add(key);
      return result;
    }, {});
  }, [currentDraft.links]);
  const preview = projectPublicProfile({
    id: "preview",
    ownerId: "preview",
    status: "published",
    draft: currentDraft,
    published: { ...currentDraft, publishedAt: new Date().toISOString() },
  });
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(profile.draft);
  const hasChangesSincePublish = hasUnpublishedChanges(currentDraft, publishedForValidation);
  const publicationLabel =
    profile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const latestLinksRef = useRef(currentDraft.links);

  useEffect(() => {
    latestLinksRef.current = currentDraft.links;
  }, [currentDraft.links]);

  function updateLink(id: string, patch: Partial<ProfileLink>) {
    draftRevisionRef.current += 1;
    setLinks((currentLinks) =>
      (currentLinks ?? currentDraft.links).map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      ),
    );
    setMessage(null);
  }
  function addLink() {
    if (currentDraft.links.length >= 100)
      return setMessage({ tone: "error", text: "A profile cannot contain more than 100 links." });
    draftRevisionRef.current += 1;
    setLinks([
      ...currentDraft.links,
      { id: `link-${Date.now()}`, label: "", destination: "", enabled: true, icon: "link" },
    ]);
    setMessage(null);
  }
  function removeLink(id: string) {
    draftRevisionRef.current += 1;
    setLinks((currentLinks) =>
      (currentLinks ?? currentDraft.links).filter((link) => link.id !== id),
    );
    setMessage(null);
  }
  function moveLink(id: string, direction: -1 | 1) {
    setLinks((currentLinks) => {
      const next = [...(currentLinks ?? currentDraft.links)];
      const index = next.findIndex((link) => link.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= next.length) return currentLinks;
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(nextIndex, 0, moved);
      draftRevisionRef.current += 1;
      return next;
    });
    setMessage(null);
  }
  const persistLinks = useCallback(
    async (linksToSave: ProfileLink[]) => {
      let nextLinks = linksToSave;
      for (let attempt = 0; attempt < MAX_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
        const revisionAtStart = draftRevisionRef.current;
        await saveLinks({ profileId: profile._id, links: nextLinks });
        const latestLinks = latestLinksRef.current;
        if (
          revisionAtStart === draftRevisionRef.current ||
          JSON.stringify(latestLinks) === JSON.stringify(nextLinks)
        )
          return;
        nextLinks = latestLinks;
      }
      throw new Error("Your links changed while they were saving. Try again.");
    },
    [profile._id, saveLinks],
  );
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    if (Object.keys(validation).length > 0) {
      setMessage({ tone: "error", text: "Fix each highlighted link before saving." });
      return false;
    }
    setPendingAction("save");
    try {
      await persistLinks(latestLinksRef.current);
      setLinks(null);
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
  }, [isDirty, persistLinks, validation]);
  useEffect(() => {
    navigationSaveRef.current = saveDraft;
  }, [saveDraft]);

  async function publish() {
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
    setMessage(null);
    try {
      if (isDirty) {
        await persistLinks(latestLinksRef.current);
        setLinks(null);
      }
      await publishMutation({ profileId: profile._id });
      setMessage({
        tone: "success",
        text: "Profile published. Your active card paths now show this version.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be published.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <LinksWorkspace
      profileUrl={`/${currentDraft.slug}`}
      links={currentDraft.links}
      theme={currentDraft.theme ?? "paper"}
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
