"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import NextImage from "next/image";
import { CheckCircleIcon, CopyIcon, FloppyDiskIcon, UploadSimpleIcon } from "@phosphor-icons/react";

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
  type ProfileMediaImage,
  type ProfileMediaPresentation,
} from "@/lib/profile-media";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { ProfileCustomizationEditor } from "@/components/forms/ProfileCustomizationEditor";
import { MissingProfilePage } from "@/components/state/StatePage";
import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";
import { useDraftSaveLink, useDraftSaveRegistration } from "@/components/layout/DraftSaveContext";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function profileForPreview(draft: ProfileContent, legacyTheme?: ProfileTheme) {
  if (legacyTheme !== undefined) {
    return projectDemoPublicProfile(
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
    );
  }
  return projectPublicProfile({
    id: "preview",
    ownerId: "preview",
    status: "published",
    draft,
    published: { ...draft, publishedAt: new Date().toISOString() },
  });
}

const MAX_DRAFT_SAVE_ATTEMPTS = 3;

type ProfileFieldChange = <K extends keyof ProfileContent>(
  field: K,
  value: ProfileContent[K],
) => void;

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

function ProfileIdentityForm({
  draft,
  imageContent,
  message,
  onboarding,
  onChange,
  onCopyUrl,
  copyMessage,
  slugLocked,
}: {
  draft: ProfileContent;
  imageContent?: React.ReactNode;
  message?: React.ReactNode;
  onboarding?: React.ReactNode;
  onChange: ProfileFieldChange;
  onCopyUrl: () => void;
  copyMessage: string;
  slugLocked: boolean;
}) {
  return (
    <Panel className="shadow-none" title="Profile identity">
      <div className="mt-6 grid gap-5">
        {message}
        {onboarding}
        {imageContent}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="profile-name"
            label="Name"
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Alex Morgan"
            value={draft.name}
          />
          <TextareaField
            id="profile-bio"
            label="Bio or role"
            help="A short introduction people can scan quickly."
            maxLength={140}
            onChange={(event) => onChange("bio", event.target.value || undefined)}
            placeholder="e.g. Designer helping small teams"
            value={draft.bio ?? ""}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="profile-email"
            help="This appears as a contact option on your published profile."
            label="Email"
            onChange={(event) => onChange("email", event.target.value || undefined)}
            placeholder="you@example.com"
            type="email"
            value={draft.email ?? ""}
          />
          <Field
            id="profile-phone"
            label="Phone"
            onChange={(event) => onChange("phone", event.target.value || undefined)}
            placeholder="+63 917 555 0184"
            type="tel"
            value={draft.phone ?? ""}
          />
          <Field
            id="profile-website"
            label="Website"
            onChange={(event) => onChange("website", event.target.value || undefined)}
            placeholder="https://yourwebsite.com"
            type="url"
            value={draft.website ?? ""}
          />
          <Field
            disabled={slugLocked}
            help={
              slugLocked
                ? "The slug is immutable after first publication."
                : "Use lowercase letters, numbers, and hyphens."
            }
            id="profile-slug"
            label="Stable profile slug"
            onChange={(event) => onChange("slug", event.target.value)}
            placeholder="alex-morgan"
            value={draft.slug}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-tapit border border-tapit-line/70 bg-tapit-paper px-4 py-3 text-sm">
          <span className="font-semibold text-tapit-ink">Public URL</span>
          <code className="min-w-0 flex-1 truncate text-xs text-tapit-muted">
            {typeof window === "undefined"
              ? `/${draft.slug}`
              : `${window.location.origin}/${draft.slug}`}
          </code>
          <Button onClick={onCopyUrl} type="button" variant="secondary">
            <CopyIcon aria-hidden="true" className="mr-2" size={17} weight="bold" />
            {copyMessage || "Copy"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function DraftSaveButtonLink({ children, href }: { children: React.ReactNode; href: string }) {
  const onClick = useDraftSaveLink(href);
  return (
    <ButtonLink href={href} onClick={onClick}>
      {children}
    </ButtonLink>
  );
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

function DemoProfileEditor() {
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
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [imagePending, setImagePending] = useState(false);
  const imageRequestRef = useRef(0);
  const mediaRequestRef = useRef(0);
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
    const lifecycleErrors = validatePublicationAccess(
      profile.status,
      customer?.status,
      customer?.deletionStatus,
    );
    return [
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
  })();
  const preview = profileForPreview(draft, theme);
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
    if (cropFile !== null || imagePending || mediaBusy) return false;
    if (!isDirty) return true;
    try {
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => ({ ...currentProfile, draft })),
      );
      setMessage({
        tone: "success",
        text: "Draft saved. Visitors still see the last published version.",
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
    if (cropFile !== null || imagePending || mediaBusy) return;
    if (errors.length > 0) {
      setMessage({ tone: "error", text: errors.join(" ") });
      return;
    }
    try {
      const publishedProfile = publishProfile({ ...profile, draft }, new Date().toISOString(), {
        existingSlugs: getDemoProfiles(state)
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
        theme: profile.theme,
      };
      updateDemoState((current) => ({
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
            occurredAt: new Date().toISOString(),
            after: "published",
          },
          ...current.audits,
        ],
      }));
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

  return (
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 pb-28 pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] lg:gap-10 lg:pt-8">
      <div className="grid gap-6">
        <div className="pb-1">
          <div>
            <h1 className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-5xl">
              Your profile
            </h1>
            <p className="mt-2 max-w-xl text-base leading-7 text-tapit-muted">
              Edit your details and see how your profile looks to others.
            </p>
          </div>
        </div>
        <ProfileCustomizationEditor
          customization={draft.customization}
          errors={errors}
          identityContent={
            <ProfileIdentityForm
              copyMessage={copyMessage}
              draft={draft}
              imageContent={
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
                      <p className="mt-2 text-xs leading-5 text-tapit-muted">
                        JPG, PNG, or WebP. Max 5 MB.
                      </p>
                    </div>
                  </div>
                  {imageError ? (
                    <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
                      {imageError}
                    </p>
                  ) : null}
                </div>
              }
              message={message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
              onChange={updateField}
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
          }
          links={draft.links}
          media={draft.media}
          mediaBusy={mediaBusy}
          mediaError={mediaError}
          onMediaChange={(media) => updateField("media", media)}
          onMediaUpload={uploadDemoMedia}
          onChange={(customization) => updateField("customization", customization)}
        />
        {!draft.customization ? (
          <Panel
            className="shadow-none"
            description="These controls stay deliberately small so every legacy theme remains readable."
            title="Legacy appearance"
          >
            <div className="mt-6 grid gap-5 sm:grid-cols-3">
              {(["paper", "moss", "night"] as const).map((themeOption) => (
                <button
                  aria-pressed={theme === themeOption}
                  className={`rounded-tapit border p-4 text-left transition ${theme === themeOption ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"}`}
                  key={themeOption}
                  onClick={() => chooseTheme(themeOption)}
                  type="button"
                >
                  <span
                    className={`block h-12 rounded-tapit ${themeOption === "paper" ? "bg-tapit-paper" : themeOption === "moss" ? "bg-[#e8f1eb]" : "bg-[#17211f]"}`}
                  />
                  <span className="mt-3 block text-sm font-semibold capitalize text-tapit-ink">
                    {themeOption}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="shadow-none" title="Publication">
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge status={profile.status} />
            <span className="text-sm text-tapit-muted">{publicationState}</span>
          </div>
          {errors.length > 0 ? (
            <ul className="mt-5 grid gap-2 text-sm text-tapit-muted">
              {errors.map((error) => (
                <li className="flex gap-2" key={error}>
                  <span aria-hidden="true" className="text-tapit-danger">
                    !
                  </span>
                  {error}
                </li>
              ))}
            </ul>
          ) : profile.status === "published" && !hasChangesSincePublish ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
              <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
              Your published profile is up to date.
            </p>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
              <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
              {profile.status === "published"
                ? "Your saved changes are ready to publish."
                : "Ready to publish. The required name and one valid enabled link are present."}
            </p>
          )}
          {profile.status === "published" ? (
            <div className="mt-6">
              <Button onClick={unpublish} type="button" variant="quiet">
                Unpublish
              </Button>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="h-fit lg:sticky lg:top-6">
        {preview ? (
          <WorkspacePreview
            mode={previewMode}
            onModeChange={setPreviewMode}
            preview={preview}
            profileUrl={`/${draft.slug}`}
            showProfileUrl
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
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
              disabled={!isDirty || cropFile !== null || imagePending || mediaBusy}
              onClick={() => void saveDraft()}
              type="button"
              variant="secondary"
            >
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Save draft
            </Button>
            <Button
              disabled={
                errors.length > 0 ||
                publicationLabel === "Published" ||
                cropFile !== null ||
                imagePending ||
                mediaBusy
              }
              onClick={publish}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {publicationLabel}
            </Button>
          </div>
        </div>
      </div>
      {cropFile !== null ? (
        <ProfileImageCropDialog
          busy={imagePending}
          file={cropFile}
          onApply={(crop) => void applyDemoCrop(crop)}
          onCancel={() => {
            imageRequestRef.current += 1;
            setCropFile(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function ProfileEditor() {
  return !isLocalDemoMode() ? <LiveProfileEditor /> : <DemoProfileEditor />;
}

function LiveProfileEditor() {
  const profile = useQuery(api.profiles.mine);
  if (profile === undefined) return <ProfileEditorLoading />;
  if (profile === null) return <MissingProfilePage />;
  return <LiveProfileEditorContent profile={profile} />;
}

function LiveProfileEditorContent({
  profile,
}: {
  profile: NonNullable<ReturnType<typeof useQuery<typeof api.profiles.mine>>>;
}) {
  const saveDraftMutation = useMutation(api.profiles.saveDraft);
  const publishMutation = useMutation(api.profiles.publish);
  const removeImage = useMutation(api.storage.removeImage);
  const authToken = useAuthToken();
  const [draft, setDraft] = useState<ProfileContent | null>(null);
  const [previewMode, setPreviewMode] = useState<"phone" | "desktop">("phone");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<"save" | "publish" | "image" | null>(null);
  const [imageError, setImageError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
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

  useEffect(
    () => () => {
      imageRequestRef.current += 1;
      mediaRequestRef.current += 1;
    },
    [],
  );
  const currentDraft = useMemo<ProfileContent>(
    () =>
      draft ?? {
        ...liveProfile.draft,
        links: liveProfile.draft.links.map((link) => ({
          ...link,
          icon: link.icon as ProfileContent["links"][number]["icon"],
        })),
      },
    [draft, liveProfile.draft],
  );
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
    immutableSlug: liveProfile.published?.slug,
  });
  const preview = profileForPreview(currentDraft);
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(liveProfile.draft);
  const slugLocked = liveProfile.published !== undefined;
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
      });
      if (!response.ok)
        throw new Error((await response.text()) || "The media upload failed. Choose another file.");
      const uploaded = parseMediaUploadResponse(await response.json());
      if (requestId !== mediaRequestRef.current) throw new Error("The media upload was canceled.");
      mediaRevisionRef.current = uploaded.mediaRevision;
      return uploaded;
    } catch (error) {
      const text = error instanceof Error ? error.message : "The media upload failed. Try again.";
      if (requestId === mediaRequestRef.current) setMediaError(text);
      throw error;
    } finally {
      if (requestId === mediaRequestRef.current) setMediaBusy(false);
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
    if (!keepPublishPending && (pending !== null || cropFile !== null || mediaBusy)) return false;
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
    if (errors.length > 0 || pending !== null || cropFile !== null || mediaBusy) {
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

  return (
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 pb-28 pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] lg:gap-10 lg:pt-8">
      <div className="grid gap-6">
        <div className="pb-1">
          <h1 className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-5xl">
            Your profile
          </h1>
          <p className="mt-2 max-w-xl text-base leading-7 text-tapit-muted">
            Edit your details and see how your profile looks to others.
          </p>
        </div>
        <ProfileCustomizationEditor
          customization={currentDraft.customization}
          errors={errors}
          identityContent={
            <ProfileIdentityForm
              copyMessage={copyMessage}
              draft={currentDraft}
              imageContent={
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
                </div>
              }
              message={message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
              onChange={updateField}
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
          }
          links={currentDraft.links}
          media={currentDraft.media}
          mediaBusy={mediaBusy}
          mediaError={mediaError}
          onMediaChange={(media) => updateField("media", media)}
          onMediaUpload={uploadLiveMedia}
          onChange={(customization) => updateField("customization", customization)}
        />
        {!currentDraft.customization ? (
          <Panel className="shadow-none" title="Legacy appearance">
            <p className="mt-5 text-sm leading-6 text-tapit-muted">
              This profile keeps its existing appearance until you opt into Warm Studio.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {(["paper", "moss", "night"] as const).map((option) => (
                <button
                  aria-pressed={theme === option}
                  className={`rounded-tapit border p-4 text-left transition ${theme === option ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"}`}
                  key={option}
                  onClick={() => updateField("theme", option)}
                  type="button"
                >
                  <span
                    className={`block h-12 rounded-tapit ${option === "paper" ? "bg-tapit-paper" : option === "moss" ? "bg-[#e8f1eb]" : "bg-[#17211f]"}`}
                  />
                  <span className="mt-3 block text-sm font-semibold capitalize text-tapit-ink">
                    {option}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        ) : null}
        <Panel className="shadow-none" title="Publication">
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge status={profile.status} />{" "}
            <span className="text-sm text-tapit-muted">{publicationState}</span>
          </div>
          {errors.length > 0 ? (
            <ul className="mt-5 grid gap-2 text-sm text-tapit-muted">
              {errors.map((error) => (
                <li key={error} className="flex gap-2">
                  <span aria-hidden="true" className="text-tapit-danger">
                    !
                  </span>
                  {error}
                </li>
              ))}
            </ul>
          ) : liveProfile.status === "published" && !hasChangesSincePublish ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
              <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
              Your published profile is up to date.
            </p>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
              <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
              {liveProfile.status === "published"
                ? "Your saved changes are ready to publish."
                : "Ready to publish. The required name and one valid enabled link are present."}
            </p>
          )}
        </Panel>
      </div>
      <div className="h-fit lg:sticky lg:top-6">
        {preview ? (
          <WorkspacePreview
            mode={previewMode}
            onModeChange={setPreviewMode}
            preview={preview}
            profileUrl={`/${currentDraft.slug}`}
            showProfileUrl
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-tapit-ink">
            {isDirty ? "Draft changes" : "Draft saved"}
          </span>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!isDirty || pending !== null || cropFile !== null || mediaBusy}
              loading={pending === "save"}
              onClick={() => void saveDraft()}
              type="button"
              variant="secondary"
            >
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Save draft
            </Button>
            <Button
              disabled={
                errors.length > 0 ||
                publicationLabel === "Published" ||
                pending !== null ||
                cropFile !== null ||
                mediaBusy
              }
              loading={pending === "publish"}
              onClick={publish}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {publicationLabel}
            </Button>
          </div>
        </div>
      </div>
      {cropFile !== null ? (
        <ProfileImageCropDialog
          busy={pending === "image"}
          file={cropFile}
          onApply={(crop) => void applyImageCrop(crop)}
          onCancel={() => {
            imageRequestRef.current += 1;
            setCropFile(null);
          }}
        />
      ) : null}
    </div>
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
