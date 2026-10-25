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
  validateProfileRedirect,
  type LinkIcon,
  type ProfileContent,
  type ProfileLink,
  type ProfileRedirect,
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
import { projectDemoPublicProfile } from "@/lib/demo/projection";

import { LinksWorkspace } from "@/components/forms/LinksWorkspace";
import {
  useDraftSaveRegistration,
  useDraftStatusReport,
  type DraftSaveHandler,
  type DraftSaveOutcome,
} from "@/components/layout/DraftSaveContext";
import { Notice } from "@/components/ui/Notice";
import { api } from "../../../convex/_generated/api";

function copyLinks(links: readonly ProfileLink[]): ProfileLink[] {
  return links.map((link) => ({ ...link }));
}

function reorderProfileLinks(
  links: ProfileLink[],
  sourceId: string,
  targetId: string,
  insertAfter: boolean,
): ProfileLink[] {
  const sourceIndex = links.findIndex((link) => link.id === sourceId);
  const targetIndex = links.findIndex((link) => link.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return links;

  let insertionIndex = targetIndex + Number(insertAfter);
  if (sourceIndex < insertionIndex) insertionIndex -= 1;
  if (sourceIndex === insertionIndex) return links;

  const next = [...links];
  const [moved] = next.splice(sourceIndex, 1);
  if (moved === undefined) return links;
  next.splice(insertionIndex, 0, moved);
  return next;
}

const MAX_DRAFT_SAVE_ATTEMPTS = 3;
const MAX_PROFILE_LINKS = 100;
const LINK_ICON_VALUES: readonly LinkIcon[] = [
  "link",
  "mail",
  "phone",
  "calendar",
  "linkedin",
  "instagram",
  "globe",
  "briefcase",
  "images",
  "palette",
  "code",
  "camera",
  "github",
];

type PersistedProfileLink = Omit<ProfileLink, "icon"> & { icon?: string };
type ProfileDraftWithPersistedLinks = Omit<ProfileContent, "links"> & {
  links: readonly PersistedProfileLink[];
};

export function normalizeLinkIcon(value: string | undefined): LinkIcon {
  return value !== undefined && LINK_ICON_VALUES.includes(value as LinkIcon)
    ? (value as LinkIcon)
    : "link";
}

export function canAddProfileLink(linkCount: number): boolean {
  return linkCount < MAX_PROFILE_LINKS;
}

export function appendProfileLink(links: readonly ProfileLink[], id: string): ProfileLink[] {
  if (!canAddProfileLink(links.length)) return [...links];
  return [...links, { id, label: "", destination: "", enabled: true, icon: "link" }];
}

export function normalizeProfileLinks(links: readonly PersistedProfileLink[]): ProfileLink[] {
  return links.map((link) => ({ ...link, icon: normalizeLinkIcon(link.icon) }));
}

export function areProfileLinksEqual(
  currentLinks: readonly ProfileLink[],
  persistedLinks: readonly PersistedProfileLink[],
): boolean {
  return JSON.stringify(currentLinks) === JSON.stringify(normalizeProfileLinks(persistedLinks));
}

export function canPreviewLinks(
  validation: Record<string, string>,
  publicationErrors: readonly string[],
): boolean {
  return Object.keys(validation).length === 0 && publicationErrors.length === 0;
}

function draftWithLinksAndRedirect(
  draft: ProfileDraftWithPersistedLinks,
  links: ProfileLink[],
  redirect: ProfileRedirect,
): ProfileContent {
  return { ...draft, links, redirect };
}

function areProfileRedirectsEqual(
  current: ProfileRedirect,
  persisted: ProfileRedirect | undefined,
): boolean {
  const previous = persisted ?? { enabled: false, destination: "" };
  return current.enabled === previous.enabled && current.destination === previous.destination;
}

function previewForLinks(
  profile: ReturnType<typeof getDemoProfileForSession>,
  links: ProfileLink[],
  redirect: ProfileRedirect,
  legacyTheme: ReturnType<typeof getDemoTheme>,
) {
  const draft = draftWithLinksAndRedirect(profile.draft, links, redirect);
  return projectDemoPublicProfile(profile, draft, legacyTheme);
}

function DemoLinksEditor() {
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const [links, setLinks] = useState<ProfileLink[]>(() => copyLinks(profile.draft.links));
  const [redirect, setRedirect] = useState<ProfileRedirect>(
    () => profile.draft.redirect ?? { enabled: false, destination: "" },
  );
  const serverRedirectRef = useRef(profile.draft.redirect ?? { enabled: false, destination: "" });
  useEffect(() => {
    const incomingRedirect = profile.draft.redirect ?? { enabled: false, destination: "" };
    if (areProfileRedirectsEqual(serverRedirectRef.current, incomingRedirect)) return;
    const hasLocalRedirectEdits = !areProfileRedirectsEqual(redirect, serverRedirectRef.current);
    serverRedirectRef.current = incomingRedirect;
    if (!hasLocalRedirectEdits) setRedirect(incomingRedirect);
  }, [profile.draft.redirect, redirect]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
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

  const legacyTheme = getDemoTheme(state, profile.id);
  const draft = draftWithLinksAndRedirect(profile.draft, links, redirect);
  const redirectError = validateProfileRedirect(redirect);
  const customer = session
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
    ...(state.cards.some(
      (card) =>
        card.profileId === profile.id &&
        card.status === "claimable" &&
        card.claimedAt === undefined,
    )
      ? ["Claim the attached card before publishing this profile."]
      : []),
  ];
  const preview = canPreviewLinks(validation, publicationErrors)
    ? previewForLinks(profile, links, redirect, legacyTheme)
    : null;
  const isDirty =
    !areProfileLinksEqual(links, profile.draft.links) ||
    !areProfileRedirectsEqual(redirect, profile.draft.redirect);
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

  function updateRedirect(next: ProfileRedirect) {
    draftRevisionRef.current += 1;
    setRedirect(next);
    setMessage(null);
  }

  function addLink(details: Pick<ProfileLink, "label" | "destination" | "icon">) {
    if (!canAddProfileLink(links.length))
      return setMessage({ tone: "error", text: "A profile cannot contain more than 100 links." });
    const linkId = `link-${Date.now()}`;
    draftRevisionRef.current += 1;
    setLinks((current) => [...current, { id: linkId, ...details, enabled: true }]);
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

  function reorderLink(sourceId: string, targetId: string, insertAfter: boolean) {
    draftRevisionRef.current += 1;
    setLinks((current) => reorderProfileLinks(current, sourceId, targetId, insertAfter));
    setMessage(null);
  }

  const saveDraft = useCallback(async (): Promise<DraftSaveOutcome> => {
    if (pendingAction !== null) return { kind: "deferred", reason: "pending-save" };
    if (!isDirty) return { kind: "saved" };
    if (Object.keys(validation).length > 0) {
      setMessage({
        tone: "error",
        text: redirect.enabled
          ? "Switch to Tapit profile to fix the highlighted links before saving the draft."
          : "Fix each highlighted link before saving the draft.",
      });
      return {
        kind: "blocked",
        blocker: { kind: "links-validation", messages: Object.values(validation) },
      };
    }
    if (redirectError !== null) {
      setMessage({ tone: "error", text: redirectError });
      return { kind: "blocked", blocker: { kind: "links-validation", messages: [redirectError] } };
    }
    setPendingAction("save");
    try {
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => ({
          ...currentProfile,
          draft: draftWithLinksAndRedirect(currentProfile.draft, copyLinks(links), redirect),
        })),
      );
      setMessage({
        tone: "success",
        text: "Links saved to draft.",
      });
      return { kind: "saved" };
    } catch (error) {
      const text = error instanceof Error ? error.message : "Links could not be saved.";
      setMessage({
        tone: "error",
        text,
      });
      return { kind: "failed", message: text };
    } finally {
      setPendingAction(null);
    }
  }, [isDirty, links, pendingAction, profile.id, redirect, redirectError, validation]);

  useDraftSaveRegistration(saveDraft);
  useDraftStatusReport(pendingAction !== null ? "saving" : isDirty ? "unsaved" : "saved");

  function publish() {
    if (publicationErrors.length > 0 || Object.keys(validation).length > 0) {
      setMessage({
        tone: "error",
        text:
          Object.keys(validation).length > 0
            ? redirect.enabled
              ? "Switch to Tapit profile to fix the highlighted links before publishing."
              : "Fix each highlighted link before publishing."
            : publicationErrors.join(" "),
      });
      return;
    }
    setPendingAction("publish");
    try {
      const nextProfile = {
        ...publishProfile(
          {
            ...profile,
            draft: draftWithLinksAndRedirect(profile.draft, copyLinks(links), redirect),
          },
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
      redirect={redirect}
      redirectError={redirectError}
      preview={preview}
      validation={validation}
      publicationErrors={publicationErrors}
      message={message}
      pendingAction={pendingAction}
      isDirty={isDirty}
      hasUnpublishedChanges={hasChangesSincePublish}
      publicationLabel={publicationLabel}
      onUpdateLink={updateLink}
      onRedirectChange={updateRedirect}
      onAddLink={addLink}
      onMoveLink={moveLink}
      onReorderLink={reorderLink}
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

export function LiveLinksEditorContent({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useQuery<typeof api.profiles.mine>>>;
}) {
  const saveLinks = useMutation(api.links.replaceDraft);
  const publishMutation = useMutation(api.profiles.publish);
  const [links, setLinks] = useState<ProfileLink[] | null>(null);
  const [redirect, setRedirect] = useState<ProfileRedirect>(
    () => profile.draft.redirect ?? { enabled: false, destination: "" },
  );
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | null>(null);
  const navigationSaveRef = useRef<DraftSaveHandler>(async () => ({ kind: "saved" }));
  const registeredSave = useCallback((href?: string) => navigationSaveRef.current(href), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);
  const serverDraftRevisionRef = useRef(profile.draftRevision ?? 0);
  const serverDraftProfileIdRef = useRef(profile._id);
  const serverRedirectRef = useRef(profile.draft.redirect ?? { enabled: false, destination: "" });

  const currentDraft = useMemo(
    () =>
      draftWithLinksAndRedirect(
        profile.draft,
        links ?? normalizeProfileLinks(profile.draft.links),
        redirect,
      ),
    [links, profile.draft, redirect],
  );
  const normalizedDraftLinks = useMemo(
    () => normalizeProfileLinks(profile.draft.links),
    [profile.draft.links],
  );
  const publishedForValidation = profile.published
    ? {
        ...profile.published,
        links: normalizeProfileLinks(profile.published.links),
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
  const preview = canPreviewLinks(validation, publicationErrors)
    ? projectPublicProfile({
        id: "preview",
        ownerId: "preview",
        status: "published",
        draft: currentDraft,
        published: { ...currentDraft, publishedAt: new Date().toISOString() },
      })
    : null;
  const hasLocalLinkEdits = !areProfileLinksEqual(currentDraft.links, profile.draft.links);
  const isDirty = hasLocalLinkEdits || !areProfileRedirectsEqual(redirect, profile.draft.redirect);
  useDraftStatusReport(pendingAction !== null ? "saving" : isDirty ? "unsaved" : "saved");
  useEffect(() => {
    const incomingRevision = profile.draftRevision ?? 0;
    const incomingRedirect = profile.draft.redirect ?? { enabled: false, destination: "" };
    if (serverDraftProfileIdRef.current !== profile._id) {
      serverDraftProfileIdRef.current = profile._id;
      serverDraftRevisionRef.current = incomingRevision;
      serverRedirectRef.current = incomingRedirect;
      setRedirect(incomingRedirect);
      return;
    }
    // Compare against the last server value we observed, not the incoming one, so a
    // redirect saved elsewhere is not mistaken for a local edit.
    const hasLocalRedirectEdits = !areProfileRedirectsEqual(redirect, serverRedirectRef.current);
    if (
      !hasLocalLinkEdits &&
      !hasLocalRedirectEdits &&
      incomingRevision >= serverDraftRevisionRef.current
    )
      serverDraftRevisionRef.current = incomingRevision;
    if (!areProfileRedirectsEqual(serverRedirectRef.current, incomingRedirect)) {
      serverRedirectRef.current = incomingRedirect;
      if (!hasLocalRedirectEdits) setRedirect(incomingRedirect);
    }
  }, [hasLocalLinkEdits, profile._id, profile.draft.redirect, profile.draftRevision, redirect]);
  const hasChangesSincePublish = hasUnpublishedChanges(currentDraft, publishedForValidation);
  const publicationLabel =
    profile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const latestLinksRef = useRef(currentDraft.links);
  const latestRedirectRef = useRef(redirect);

  useEffect(() => {
    latestLinksRef.current = currentDraft.links;
  }, [currentDraft.links]);

  useEffect(() => {
    latestRedirectRef.current = redirect;
  }, [redirect]);

  function updateLink(id: string, patch: Partial<ProfileLink>) {
    draftRevisionRef.current += 1;
    setLinks((currentLinks) =>
      (currentLinks ?? currentDraft.links).map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      ),
    );
    setMessage(null);
  }

  function updateRedirect(next: ProfileRedirect) {
    draftRevisionRef.current += 1;
    latestRedirectRef.current = next;
    setRedirect(next);
    setMessage(null);
  }
  function addLink(details: Pick<ProfileLink, "label" | "destination" | "icon">) {
    if (!canAddProfileLink(currentDraft.links.length))
      return setMessage({ tone: "error", text: "A profile cannot contain more than 100 links." });
    const linkId = `link-${Date.now()}`;
    draftRevisionRef.current += 1;
    setLinks((currentLinks) => [
      ...(currentLinks ?? normalizedDraftLinks),
      { id: linkId, ...details, enabled: true },
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

  function reorderLink(sourceId: string, targetId: string, insertAfter: boolean) {
    draftRevisionRef.current += 1;
    setLinks((currentLinks) =>
      reorderProfileLinks(currentLinks ?? normalizedDraftLinks, sourceId, targetId, insertAfter),
    );
    setMessage(null);
  }

  const persistLinks = useCallback(
    async (linksToSave: ProfileLink[], redirectToSave: ProfileRedirect) => {
      let nextLinks = linksToSave;
      let nextRedirect = redirectToSave;
      for (let attempt = 0; attempt < MAX_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
        const revisionAtStart = draftRevisionRef.current;
        const result = await saveLinks({
          profileId: profile._id,
          links: nextLinks,
          ...(!areProfileRedirectsEqual(nextRedirect, serverRedirectRef.current)
            ? { redirect: nextRedirect }
            : {}),
          expectedDraftRevision: serverDraftRevisionRef.current,
        });
        serverDraftRevisionRef.current = result.draftRevision;
        serverRedirectRef.current = nextRedirect;
        const latestLinks = latestLinksRef.current;
        if (revisionAtStart === draftRevisionRef.current) return;
        nextLinks = latestLinks;
        nextRedirect = latestRedirectRef.current;
      }
      throw new Error("Your links changed while they were saving. Try again.");
    },
    [profile._id, saveLinks],
  );
  const saveDraft = useCallback(async (): Promise<DraftSaveOutcome> => {
    if (pendingAction !== null) return { kind: "deferred", reason: "pending-save" };
    if (!isDirty) return { kind: "saved" };
    if (Object.keys(validation).length > 0) {
      setMessage({
        tone: "error",
        text: redirect.enabled
          ? "Switch to Tapit profile to fix the highlighted links before saving."
          : "Fix each highlighted link before saving.",
      });
      return {
        kind: "blocked",
        blocker: { kind: "links-validation", messages: Object.values(validation) },
      };
    }
    const redirectError = validateProfileRedirect(redirect);
    if (redirectError !== null) {
      setMessage({ tone: "error", text: redirectError });
      return { kind: "blocked", blocker: { kind: "links-validation", messages: [redirectError] } };
    }
    setPendingAction("save");
    try {
      await persistLinks(latestLinksRef.current, latestRedirectRef.current);
      setLinks(null);
      setMessage({
        tone: "success",
        text: "Links saved to draft.",
      });
      return { kind: "saved" };
    } catch (error) {
      const text = error instanceof Error ? error.message : "Links could not be saved.";
      setMessage({
        tone: "error",
        text,
      });
      return { kind: "failed", message: text };
    } finally {
      setPendingAction(null);
    }
  }, [isDirty, pendingAction, persistLinks, redirect, validation]);
  useEffect(() => {
    navigationSaveRef.current = saveDraft;
  }, [saveDraft]);

  async function publish() {
    if (publicationErrors.length > 0 || Object.keys(validation).length > 0) {
      setMessage({
        tone: "error",
        text:
          Object.keys(validation).length > 0
            ? redirect.enabled
              ? "Switch to Tapit profile to fix the highlighted links before publishing."
              : "Fix each highlighted link before publishing."
            : publicationErrors.join(" "),
      });
      return;
    }
    setPendingAction("publish");
    setMessage(null);
    try {
      if (isDirty) {
        await persistLinks(latestLinksRef.current, latestRedirectRef.current);
        setLinks(null);
      }
      await publishMutation({
        profileId: profile._id,
        expectedImageRevision: profile.imageRevision ?? 0,
        expectedMediaRevision: profile.mediaRevision ?? 0,
      });
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
      redirect={redirect}
      redirectError={validateProfileRedirect(redirect)}
      preview={preview}
      validation={validation}
      publicationErrors={publicationErrors}
      message={message}
      pendingAction={pendingAction}
      isDirty={isDirty}
      hasUnpublishedChanges={hasChangesSincePublish}
      publicationLabel={publicationLabel}
      onUpdateLink={updateLink}
      onRedirectChange={updateRedirect}
      onAddLink={addLink}
      onMoveLink={moveLink}
      onReorderLink={reorderLink}
      onRemoveLink={removeLink}
      onSaveDraft={saveDraft}
      onPublish={publish}
    />
  );
}
