"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import NextImage from "next/image";
import { CheckCircleIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import {
  hasUnpublishedChanges,
  projectPublicProfile,
  publishProfile,
  validateLinkDestination,
  validatePublication,
  validatePublicationAccess,
  type ProfileContent,
  type ProfileTheme,
} from "@/lib/domain";
import {
  getDemoProfileForSession,
  getDemoProfiles,
  getDemoTheme,
  updateDemoProfile,
  updateDemoTheme,
  useDemoSession,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";
import { projectDemoPublicProfile } from "@/lib/demo/projection";
import { prepareProfileImageCrop, validateProfileImageFile, type Crop } from "@/lib/profile-image";
import {
  stripProfileMediaUrls,
  validateProfileMedia,
  type ProfileMediaImage,
  type ProfileMediaPresentation,
} from "@/lib/profile-media";
import {
  mergePendingProfileMediaPreview,
  type PendingProfileMediaUpload,
} from "@/lib/profile-media-preview";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ProfileCustomizationEditor } from "@/components/forms/ProfileCustomizationEditor";
import { ProfileDetailsEditor } from "@/components/forms/ProfileDetailsEditor";
import { ProfilePublicationPanel } from "@/components/forms/ProfilePublicationPanel";
import { ProfileWorkspaceFrame } from "@/components/forms/ProfileWorkspaceFrame";
import { MissingProfilePage } from "@/components/state/StatePage";
import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";
import { useDraftSaveLink, useDraftSaveRegistration } from "@/components/layout/DraftSaveContext";
import { splitProfileWorkspaceErrors } from "@/lib/profile-workspace";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function profileForPreview(
  draft: ProfileContent,
  legacyTheme: ProfileTheme | undefined,
  pendingMedia: PendingProfileMediaUpload | null,
) {
  const projected =
    legacyTheme !== undefined
      ? projectDemoPublicProfile(
          {
            id: "preview",
            ownerId: "preview",
            status: "published",
            theme: legacyTheme,
            draft,
            published: null,
          },
          draft,
          legacyTheme,
          { allowIncompleteMedia: true },
        )
      : projectPublicProfile(
          {
            id: "preview",
            ownerId: "preview",
            status: "published",
            draft,
            published: { ...draft, publishedAt: new Date().toISOString() },
          },
          { allowIncompleteMedia: true },
        );

  return projected === null ? null : mergePendingProfileMediaPreview(projected, pendingMedia);
}

const MAX_DRAFT_SAVE_ATTEMPTS = 3;
const PENDING_MEDIA_MESSAGE =
  "Your image is still uploading. Save and publish will be available when it finishes.";
const FAILED_MEDIA_MESSAGE =
  "Your image upload failed. Retry or discard it before saving or publishing.";
const DEMO_MEDIA_UPLOAD_DELAY_KEY = "tapit:e2e-media-upload-delay-ms";
const DEMO_MEDIA_UPLOAD_FAILURE_KEY = "tapit:e2e-media-upload-failure";

export type ProfileEditorView = "profile" | "customize";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read. Try again."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That image could not be converted. Try again."));
    reader.readAsDataURL(file);
  });
}

function demoMediaAssetId(requestId: number): ProfileMediaImage["assetId"] {
  return `demo-media-${Date.now()}-${requestId}` as ProfileMediaImage["assetId"];
}

function demoMediaUploadControls() {
  if (process.env.NODE_ENV === "production") return { delayMs: 0, fail: false };

  const delayMs = Number(window.localStorage.getItem(DEMO_MEDIA_UPLOAD_DELAY_KEY));
  return {
    delayMs: Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0,
    fail: window.localStorage.getItem(DEMO_MEDIA_UPLOAD_FAILURE_KEY) === "true",
  };
}

function DraftSaveButtonLink({ children, href }: { children: React.ReactNode; href: string }) {
  const onClick = useDraftSaveLink(href);
  return (
    <ButtonLink href={href} onClick={onClick}>
      {children}
    </ButtonLink>
  );
}

function PendingMediaUploadStatus({ pending }: { pending: PendingProfileMediaUpload | null }) {
  if (pending?.state !== "uploading") return null;
  return (
    <p aria-live="polite" className="text-sm font-medium text-tapit-muted" role="status">
      Uploading image… Keep this page open.
    </p>
  );
}

function unresolvedMediaMessage(pending: PendingProfileMediaUpload | null) {
  return pending?.state === "error" ? FAILED_MEDIA_MESSAGE : PENDING_MEDIA_MESSAGE;
}

function needsLinkOnboarding(draft: ProfileContent, published: ProfileContent | null | undefined) {
  return (
    published == null &&
    !draft.links.some(
      (link) =>
        link.enabled && link.label.trim().length > 0 && !validateLinkDestination(link.destination),
    )
  );
}

