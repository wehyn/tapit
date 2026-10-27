"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";

import {
  hasUnpublishedChanges,
  projectPublicProfile,
  publishProfile,
  validateLinkDestination,
  validatePublicationIssues,
  validatePublicationAccess,
  type ProfileContent,
  type PublicationIssue,
  type ProfileTheme,
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
import { prepareDemoMediaDataUrl } from "@/lib/demo/media";
import {
  prepareProfileImageCrop,
  validateProfileAvatarFile,
  validateProfileImageFile,
  type Crop,
} from "@/lib/profile-image";
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
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { ProfileCustomizationEditor } from "@/components/forms/ProfileCustomizationEditor";
import { ProfileDetailsEditor } from "@/components/forms/ProfileDetailsEditor";
import {
  ProfileWorkspaceFrame,
  type PublishRequirement,
} from "@/components/forms/ProfileWorkspaceFrame";
import { MissingProfilePage } from "@/components/state/StatePage";
import { ProfileChecklist } from "@/components/forms/ProfileChecklist";
import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";
import {
  useDraftSaveLink,
  useDraftSaveRegistration,
  useDraftStatusReport,
  type DraftDepartureState,
  type DraftSaveOutcome,
} from "@/components/layout/DraftSaveContext";
import {
  classifyProfileWorkspaceError,
  splitProfileWorkspaceErrors,
  type ProfileCustomizationCategory,
  type ProfileCustomizationFocusRequest,
} from "@/lib/profile-workspace";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function profileForPreview(
  draft: ProfileContent,
  legacyTheme: ProfileTheme | undefined,
  pendingMedia: readonly PendingProfileMediaUpload[],
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
const MAX_PROFILE_MEDIA_INPUT_BYTES = 5 * 1024 * 1024;
const PENDING_MEDIA_MESSAGE =
  "Your image is still uploading. Save and publish will be available when it finishes.";
const FAILED_MEDIA_MESSAGE =
  "Your image upload failed. Retry or discard it before saving or publishing.";
const DEMO_MEDIA_UPLOAD_DELAY_KEY = "tapit:e2e-media-upload-delay-ms";
const DEMO_MEDIA_UPLOAD_FAILURE_KEY = "tapit:e2e-media-upload-failure";
// A label styled as the tonal Button, so the sr-only file input before it stays the control.
const photoPickerClass =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control bg-tapit-accent-soft px-4 text-sm font-semibold text-tapit-accent-strong transition-colors hover:text-tapit-ink peer-disabled:cursor-not-allowed peer-disabled:opacity-55 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-tapit-focus";

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

function PendingMediaUploadStatus({ pending }: { pending: PendingProfileMediaUpload[] }) {
  if (!pending.some((entry) => entry.status === "uploading" || entry.status === "queued"))
    return null;
  return (
    <p aria-live="polite" className="text-sm font-medium text-tapit-muted" role="status">
      Uploading image… Keep this page open.
    </p>
  );
}

function unresolvedMediaMessage(pending: PendingProfileMediaUpload[]) {
  return pending.some((entry) => entry.status === "failed")
    ? FAILED_MEDIA_MESSAGE
    : PENDING_MEDIA_MESSAGE;
}

function needsLinkOnboarding(draft: ProfileContent, published: ProfileContent | null | undefined) {
  return published == null && !hasValidEnabledLink(draft);
}

function mediaRecoveryCategory(
  messages: readonly string[],
): Extract<ProfileCustomizationCategory, "media" | "slideshow"> {
  return messages.some((message) => classifyProfileWorkspaceError(message) === "slideshow")
    ? "slideshow"
    : "media";
}

function hasValidEnabledLink(draft: ProfileContent) {
  return draft.links.some(
    (link) =>
      link.enabled && link.label.trim().length > 0 && !validateLinkDestination(link.destination),
  );
}

function getPublishRequirements(issues: readonly PublicationIssue[]): PublishRequirement[] {
  return issues.map((issue, index) => {
    const id = `${index}-${issue.message}`;
    const customize = (section: ProfileCustomizationCategory) =>
      ({
        id,
        kind: "customization",
        message: issue.message,
        href: `/app/customize?section=${section}`,
        section,
        actionLabel: "Open Customize",
      }) satisfies PublishRequirement;

    switch (issue.kind) {
      case "profile":
        return {
          id,
          kind: "profile",
          message: issue.message,
          href: "/app/profile",
          actionLabel: "Open Profile",
        } satisfies PublishRequirement;
      case "links":
        return {
          id,
          kind: "links",
          message: issue.message,
          href: "/app/links",
          actionLabel: "Open Links",
        } satisfies PublishRequirement;
      case "customization":
        return customize(classifyProfileWorkspaceError(issue.message) ?? "overview");
      case "media":
        return customize(mediaRecoveryCategory([issue.message]));
    }
  });
}

function DemoProfileEditor({
  view,
  categoryFocusRequest,
  requestCategoryFocus,
  onRequirementAction,
}: {
  view: ProfileEditorView;
  categoryFocusRequest: ProfileCustomizationFocusRequest;
  requestCategoryFocus: (category: ProfileCustomizationCategory) => void;
  onRequirementAction: (requirement: PublishRequirement) => void;
}) {
  const router = useRouter();
  const state = useDemoState();
  const session = useDemoSession();
  const profile = getDemoProfileForSession(state, session);
  const legacyTheme = getDemoTheme(state, profile.id);
  const [draft, setDraft] = useState<ProfileContent>(() => ({
    ...profile.draft,
    links: profile.draft.links.map((link) => ({ ...link })),
  }));
  const theme = draft.theme ?? legacyTheme;
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [departureState, setDepartureState] = useState<DraftDepartureState>({ kind: "idle" });
  const [showCustomizationRecovery, setShowCustomizationRecovery] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pendingMediaPreview, setPendingMediaPreview] = useState<PendingProfileMediaUpload[]>([]);
  const hasUnresolvedMedia = mediaBusy || pendingMediaPreview.length > 0;
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
    if (!hasUnresolvedMedia && JSON.stringify(draft) === JSON.stringify(profile.draft)) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draft, hasUnresolvedMedia, profile.draft]);
  useEffect(
    () => () => {
      imageRequestRef.current += 1;
      mediaRequestRef.current += 1;
    },
    [],
  );
  const publicationIssues = validatePublicationIssues(draft, profile.published, {
    immutableSlug: profile.draft.slug,
    activeTheme: theme,
    existingSlugs: getDemoProfiles(state)
      .filter((candidate) => candidate.id !== profile.id)
      .flatMap((candidate) => [
        candidate.draft.slug,
        ...(candidate.published === null ? [] : [candidate.published.slug]),
      ]),
  });
  const publicationErrors = publicationIssues.map((issue) => issue.message);
  const customer =
    session?.role === "customer"
      ? state.customers.find((candidate) => candidate.email === session.email)
      : undefined;
  const lifecycleErrors = customer
    ? validatePublicationAccess(profile.status, customer.status, customer.deletionStatus)
    : [];
  const cardErrors = state.cards.some(
    (card) =>
      card.profileId === profile.id && card.status === "claimable" && card.claimedAt === undefined,
  )
    ? ["Claim the attached card before publishing this profile."]
    : [];
  const errors = [...publicationErrors, ...lifecycleErrors, ...cardErrors];
  const publishRequirements = getPublishRequirements(publicationIssues);
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
  function updateField<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setMessage(null);
  }

  function chooseTheme(themeOption: ProfileTheme) {
    updateField("theme", themeOption);
  }

  async function saveDraft(): Promise<DraftSaveOutcome> {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return { kind: "deferred", reason: "pending-media" };
    }
    if (cropFile !== null) return { kind: "deferred", reason: "crop-open" };
    if (imagePending) return { kind: "deferred", reason: "pending-media" };
    if (mediaErrors.length > 0) {
      setMessage({ tone: "error", text: mediaErrors.join(" ") });
      return {
        kind: "blocked",
        blocker: { kind: "media-validation", messages: mediaErrors },
      };
    }
    if (!isDirty) return { kind: "saved" };
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
      return { kind: "saved" };
    } catch (error) {
      const text = error instanceof Error ? error.message : "Draft could not be saved.";
      setMessage({
        tone: "error",
        text,
      });
      return { kind: "failed", message: text };
    }
  }

  async function saveFromButton() {
    const outcome = await saveDraft();
    if (outcome.kind === "saved") setDepartureState({ kind: "idle" });
  }

  async function saveForNavigation(href?: string): Promise<DraftSaveOutcome> {
    if (href !== undefined) setDepartureState({ kind: "saving", href });
    let outcome: DraftSaveOutcome;
    try {
      outcome = await saveDraft();
    } catch (error) {
      outcome = {
        kind: "failed",
        message: error instanceof Error ? error.message : "Draft could not be saved.",
      };
    }
    if (href === undefined) return outcome;
    if (outcome.kind === "saved") {
      setDepartureState({ kind: "idle" });
    } else {
      setDepartureState({ kind: "repair", href, outcome });
      if (outcome.kind === "blocked" && outcome.blocker.kind === "media-validation") {
        setShowCustomizationRecovery(true);
        requestCategoryFocus(mediaRecoveryCategory(outcome.blocker.messages));
      }
    }
    return outcome;
  }

  useDraftSaveRegistration(saveForNavigation);
  useDraftStatusReport(isDirty ? "unsaved" : "saved");

  async function saveAndContinue() {
    if (departureState.kind !== "repair") return;
    const { href } = departureState;
    const outcome = await saveForNavigation(href);
    if (outcome.kind === "saved") router.push(href);
  }

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
        const activeTheme =
          draft.theme ?? currentProfile.draft.theme ?? getDemoTheme(current, profile.id);
        const publishedProfile = publishProfile({ ...currentProfile, draft }, occurredAt, {
          activeTheme,
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
          theme: publishedProfile.published?.theme ?? activeTheme,
        };
        const updatedProfileState = updateDemoProfile(current, profile.id, () => nextProfile);
        return {
          ...updatedProfileState,
          themes: {
            ...updatedProfileState.themes,
            [profile.id]: nextProfile.theme,
          },
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

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateProfileAvatarFile(file);
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
      if (file.size > MAX_PROFILE_MEDIA_INPUT_BYTES)
        throw new Error("Media must be 5 MB or smaller.");
      const validationError = validateProfileImageFile(file);
      if (validationError) throw new Error(validationError);
      const { delayMs, fail } = demoMediaUploadControls();
      if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      if (fail) throw new Error("The media upload failed. Try again.");
      const url = await prepareDemoMediaDataUrl(file);
      if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
      return { assetId: demoMediaAssetId(requestId), altText: "", url };
    } catch (error) {
      const text = error instanceof Error ? error.message : "The media upload failed. Try again.";
      if (requestId === mediaRequestRef.current) setMediaError(text);
      throw error;
    } finally {
      if (requestId === mediaRequestRef.current) setMediaBusy(false);
    }
  }

  const imageContent = (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid size-22 shrink-0 place-items-center overflow-hidden rounded-full bg-tapit-accent text-xl font-semibold text-white">
        {draft.imageUrl ? (
          <NextImage
            alt={`${draft.name} profile`}
            className="tapit-image-outline size-full object-cover"
            height={88}
            src={draft.imageUrl}
            unoptimized
            width={88}
          />
        ) : (
          draft.name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold text-tapit-ink">Photo or logo</p>
        <p className="text-xs text-tapit-muted">JPG, PNG, or WebP. Max 20 MB.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile photo or logo"
            className="peer sr-only"
            disabled={cropFile !== null || imagePending}
            id="profile-image"
            onChange={chooseImage}
            type="file"
          />
          <label className={photoPickerClass} htmlFor="profile-image">
            <Icon className="size-4" name="upload" />
            {imagePending ? "Preparing..." : "Replace"}
          </label>
        </div>
        {imageError ? (
          <p className="text-xs font-medium text-tapit-danger" role="alert">
            {imageError}
          </p>
        ) : null}
        {imageApplied ? (
          <p
            className="inline-flex items-center gap-1 text-xs font-medium text-tapit-accent-strong"
            role="status"
            aria-label="Photo applied"
          >
            <Icon className="size-4" name="check" />
            Photo applied
          </p>
        ) : null}
      </div>
    </div>
  );
  const customizationEditor = (
    <div
      className={
        draft.customization === undefined && view !== "customize"
          ? "flex min-w-0 flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
          : "contents"
      }
    >
      <h2
        className="text-lg font-semibold tracking-tight text-tapit-ink"
        hidden={draft.customization !== undefined}
      >
        Profile presets
      </h2>
      <ProfileCustomizationEditor
        barePanels={view === "customize"}
        categoryFocusRequest={categoryFocusRequest}
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
    </div>
  );
  return (
    <ProfileWorkspaceFrame
      controls={
        view === "profile" ? (
          <>
            <ProfileChecklist draft={draft} published={profile.status === "published"} />
            <ProfileDetailsEditor
              customization={draft.customization}
              draft={draft}
              errors={profileErrors}
              customizationErrors={customizationErrors}
              imageContent={imageContent}
              links={draft.links}
              message={
                message && departureState.kind === "idle" ? (
                  <Notice tone={message.tone}>{message.text}</Notice>
                ) : null
              }
              onChange={updateField}
              onCustomizationChange={(customization) => updateField("customization", customization)}
              onOpenCustomize={
                <DraftSaveButtonLink href="/app/customize">Open Customize</DraftSaveButtonLink>
              }
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
            {showCustomizationRecovery ? (
              <>
                <PendingMediaUploadStatus pending={pendingMediaPreview} />
                {customizationEditor}
              </>
            ) : null}
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
            {customizationEditor}
          </>
        )
      }
      message={
        view === "customize" && message && departureState.kind === "idle" ? (
          <Notice tone={message.tone}>{message.text}</Notice>
        ) : null
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
      departureState={departureState}
      onSaveAndContinue={() => void saveAndContinue()}
      onStayHere={() => setDepartureState({ kind: "idle" })}
      onRequirementAction={onRequirementAction}
      onPublish={publish}
      publishRequirements={publishRequirements}
      firstVisitRequirementKey={
        view === "profile" && needsLinkOnboarding(draft, profile.published) ? profile.id : undefined
      }
      onSave={() => void saveFromButton()}
      preview={preview}
      profileUrl={`/${draft.slug}`}
      hasPublishedProfile={profile.published !== null && profile.status === "published"}
      hasDraftChanges={isDirty || hasChangesSincePublish || hasUnresolvedMedia}
      publishDisabled={
        lifecycleErrors.length > 0 ||
        cardErrors.length > 0 ||
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
    />
  );
}

export function ProfileEditor({
  view = "profile",
  initialCustomizationCategory,
}: {
  view?: ProfileEditorView;
  initialCustomizationCategory?: ProfileCustomizationCategory;
} = {}) {
  const [categoryFocusRequest, setCategoryFocusRequest] =
    useState<ProfileCustomizationFocusRequest>(() => ({
      category: initialCustomizationCategory ?? "overview",
      sequence: initialCustomizationCategory === undefined ? 0 : 1,
    }));
  const previousInitialCategoryRef = useRef(initialCustomizationCategory);
  const requestCategoryFocus = useCallback((category: ProfileCustomizationCategory) => {
    setCategoryFocusRequest((current) => ({
      category,
      sequence: current.sequence + 1,
    }));
  }, []);
  useEffect(() => {
    if (previousInitialCategoryRef.current === initialCustomizationCategory) return;
    previousInitialCategoryRef.current = initialCustomizationCategory;
    requestCategoryFocus(initialCustomizationCategory ?? "overview");
  }, [initialCustomizationCategory, requestCategoryFocus]);
  const onRequirementAction = useCallback(
    (requirement: PublishRequirement) => {
      if (requirement.kind === "customization") requestCategoryFocus(requirement.section);
    },
    [requestCategoryFocus],
  );
  const editorProps = { view, categoryFocusRequest, requestCategoryFocus, onRequirementAction };
  return !isLocalDemoMode() ? (
    <LiveProfileEditor {...editorProps} />
  ) : (
    <DemoProfileEditor {...editorProps} />
  );
}

function LiveProfileEditor({
  view,
  categoryFocusRequest,
  requestCategoryFocus,
  onRequirementAction,
}: {
  view: ProfileEditorView;
  categoryFocusRequest: ProfileCustomizationFocusRequest;
  requestCategoryFocus: (category: ProfileCustomizationCategory) => void;
  onRequirementAction: (requirement: PublishRequirement) => void;
}) {
  const profile = useQuery(api.profiles.mine);
  if (profile === undefined) return <ProfileEditorLoading />;
  if (profile === null) return <MissingProfilePage />;
  return (
    <LiveProfileEditorContent
      categoryFocusRequest={categoryFocusRequest}
      requestCategoryFocus={requestCategoryFocus}
      onRequirementAction={onRequirementAction}
      profile={profile}
      view={view}
    />
  );
}

function LiveProfileEditorContent({
  profile,
  view,
  categoryFocusRequest,
  requestCategoryFocus,
  onRequirementAction,
}: {
  profile: NonNullable<ReturnType<typeof useQuery<typeof api.profiles.mine>>>;
  view: ProfileEditorView;
  categoryFocusRequest: ProfileCustomizationFocusRequest;
  requestCategoryFocus: (category: ProfileCustomizationCategory) => void;
  onRequirementAction: (requirement: PublishRequirement) => void;
}) {
  const router = useRouter();
  const saveDraftMutation = useMutation(api.profiles.saveDraft);
  const publishMutation = useMutation(api.profiles.publish);
  const removeImage = useMutation(api.storage.removeImage);
  const authToken = useAuthToken();
  const [draft, setDraft] = useState<ProfileContent | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [draftConflict, setDraftConflict] = useState(false);
  const [departureState, setDepartureState] = useState<DraftDepartureState>({ kind: "idle" });
  const [showCustomizationRecovery, setShowCustomizationRecovery] = useState(false);
  const [pending, setPending] = useState<"save" | "publish" | "image" | null>(null);
  const [imageError, setImageError] = useState("");
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [pendingMediaPreview, setPendingMediaPreview] = useState<PendingProfileMediaUpload[]>([]);
  const hasUnresolvedMedia = mediaBusy || pendingMediaPreview.length > 0;
  const [mediaError, setMediaError] = useState("");
  const navigationSaveRef = useRef<(href?: string) => Promise<DraftSaveOutcome>>(async () => ({
    kind: "saved",
  }));
  const registeredSave = useCallback((href?: string) => navigationSaveRef.current(href), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);
  const imageRequestRef = useRef(0);
  const liveProfile = profile as typeof profile & {
    draft: ProfileContent;
    published?: ProfileContent & { publishedAt: number };
  };
  const serverDraftRevisionRef = useRef(liveProfile.draftRevision ?? 0);
  const serverDraftProfileIdRef = useRef(liveProfile._id);
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
  const publicationIssues = validatePublicationIssues(currentDraft, publishedForValidation, {
    immutableSlug: liveProfile.slug,
  });
  const errors = publicationIssues.map((issue) => issue.message);
  const publishRequirements = getPublishRequirements(publicationIssues);
  const mediaErrors = validateProfileMedia(currentDraft.media);
  const { profile: profileErrors, customization: customizationErrors } =
    splitProfileWorkspaceErrors(errors);
  const preview = profileForPreview(currentDraft, undefined, pendingMediaPreview);
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(liveProfile.draft);
  useEffect(() => {
    if (!hasUnresolvedMedia && !isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnresolvedMedia, isDirty]);
  useDraftStatusReport(pending !== null ? "saving" : isDirty ? "unsaved" : "saved");
  useEffect(() => {
    const incomingRevision = liveProfile.draftRevision ?? 0;
    if (serverDraftProfileIdRef.current !== liveProfile._id) {
      serverDraftProfileIdRef.current = liveProfile._id;
      serverDraftRevisionRef.current = incomingRevision;
    } else if (!isDirty && incomingRevision >= serverDraftRevisionRef.current) {
      serverDraftRevisionRef.current = incomingRevision;
    }
  }, [isDirty, liveProfile._id, liveProfile.draftRevision]);
  const slugLocked = true;
  const hasChangesSincePublish = hasUnpublishedChanges(currentDraft, publishedForValidation);
  const publicationLabel =
    liveProfile.status === "published"
      ? hasChangesSincePublish
        ? "Publish changes"
        : "Published"
      : "Publish";
  const latestDraftRef = useRef(currentDraft);

  useLayoutEffect(() => {
    latestDraftRef.current = currentDraft;
  }, [currentDraft]);

  function updateField<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    draftRevisionRef.current += 1;
    setDraft((value_) => ({ ...(value_ ?? currentDraft), [field]: value }));
    setMessage(null);
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateProfileAvatarFile(file);
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
          "X-Draft-Revision": String(serverDraftRevisionRef.current),
          "X-Profile-Id": liveProfile._id,
        },
      });
      if (!response.ok)
        throw new Error((await response.text()) || "The image upload failed. Choose another file.");
      const uploaded = parseImageUploadResponse(await response.json());
      if (requestId !== imageRequestRef.current) return;
      imageRevisionRef.current = uploaded.imageRevision;
      serverDraftRevisionRef.current = uploaded.draftRevision;
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
        expectedDraftRevision: serverDraftRevisionRef.current,
      });
      imageRevisionRef.current = result.imageRevision;
      serverDraftRevisionRef.current = result.draftRevision;
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
      if (file.size > MAX_PROFILE_MEDIA_INPUT_BYTES)
        throw new Error("Media must be 5 MB or smaller.");
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
      mediaRevisionRef.current = uploaded.mediaRevision;
      if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
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

  async function saveDraft(keepPublishPending = false): Promise<DraftSaveOutcome> {
    if (hasUnresolvedMedia) {
      setMessage({ tone: "error", text: unresolvedMediaMessage(pendingMediaPreview) });
      return { kind: "deferred", reason: "pending-media" };
    }
    if (cropFile !== null) return { kind: "deferred", reason: "crop-open" };
    if (pending === "image") return { kind: "deferred", reason: "pending-media" };
    if (!keepPublishPending && pending !== null)
      return { kind: "deferred", reason: "pending-save" };
    if (mediaErrors.length > 0) {
      setMessage({ tone: "error", text: mediaErrors.join(" ") });
      return {
        kind: "blocked",
        blocker: { kind: "media-validation", messages: mediaErrors },
      };
    }
    if (!isDirty) return { kind: "saved" };
    setPending(keepPublishPending ? "publish" : "save");
    setMessage(null);
    try {
      let draftToSave = latestDraftRef.current;
      for (let attempt = 0; attempt < MAX_DRAFT_SAVE_ATTEMPTS; attempt += 1) {
        const revisionAtStart = draftRevisionRef.current;
        const result = await saveDraftMutation({
          profileId: liveProfile._id,
          draft: draftForPersistence(draftToSave),
          expectedDraftRevision: serverDraftRevisionRef.current,
          expectedImageRevision: imageRevisionRef.current,
          expectedMediaRevision: mediaRevisionRef.current,
        });
        serverDraftRevisionRef.current = result.draftRevision;
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
          return { kind: "saved" };
        }
        draftToSave = latestDraft;
      }
      throw new Error("Your draft changed while it was saving. Try again.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Draft could not be saved.";
      setDraftConflict(text.includes("profile draft changed while you were editing"));
      setMessage({
        tone: "error",
        text,
      });
      return { kind: "failed", message: text };
    } finally {
      if (!keepPublishPending) setPending(null);
    }
  }

  async function saveFromButton() {
    const outcome = await saveDraft();
    if (outcome.kind === "saved") setDepartureState({ kind: "idle" });
  }

  function discardConflictingDraft() {
    setDraft(null);
    setDraftConflict(false);
    setMessage({ tone: "success", text: "Showing the latest saved profile draft." });
  }

  async function saveForNavigation(href?: string): Promise<DraftSaveOutcome> {
    if (href !== undefined) setDepartureState({ kind: "saving", href });
    let outcome: DraftSaveOutcome;
    try {
      outcome = await saveDraft();
    } catch (error) {
      outcome = {
        kind: "failed",
        message: error instanceof Error ? error.message : "Draft could not be saved.",
      };
    }
    if (href === undefined) return outcome;
    if (outcome.kind === "saved") {
      setDepartureState({ kind: "idle" });
    } else {
      setDepartureState({ kind: "repair", href, outcome });
      if (outcome.kind === "blocked" && outcome.blocker.kind === "media-validation") {
        setShowCustomizationRecovery(true);
        requestCategoryFocus(mediaRecoveryCategory(outcome.blocker.messages));
      }
    }
    return outcome;
  }

  useEffect(() => {
    navigationSaveRef.current = saveForNavigation;
  });

  async function saveAndContinue() {
    if (departureState.kind !== "repair") return;
    const { href } = departureState;
    const outcome = await saveForNavigation(href);
    if (outcome.kind === "saved") router.push(href);
  }

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
      if (isDirty && (await saveDraft(true)).kind !== "saved") return;
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

  const imageContent = (
    <div className="flex flex-wrap items-center gap-4">
      <div className="grid size-22 shrink-0 place-items-center overflow-hidden rounded-full bg-tapit-accent text-xl font-semibold text-white">
        {currentDraft.imageUrl ? (
          <NextImage
            alt={`${currentDraft.name} profile`}
            className="tapit-image-outline size-full object-cover"
            height={88}
            src={currentDraft.imageUrl}
            unoptimized
            width={88}
          />
        ) : (
          currentDraft.name.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold text-tapit-ink">Photo or logo</p>
        <p className="text-xs text-tapit-muted">JPG, PNG, or WebP. Max 20 MB.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Profile photo or logo"
            className="peer sr-only"
            disabled={pending !== null || cropFile !== null}
            id="profile-image"
            onChange={chooseImage}
            type="file"
          />
          <label className={photoPickerClass} htmlFor="profile-image">
            <Icon className="size-4" name="upload" />
            {pending === "image" ? "Uploading..." : "Replace"}
          </label>
          {currentDraft.imageUrl ? (
            <Button
              aria-label="Remove photo"
              disabled={pending !== null || cropFile !== null}
              onClick={clearImage}
              type="button"
              variant="quiet"
            >
              Remove
            </Button>
          ) : null}
        </div>
        {imageError ? (
          <p className="text-xs font-medium text-tapit-danger" role="alert">
            {imageError}
          </p>
        ) : null}
        {imageApplied ? (
          <p
            className="inline-flex items-center gap-1 text-xs font-medium text-tapit-accent-strong"
            role="status"
            aria-label="Photo applied"
          >
            <Icon className="size-4" name="check" />
            Photo applied
          </p>
        ) : null}
      </div>
    </div>
  );

  const customizationEditor = (
    <div
      className={
        currentDraft.customization === undefined && view !== "customize"
          ? "flex min-w-0 flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
          : "contents"
      }
    >
      <h2
        className="text-lg font-semibold tracking-tight text-tapit-ink"
        hidden={currentDraft.customization !== undefined}
      >
        Profile presets
      </h2>
      <ProfileCustomizationEditor
        barePanels={view === "customize"}
        categoryFocusRequest={categoryFocusRequest}
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
    </div>
  );

  return (
    <ProfileWorkspaceFrame
      controls={
        view === "profile" ? (
          <>
            <ProfileChecklist draft={currentDraft} published={liveProfile.status === "published"} />
            <ProfileDetailsEditor
              customization={currentDraft.customization}
              draft={currentDraft}
              errors={profileErrors}
              customizationErrors={customizationErrors}
              imageContent={imageContent}
              links={currentDraft.links}
              message={
                message && departureState.kind === "idle" ? (
                  <div className="grid gap-2">
                    <Notice tone={message.tone}>{message.text}</Notice>
                    {draftConflict ? (
                      <Button onClick={discardConflictingDraft} type="button" variant="secondary">
                        Discard my edits and load the latest draft
                      </Button>
                    ) : null}
                  </div>
                ) : null
              }
              onChange={updateField}
              onCustomizationChange={(customization) => updateField("customization", customization)}
              onOpenCustomize={
                <DraftSaveButtonLink href="/app/customize">Open Customize</DraftSaveButtonLink>
              }
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
            {showCustomizationRecovery ? (
              <>
                <PendingMediaUploadStatus pending={pendingMediaPreview} />
                {customizationEditor}
              </>
            ) : null}
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
            {customizationEditor}
          </>
        )
      }
      message={
        view === "customize" && message && departureState.kind === "idle" ? (
          <div className="grid gap-2">
            <Notice tone={message.tone}>{message.text}</Notice>
            {draftConflict ? (
              <Button onClick={discardConflictingDraft} type="button" variant="secondary">
                Discard my edits and load the latest draft
              </Button>
            ) : null}
          </div>
        ) : null
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
      departureState={departureState}
      onSaveAndContinue={() => void saveAndContinue()}
      onStayHere={() => setDepartureState({ kind: "idle" })}
      onRequirementAction={onRequirementAction}
      onPublish={publish}
      publishRequirements={publishRequirements}
      firstVisitRequirementKey={
        view === "profile" && needsLinkOnboarding(currentDraft, publishedForValidation)
          ? liveProfile._id
          : undefined
      }
      onSave={() => void saveFromButton()}
      preview={preview}
      profileUrl={`/${currentDraft.slug}`}
      hasPublishedProfile={
        liveProfile.published !== null &&
        liveProfile.published !== undefined &&
        liveProfile.status === "published"
      }
      hasDraftChanges={isDirty || hasChangesSincePublish || hasUnresolvedMedia}
      publishDisabled={
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
      publishLoading={pending === "publish"}
    />
  );
}

function parseImageUploadResponse(value: unknown): {
  storageId: Id<"_storage">;
  imageUrl: string;
  imageRevision: number;
  draftRevision: number;
} {
  if (typeof value !== "object" || value === null)
    throw new Error("The image service returned an invalid response.");
  const response = value as {
    storageId?: unknown;
    imageUrl?: unknown;
    imageRevision?: unknown;
    draftRevision?: unknown;
  };
  if (
    typeof response.storageId !== "string" ||
    response.storageId.length === 0 ||
    typeof response.imageUrl !== "string" ||
    response.imageUrl.length === 0 ||
    !Number.isSafeInteger(response.imageRevision) ||
    (response.imageRevision as number) < 0 ||
    !Number.isSafeInteger(response.draftRevision) ||
    (response.draftRevision as number) < 0
  )
    throw new Error("The image service returned an invalid response.");
  return {
    storageId: response.storageId as Id<"_storage">,
    imageUrl: response.imageUrl,
    imageRevision: response.imageRevision as number,
    draftRevision: response.draftRevision as number,
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
      className="grid min-h-[60dvh] place-items-center bg-tapit-paper px-4"
      role="status"
    >
      <p className="text-sm text-tapit-muted">Loading your profile...</p>
    </main>
  );
}