function DemoProfileEditor({ view }: { view: ProfileEditorView }) {
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const theme = getDemoTheme(state, profile.id);
  const [draft, setDraft] = useState<ProfileContent>(() => ({
    ...profile.draft,
    links: profile.draft.links.map((link) => ({ ...link })),
  }));
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pendingMediaPreview, setPendingMediaPreview] = useState<PendingProfileMediaUpload | null>(
    null,
  );
  const hasUnresolvedMedia = mediaBusy || pendingMediaPreview !== null;
  const [mediaError, setMediaError] = useState("");
  const [imagePending, setImagePending] = useState(false);
  const imageRequestRef = useRef(0);
  const mediaRequestRef = useRef(0);
  const cancelMediaUpload = useCallback(() => {
    mediaRequestRef.current += 1;
    setMediaBusy(false);
    setMediaError("");
  }, []);
  useEffect(() => {
    if (!hasUnresolvedMedia) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnresolvedMedia]);
  useEffect(
    () => () => {
      imageRequestRef.current += 1;
      mediaRequestRef.current += 1;
    },
    [],
  );
  const errors = (() => {
    const customer =
      session?.role === "customer"
        ? state.customers.find((candidate) => candidate.email === session.email)
        : undefined;
    const lifecycleErrors = customer
      ? validatePublicationAccess(profile.status, customer.status, customer.deletionStatus)
      : [];
    return [
      ...validatePublication(draft, profile.published, {
        immutableSlug: profile.draft.slug,
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
  })();
  const { profile: profileErrors, customization: customizationErrors } =
    splitProfileWorkspaceErrors(errors);
  const mediaErrors = validateProfileMedia(draft.media);
  const preview = profileForPreview(draft, theme, pendingMediaPreview);
  const slugLocked = profile.published !== null;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(profile.draft);
  const hasChangesSincePublish = hasUnpublishedChanges(draft, profile.published);
  const publicationLabel =
    profile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const publicationState = isDirty
    ? "Unsaved draft changes"
    : profile.status === "published" && hasChangesSincePublish
      ? "Changes ready to publish"
      : "Draft saved";

  function updateField<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  function chooseTheme(themeOption: "paper" | "moss" | "night") {
    try {
      updateDemoState((current) => updateDemoTheme(current, profile.id, themeOption));
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Theme could not be saved.",
      });
    }
  }

  async function saveDraft() {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return false;
    }
    if (mediaErrors.length > 0) {
      setMessage({ tone: "error", text: mediaErrors.join(" ") });
      return false;
    }
    if (cropFile !== null || imagePending) return false;
    if (!isDirty) return true;
    try {
      let assignedSlug = profile.draft.slug;
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => {
          assignedSlug = currentProfile.draft.slug;
          return {
            ...currentProfile,
            draft: { ...draft, slug: currentProfile.draft.slug },
          };
        }),
      );
      const slugWasRefreshed = draft.slug !== assignedSlug;
      if (slugWasRefreshed) setDraft((current) => ({ ...current, slug: assignedSlug }));
      setMessage({
        tone: "success",
        text: slugWasRefreshed
          ? "Draft saved. The assigned profile slug was refreshed and is managed by an administrator."
          : "Draft saved. Visitors still see the last published version.",
      });
      return true;
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Draft could not be saved.",
      });
      return false;
    }
  }

  useDraftSaveRegistration(saveDraft);

  function publish() {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return;
    }
    if (cropFile !== null || imagePending) return;
    if (errors.length > 0) {
      setMessage({ tone: "error", text: errors.join(" ") });
      return;
    }
    try {
      const occurredAt = new Date().toISOString();
      updateDemoState((current) => {
        const currentProfile = getDemoProfiles(current).find(
          (candidate) => candidate.id === profile.id,
        );
        if (currentProfile === undefined) throw new Error("Profile could not be found.");
        if (draft.slug !== currentProfile.draft.slug)
          throw new Error(
            "The assigned profile slug cannot change except through an administrator.",
          );
        const publishedProfile = publishProfile({ ...currentProfile, draft }, occurredAt, {
          existingSlugs: getDemoProfiles(current)
            .filter((candidate) => candidate.id !== profile.id)
            .flatMap((candidate) => [
              candidate.draft.slug,
              ...(candidate.published === null ? [] : [candidate.published.slug]),
            ]),
        });
        const nextProfile = {
          ...publishedProfile,
          published:
            publishedProfile.published === null
              ? null
              : {
                  ...publishedProfile.published,
                  ...(draft.media === undefined ? {} : { media: structuredClone(draft.media) }),
                },
          theme: currentProfile.theme,
        };
        return {
          ...updateDemoProfile(current, profile.id, () => nextProfile),
          cards: current.cards.map((card) =>
            card.profileId === profile.id &&
            card.status === "claimable" &&
            card.claimedAt !== undefined
              ? { ...card, status: "active" }
              : card,
          ),
          audits: [
            {
              id: `audit-${Date.now()}`,
              actor: session?.email ?? profile.draft.name,
              action: "profile.published",
              target: draft.slug,
              occurredAt,
              after: "published",
            },
            ...current.audits,
          ],
        };
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
    }
  }

  function unpublish() {
    try {
      updateDemoState((current) => ({
        ...updateDemoProfile(current, profile.id, (currentProfile) => ({
          ...currentProfile,
          status: "unpublished",
        })),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: session?.email ?? profile.draft.name,
            action: "profile.unpublished",
            target: profile.draft.slug,
            occurredAt: new Date().toISOString(),
            before: "published",
            after: "unpublished",
          },
          ...current.audits,
        ],
      }));
      setMessage({
        tone: "success",
        text: "Profile unpublished. Visitors now see the unavailable page.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be unpublished.",
      });
    }
  }

  function copyUrl() {
    const url = `${window.location.origin}/${draft.slug}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => setCopyMessage("Copied"),
        () => setCopyMessage(url),
      );
    } else setCopyMessage(url);
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateProfileImageFile(file);
    if (validationError) return setImageError(validationError);
    setImageError("");
    setImageApplied(false);
    imageRequestRef.current += 1;
    setCropFile(file);
  }

  async function applyDemoCrop(crop: Crop) {
    if (cropFile === null || imagePending) return;
    const requestId = imageRequestRef.current;
    setImagePending(true);
    try {
      const prepared = await prepareProfileImageCrop(cropFile, crop);
      const dataUrl = await readFileAsDataUrl(
        new File([prepared.blob], cropFile.name, { type: prepared.contentType }),
      );

      if (requestId !== imageRequestRef.current) return;
      updateField("imageUrl", dataUrl);
      setCropFile(null);
      setImageApplied(true);
    } catch (error) {
      if (requestId === imageRequestRef.current)
        setImageError(error instanceof Error ? error.message : "The image crop failed. Try again.");
    } finally {
      if (requestId === imageRequestRef.current) setImagePending(false);
    }
  }

  async function uploadDemoMedia(file: File): Promise<ProfileMediaImage> {
    const requestId = ++mediaRequestRef.current;
    setMediaBusy(true);
    setMediaError("");
    try {
      const { delayMs, fail } = demoMediaUploadControls();
      if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      if (fail) throw new Error("The media upload failed. Try again.");
      const url = await readFileAsDataUrl(file);
      if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
      return { assetId: demoMediaAssetId(requestId), altText: "", url, previewUrl: url };
    } catch (error) {
      const text = error instanceof Error ? error.message : "The media upload failed. Try again.";
      if (requestId === mediaRequestRef.current) setMediaError(text);
      throw error;
    } finally {
      if (requestId === mediaRequestRef.current) setMediaBusy(false);
    }
  }

  const imageContent = (
    <div className="border-t border-tapit-line/70 pt-5">
      <p className="text-sm font-semibold text-tapit-ink">Profile photo or logo</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-tapit-accent-soft text-3xl font-semibold text-tapit-accent">
          {draft.imageUrl ? (
            <NextImage
              alt={`${draft.name} profile`}
              className="size-full object-cover"
              height={80}
              src={draft.imageUrl}
              unoptimized
              width={80}
            />
          ) : (
            draft.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <label
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            htmlFor="profile-image"
          >
            <UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />
            {imagePending ? "Preparing..." : "Change photo"}
          </label>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile photo or logo"
            className="sr-only"
            disabled={cropFile !== null || imagePending}
            id="profile-image"
            onChange={chooseImage}
            type="file"
          />
          <p className="mt-2 text-xs leading-5 text-tapit-muted">JPG, PNG, or WebP. Max 5 MB.</p>
        </div>
      </div>
      {imageError ? (
        <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
          {imageError}
        </p>
      ) : null}
      {imageApplied ? (
        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#17352b]"
          role="status"
          aria-label="Photo applied"
        >
          <CheckCircleIcon aria-hidden="true" size={16} weight="fill" />
          Photo applied
        </p>
      ) : null}
    </div>
  );

  return (
    <ProfileWorkspaceFrame
      controls={
        view === "profile" ? (
          <>
            <ProfileDetailsEditor
              customization={draft.customization}
              copyMessage={copyMessage}
              draft={draft}
              errors={profileErrors}
              imageContent={imageContent}
              links={draft.links}
              message={message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
              onChange={updateField}
              onCustomizationChange={(customization) => updateField("customization", customization)}
              onCopyUrl={copyUrl}
              onboarding={
                needsLinkOnboarding(draft, profile.published) ? (
                  <Notice>
                    Your profile link is ready. Add a Portfolio, TikTok, or contact link, then
                    publish it.
                    <span className="mt-3 block">
                      <DraftSaveButtonLink href="/app/links">
                        Add your first link
                      </DraftSaveButtonLink>
                    </span>
                  </Notice>
                ) : null
              }
              slugLocked={slugLocked}
            />
            <ProfilePublicationPanel
              customizationErrors={customizationErrors}
              errors={profileErrors}
              hasChangesSincePublish={hasChangesSincePublish}
              onOpenCustomize={
                <DraftSaveButtonLink href="/app/customize">Open Customize</DraftSaveButtonLink>
              }
              onUnpublish={profile.status === "published" ? unpublish : undefined}
              publicationState={publicationState}
              status={profile.status}
            />
          </>
        ) : (
          <>
            {profileErrors.length > 0 ? (
              <Notice tone="error">
                <ul className="grid gap-2">
                  {profileErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <span className="mt-3 block">
                  <DraftSaveButtonLink href="/app/profile">Open Profile</DraftSaveButtonLink>
                </span>
              </Notice>
            ) : null}
            <PendingMediaUploadStatus pending={pendingMediaPreview} />
            {draft.customization === undefined ? (
              <Panel className="shadow-none" title="Legacy appearance">
                <ProfileCustomizationEditor
                  customization={draft.customization}
                  errors={customizationErrors}
                  media={draft.media}
                  mediaBusy={mediaBusy}
                  mediaError={mediaError}
                  onChange={(customization) => updateField("customization", customization)}
                  onMediaErrorClear={() => setMediaError("")}
                  onMediaUploadCancel={cancelMediaUpload}
                  onMediaPendingPreviewChange={setPendingMediaPreview}
                  onMediaChange={(media) => updateField("media", media)}
                  onMediaUpload={uploadDemoMedia}
                  onThemeChange={chooseTheme}
                  theme={theme}
                />
              </Panel>
            ) : (
              <ProfileCustomizationEditor
                customization={draft.customization}
                errors={customizationErrors}
                media={draft.media}
                mediaBusy={mediaBusy}
                mediaError={mediaError}
                onChange={(customization) => updateField("customization", customization)}
                onMediaErrorClear={() => setMediaError("")}
                onMediaUploadCancel={cancelMediaUpload}
                onMediaPendingPreviewChange={setPendingMediaPreview}
                onMediaChange={(media) => updateField("media", media)}
                onMediaUpload={uploadDemoMedia}
                onThemeChange={chooseTheme}
                theme={theme}
              />
            )}
          </>
        )
      }
      message={
        view === "customize" && message ? <Notice tone={message.tone}>{message.text}</Notice> : null
      }
      cropDialog={
        cropFile !== null ? (
          <ProfileImageCropDialog
            busy={imagePending}
            file={cropFile}
            onApply={(crop) => void applyDemoCrop(crop)}
            onCancel={() => {
              imageRequestRef.current += 1;
              setCropFile(null);
            }}
          />
        ) : null
      }
      description={
        view === "profile"
          ? "Edit your details and see how your profile looks to others."
          : "Tune the look and feel of your public profile."
      }
      onPreviewModeChange={setPreviewMode}
      onPublish={publish}
      onSave={() => void saveDraft()}
      preview={preview}
      previewMode={previewMode}
      profileUrl={`/${draft.slug}`}
      hasDraftChanges={isDirty || hasChangesSincePublish || hasUnresolvedMedia}
      publishDisabled={
        errors.length > 0 ||
        publicationLabel === "Published" ||
        cropFile !== null ||
        imagePending ||
        hasUnresolvedMedia
      }
      publishLabel={publicationLabel}
      saveDisabled={
        !isDirty ||
        mediaErrors.length > 0 ||
        cropFile !== null ||
        imagePending ||
        hasUnresolvedMedia
      }
      title={view === "profile" ? "Your profile" : "Customize your profile"}
      draftStatus={publicationState}
    />
  );
}

export function ProfileEditor({ view = "profile" }: { view?: ProfileEditorView } = {}) {
  return !isLocalDemoMode() ? <LiveProfileEditor view={view} /> : <DemoProfileEditor view={view} />;
}

function LiveProfileEditor({ view }: { view: ProfileEditorView }) {
  const profile = useQuery(api.profiles.mine);
  if (profile === undefined) return <ProfileEditorLoading />;
  if (profile === null) return <MissingProfilePage />;
  return <LiveProfileEditorContent profile={profile} view={view} />;
}

function LiveProfileEditorContent({
  profile,
  view,
}: {
  profile: NonNullable<ReturnType<typeof useQuery<typeof api.profiles.mine>>>;
  view: ProfileEditorView;
}) {
  const saveDraftMutation = useMutation(api.profiles.saveDraft);
  const publishMutation = useMutation(api.profiles.publish);
  const setStatusMutation = useMutation(api.profiles.setStatus);
  const removeImage = useMutation(api.storage.removeImage);
  const authToken = useAuthToken();
  const [draft, setDraft] = useState<ProfileContent | null>(null);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<"save" | "publish" | "image" | null>(null);
  const [imageError, setImageError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pendingMediaPreview, setPendingMediaPreview] = useState<PendingProfileMediaUpload | null>(
    null,
  );
  const hasUnresolvedMedia = mediaBusy || pendingMediaPreview !== null;
  const [mediaError, setMediaError] = useState("");
  const navigationSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const registeredSave = useCallback(() => navigationSaveRef.current(), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);
  const imageRequestRef = useRef(0);
  const liveProfile = profile as typeof profile & {
    draft: ProfileContent;
    published?: ProfileContent & { publishedAt: number };
  };
  const imageRevisionRef = useRef(liveProfile.imageRevision ?? 0);
  const mediaRevisionRef = useRef(liveProfile.mediaRevision ?? 0);
  const mediaRequestRef = useRef(0);
  const mediaAbortControllerRef = useRef<AbortController | null>(null);
  const cancelMediaUpload = useCallback(() => {
    const controller = mediaAbortControllerRef.current;
    mediaRequestRef.current += 1;
    mediaAbortControllerRef.current = null;
    controller?.abort();
    setMediaBusy(false);
    setMediaError("");
  }, []);
  useEffect(() => {
    if (!hasUnresolvedMedia) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnresolvedMedia]);

  useEffect(
    () => () => {
      imageRequestRef.current += 1;
      cancelMediaUpload();
    },
    [cancelMediaUpload],
  );
  const currentDraft = useMemo<ProfileContent>(() => {
    const assignedSlug = liveProfile.slug ?? liveProfile.draft.slug;
    const current = draft ?? {
      ...liveProfile.draft,
      links: liveProfile.draft.links.map((link) => ({
        ...link,
        icon: link.icon as ProfileContent["links"][number]["icon"],
      })),
    };
    return current.slug === assignedSlug ? current : { ...current, slug: assignedSlug };
  }, [draft, liveProfile.draft, liveProfile.slug]);
  const theme: ProfileTheme = currentDraft.theme ?? "paper";
  const publishedForValidation = liveProfile.published
    ? {
        ...liveProfile.published,
        links: liveProfile.published.links.map((link) => ({
          ...link,
          icon: link.icon as ProfileContent["links"][number]["icon"],
        })),
        publishedAt: new Date(liveProfile.published.publishedAt).toISOString(),
      }
    : null;
  const errors = validatePublication(currentDraft, publishedForValidation, {
    immutableSlug: liveProfile.slug,
  });
  const mediaErrors = validateProfileMedia(currentDraft.media);
  const { profile: profileErrors, customization: customizationErrors } =
    splitProfileWorkspaceErrors(errors);
  const preview = profileForPreview(currentDraft, undefined, pendingMediaPreview);
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(liveProfile.draft);
  const slugLocked = true;
  const hasChangesSincePublish = hasUnpublishedChanges(currentDraft, publishedForValidation);
  const publicationLabel =
    liveProfile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const publicationState = isDirty
    ? "Unsaved draft changes"
    : liveProfile.status === "published" && hasChangesSincePublish
      ? "Changes ready to publish"
      : "Draft saved";
  const latestDraftRef = useRef(currentDraft);

  useEffect(() => {
    latestDraftRef.current = currentDraft;
  }, [currentDraft]);

  function updateField<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    draftRevisionRef.current += 1;
    setDraft((value_) => ({ ...(value_ ?? currentDraft), [field]: value }));
    setMessage(null);
  }

  function copyUrl() {
    const url = `${window.location.origin}/${currentDraft.slug}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => setCopyMessage("Copied"),
        () => setCopyMessage(url),
      );
    } else setCopyMessage(url);
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateProfileImageFile(file);
    if (validationError) {
      setImageError(validationError);
      return;
    }
    setImageError("");
    setImageApplied(false);
    imageRequestRef.current += 1;
    setCropFile(file);
  }

  async function applyImageCrop(crop: Crop) {
    if (cropFile === null || pending !== null) return;
    const requestId = imageRequestRef.current;
    setPending("image");
    setImageError("");
    try {
      if (authToken === null) throw new Error("Authentication is required to upload a photo.");
      const prepared = await prepareProfileImageCrop(cropFile, crop);
      if (requestId !== imageRequestRef.current) return;
      const siteUrl = requirePairedConvexSiteUrl(
        process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
      );
      const response = await fetch(`${siteUrl}/profile-image-upload`, {
        method: "POST",
        body: prepared.blob,
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": prepared.contentType,
          "X-Image-Revision": String(imageRevisionRef.current),
          "X-Profile-Id": liveProfile._id,
        },
      });
      if (!response.ok)
        throw new Error((await response.text()) || "The image upload failed. Choose another file.");
      const uploaded = parseImageUploadResponse(await response.json());
      if (requestId !== imageRequestRef.current) return;
      imageRevisionRef.current = uploaded.imageRevision;
      draftRevisionRef.current += 1;
      setDraft((current) => {
        return {
          ...(current ?? latestDraftRef.current),
          imageStorageId: uploaded.storageId,
          imageUrl: uploaded.imageUrl,
        };
      });
      setCropFile(null);
      setImageApplied(true);
    } catch (error) {
      if (requestId === imageRequestRef.current)
        setImageError(
          error instanceof Error ? error.message : "The image upload failed. Try again.",
        );
    } finally {
      if (requestId === imageRequestRef.current) setPending(null);
    }
  }

  async function clearImage() {
    if (pending !== null) return;
    setPending("image");
    setImageError("");
    setImageApplied(false);
    try {
      const result = await removeImage({
        profileId: liveProfile._id,
        expectedImageRevision: imageRevisionRef.current,
      });
      imageRevisionRef.current = result.imageRevision;
      draftRevisionRef.current += 1;
      setDraft((current) => {
        const next = { ...(current ?? latestDraftRef.current) };
        delete next.imageStorageId;
        delete next.imageUrl;
        return next;
      });
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "The image could not be removed. Try again.",
      );
    } finally {
      setPending(null);
    }
  }

  async function uploadLiveMedia(
    file: File,
    target: "background" | "slideshow",
  ): Promise<ProfileMediaImage> {
    void target;
    const requestId = ++mediaRequestRef.current;
    mediaAbortControllerRef.current?.abort();
    const controller = new AbortController();
    mediaAbortControllerRef.current = controller;
    setMediaBusy(true);
    setMediaError("");
    try {
      if (authToken === null) throw new Error("Authentication is required to upload media.");
      const siteUrl = requirePairedConvexSiteUrl(
        process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
        process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
      );
      const response = await fetch(`${siteUrl}/profile-media-upload`, {
        method: "POST",
        body: file,
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": file.type,
          "X-Media-Revision": String(mediaRevisionRef.current),
          "X-Profile-Id": liveProfile._id,
        },
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error((await response.text()) || "The media upload failed. Choose another file.");
      const uploaded = parseMediaUploadResponse(await response.json());
      if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
      mediaRevisionRef.current = uploaded.mediaRevision;
      return uploaded;
    } catch (error) {
      const wasCanceled =
        requestId !== mediaRequestRef.current ||
        (error instanceof Error && error.name === "AbortError");
      if (wasCanceled) throw error;
      const text = error instanceof Error ? error.message : "The media upload failed. Try again.";
      setMediaError(text);
      throw error;
    } finally {
      if (requestId === mediaRequestRef.current) {
        mediaAbortControllerRef.current = null;
        setMediaBusy(false);
      }
    }
  }

  function draftForPersistence(
    content: ProfileContent,
  ): ProfileContent & { media?: ProfileMediaPresentation | null } {
    const persistedDraft = { ...content };
    delete persistedDraft.imageUrl;
    if (content.media === undefined) {
      if (liveProfile.draft.media !== undefined) {
        return { ...persistedDraft, media: null } as unknown as ProfileContent & {
          media?: ProfileMediaPresentation | null;
        };
      }
      delete persistedDraft.media;
    } else {
      const strippedMedia = stripProfileMediaUrls(content.media);
      if (strippedMedia === undefined) {
        if (liveProfile.draft.media !== undefined)
          return { ...persistedDraft, media: null } as unknown as ProfileContent & {
            media?: ProfileMediaPresentation | null;
          };
        delete persistedDraft.media;
      } else {
        persistedDraft.media = strippedMedia;
      }
    }
    return persistedDraft;
  }

  async function saveDraft(keepPublishPending = false): Promise<boolean> {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return false;
    }
    if (mediaErrors.length > 0) {
      setMessage({ tone: "error", text: mediaErrors.join(" ") });
      return false;
    }
    if (!keepPublishPending && (pending !== null || cropFile !== null)) return false;
    if (!isDirty) return true;
    setPending(keepPublishPending ? "publish" : "save");
    setMessage(null);
    try {
      let draftToSave = latestDraftRef.current;
      for (let attempt = 0; attempt < MAX_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
        const revisionAtStart = draftRevisionRef.current;
        const result = await saveDraftMutation({
          profileId: liveProfile._id,
          draft: draftForPersistence(draftToSave),
          expectedImageRevision: imageRevisionRef.current,
          expectedMediaRevision: mediaRevisionRef.current,
        });
        imageRevisionRef.current = result.imageRevision;
        const latestDraft = latestDraftRef.current;
        if (
          revisionAtStart === draftRevisionRef.current ||
          JSON.stringify(latestDraft) === JSON.stringify(draftToSave)
        ) {
          setDraft(null);
          setMessage({
            tone: "success",
            text: "Draft saved. Visitors still see the last published version.",
          });
          return true;
        }
        draftToSave = latestDraft;
      }
      throw new Error("Your draft changed while it was saving. Try again.");
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Draft could not be saved.",
      });
      return false;
    } finally {
      if (!keepPublishPending) setPending(null);
    }
  }

  useEffect(() => {
    navigationSaveRef.current = saveDraft;
  });

  async function publish() {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return;
    }
    if (errors.length > 0 || pending !== null || cropFile !== null) {
      setMessage({ tone: "error", text: errors.join(" ") });
      return;
    }
    setPending("publish");
    setMessage(null);
    try {
      if (isDirty && !(await saveDraft(true))) return;
      await publishMutation({
        profileId: liveProfile._id,
        expectedImageRevision: imageRevisionRef.current,
        expectedMediaRevision: mediaRevisionRef.current,
      });
      setDraft(null);
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
      setPending(null);
    }
  }

  async function unpublish() {
    if (pending !== null) return;
    setPending("publish");
    setMessage(null);
    try {
      await setStatusMutation({ profileId: liveProfile._id, status: "unpublished" });
      setMessage({
        tone: "success",
        text: "Profile unpublished. Visitors now see the unavailable page.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be unpublished.",
      });
    } finally {
      setPending(null);
    }
  }

  const imageContent = (
    <div className="border-t border-tapit-line/70 pt-5">
      <p className="text-sm font-semibold text-tapit-ink">Profile photo or logo</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-tapit-accent-soft text-3xl font-semibold text-tapit-accent">
          {currentDraft.imageUrl ? (
            <NextImage
              alt={`${currentDraft.name} profile`}
              className="size-full object-cover"
              height={80}
              src={currentDraft.imageUrl}
              unoptimized
              width={80}
            />
          ) : (
            currentDraft.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            htmlFor="profile-image"
          >
            <UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />
            {pending === "image" ? "Uploading..." : "Change photo"}
          </label>
          {currentDraft.imageUrl ? (
            <Button
              disabled={pending !== null || cropFile !== null}
              onClick={clearImage}
              type="button"
              variant="quiet"
            >
              Remove photo
            </Button>
          ) : null}
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile photo or logo"
            className="sr-only"
            disabled={pending !== null || cropFile !== null}
            id="profile-image"
            onChange={chooseImage}
            type="file"
          />
          <p className="basis-full text-xs leading-5 text-tapit-muted">
            JPG, PNG, or WebP. Max 5 MB.
          </p>
        </div>
      </div>
      {imageError ? (
        <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
          {imageError}
        </p>
      ) : null}
      {imageApplied ? (
        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-[#17352b]"
          role="status"
          aria-label="Photo applied"
        >
          <CheckCircleIcon aria-hidden="true" size={16} weight="fill" />
          Photo applied
        </p>
      ) : null}
    </div>
  );

  return (
    <ProfileWorkspaceFrame
      controls={
        view === "profile" ? (
          <>
            <ProfileDetailsEditor
              customization={currentDraft.customization}
              copyMessage={copyMessage}
              draft={currentDraft}
              errors={profileErrors}
              imageContent={imageContent}
              links={currentDraft.links}
              message={message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
              onChange={updateField}
              onCustomizationChange={(customization) => updateField("customization", customization)}
              onCopyUrl={copyUrl}
              onboarding={
                needsLinkOnboarding(currentDraft, publishedForValidation) ? (
                  <Notice>
                    Your profile link is ready. Add a Portfolio, TikTok, or contact link, then
                    publish it.
                    <span className="mt-3 block">
                      <DraftSaveButtonLink href="/app/links">
                        Add your first link
                      </DraftSaveButtonLink>
                    </span>
                  </Notice>
                ) : null
              }
              slugLocked={slugLocked}
            />
            <ProfilePublicationPanel
              customizationErrors={customizationErrors}
              errors={profileErrors}
              hasChangesSincePublish={hasChangesSincePublish}
              onOpenCustomize={
                <DraftSaveButtonLink href="/app/customize">Open Customize</DraftSaveButtonLink>
              }
              onUnpublish={liveProfile.status === "published" ? () => void unpublish() : undefined}
              publicationState={publicationState}
              status={liveProfile.status}
            />
          </>
        ) : (
          <>
            {profileErrors.length > 0 ? (
              <Notice tone="error">
                <ul className="grid gap-2">
                  {profileErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <span className="mt-3 block">
                  <DraftSaveButtonLink href="/app/profile">Open Profile</DraftSaveButtonLink>
                </span>
              </Notice>
            ) : null}
            <PendingMediaUploadStatus pending={pendingMediaPreview} />
            {currentDraft.customization === undefined ? (
              <Panel className="shadow-none" title="Legacy appearance">
                <ProfileCustomizationEditor
                  customization={currentDraft.customization}
                  errors={customizationErrors}
                  media={currentDraft.media}
                  mediaBusy={mediaBusy}
                  mediaError={mediaError}
                  onChange={(customization) => updateField("customization", customization)}
                  onMediaErrorClear={() => setMediaError("")}
                  onMediaUploadCancel={cancelMediaUpload}
                  onMediaPendingPreviewChange={setPendingMediaPreview}
                  onMediaChange={(media) => updateField("media", media)}
                  onMediaUpload={uploadLiveMedia}
                  onThemeChange={(nextTheme) => updateField("theme", nextTheme)}
                  theme={theme}
                />
              </Panel>
            ) : (
              <ProfileCustomizationEditor
                customization={currentDraft.customization}
                errors={customizationErrors}
                media={currentDraft.media}
                mediaBusy={mediaBusy}
                mediaError={mediaError}
                onChange={(customization) => updateField("customization", customization)}
                onMediaErrorClear={() => setMediaError("")}
                onMediaUploadCancel={cancelMediaUpload}
                onMediaPendingPreviewChange={setPendingMediaPreview}
                onMediaChange={(media) => updateField("media", media)}
                onMediaUpload={uploadLiveMedia}
                onThemeChange={(nextTheme) => updateField("theme", nextTheme)}
                theme={theme}
              />
            )}
          </>
        )
      }
      message={
        view === "customize" && message ? <Notice tone={message.tone}>{message.text}</Notice> : null
      }
      cropDialog={
        cropFile !== null ? (
          <ProfileImageCropDialog
            busy={pending === "image"}
            file={cropFile}
            onApply={(crop) => void applyImageCrop(crop)}
            onCancel={() => {
              imageRequestRef.current += 1;
              setCropFile(null);
            }}
          />
        ) : null
      }
      description={
        view === "profile"
          ? "Edit your details and see how your profile looks to others."
          : "Tune the look and feel of your public profile."
      }
      onPreviewModeChange={setPreviewMode}
      onPublish={publish}
      onSave={() => void saveDraft()}
      preview={preview}
      previewMode={previewMode}
      profileUrl={`/${currentDraft.slug}`}
      hasDraftChanges={isDirty || hasChangesSincePublish || hasUnresolvedMedia}
      publishDisabled={
        errors.length > 0 ||
        publicationLabel === "Published" ||
        pending !== null ||
        cropFile !== null ||
        hasUnresolvedMedia
      }
      publishLabel={publicationLabel}
      saveDisabled={
        !isDirty ||
        mediaErrors.length > 0 ||
        pending !== null ||
        cropFile !== null ||
        hasUnresolvedMedia
      }
      saveLoading={pending === "save"}
      title={view === "profile" ? "Your profile" : "Customize your profile"}
      draftStatus={publicationState}
      publishLoading={pending === "publish"}
    />
  );
}

function parseImageUploadResponse(value: unknown): {
  storageId: Id<"_storage">;
  imageUrl: string;
  imageRevision: number;
} {
  if (typeof value !== "object" || value === null)
    throw new Error("The image service returned an invalid response.");
  const response = value as {
    storageId?: unknown;
    imageUrl?: unknown;
    imageRevision?: unknown;
  };
  if (
    typeof response.storageId !== "string" ||
    response.storageId.length === 0 ||
    typeof response.imageUrl !== "string" ||
    response.imageUrl.length === 0 ||
    !Number.isSafeInteger(response.imageRevision) ||
    (response.imageRevision as number) < 0
  )
    throw new Error("The image service returned an invalid response.");
  return {
    storageId: response.storageId as Id<"_storage">,
    imageUrl: response.imageUrl,
    imageRevision: response.imageRevision as number,
  };
}

function parseMediaUploadResponse(value: unknown): ProfileMediaImage & { mediaRevision: number } {
  if (typeof value !== "object" || value === null)
    throw new Error("The media service returned an invalid response.");
  const response = value as {
    assetId?: unknown;
    url?: unknown;
    previewUrl?: unknown;
    mediaRevision?: unknown;
  };
  if (
    typeof response.assetId !== "string" ||
    response.assetId.length === 0 ||
    typeof response.url !== "string" ||
    response.url.length === 0 ||
    typeof response.previewUrl !== "string" ||
    response.previewUrl.length === 0 ||
    !Number.isSafeInteger(response.mediaRevision) ||
    (response.mediaRevision as number) < 0
  )
    throw new Error("The media service returned an invalid response.");
  return {
    assetId: response.assetId as ProfileMediaImage["assetId"],
    altText: "",
    url: response.url,
    previewUrl: response.previewUrl,
    mediaRevision: response.mediaRevision as number,
  };
}

function ProfileEditorLoading() {
  return (
    <main
      aria-busy="true"
      className="grid min-h-[60dvh] place-items-center bg-tapit-paper px-5"
      role="status"
    >
      <p className="text-sm text-tapit-muted">Loading your profile...</p>
    </main>
  );
}
