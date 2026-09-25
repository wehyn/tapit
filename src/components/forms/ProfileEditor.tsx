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
import { prepareProfileImageCrop, validateProfileImageFile, type Crop } from "@/lib/profile-image";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { MissingProfilePage } from "@/components/state/StatePage";
import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";
import { useDraftSaveLink, useDraftSaveRegistration } from "@/components/layout/DraftSaveContext";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function profileForPreview(draft: ProfileContent) {
  return projectPublicProfile({
    id: "preview",
    ownerId: "preview",
    status: "published",
    draft,
    published: { ...draft, publishedAt: new Date().toISOString() },
  });
}

const MAX_DRAFT_SAVE_ATTEMPTS = 3;

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
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [imagePending, setImagePending] = useState(false);
  const imageRequestRef = useRef(0);
  useEffect(
    () => () => {
      imageRequestRef.current += 1;
    },
    [],
  );
  const errors = useMemo(() => {
    const customer = session
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
        immutableSlug: profile.draft.slug,
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
  }, [draft, profile.draft.slug, profile.id, profile.published, profile.status, session, state]);
  const preview = profileForPreview(draft);
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

  const saveDraft = useCallback(async () => {
    if (cropFile !== null || imagePending) return false;
    if (!isDirty) return true;
    try {
      let assignedSlug: string | null = null;
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => {
          assignedSlug = currentProfile.draft.slug;
          return {
            ...currentProfile,
            draft: { ...draft, slug: currentProfile.draft.slug },
          };
        }),
      );
      const savedSlug = assignedSlug;
      if (savedSlug === null) throw new Error("Profile could not be found.");
      const slugWasRefreshed = draft.slug !== savedSlug;
      if (slugWasRefreshed) setDraft((current) => ({ ...current, slug: savedSlug }));
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
  }, [cropFile, draft, imagePending, isDirty, profile.id]);

  useDraftSaveRegistration(saveDraft);

  function publish() {
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
        const nextProfile = {
          ...publishProfile({ ...currentProfile, draft }, occurredAt, {
            existingSlugs: getDemoProfiles(current)
              .filter((candidate) => candidate.id !== profile.id)
              .flatMap((candidate) => [
                candidate.draft.slug,
                ...(candidate.published === null ? [] : [candidate.published.slug]),
              ]),
          }),
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
    const url = `${window.location.origin}/${profile.draft.slug}`;
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
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("That image could not be read. Try again."));
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("That image could not be converted. Try again."));
        reader.readAsDataURL(prepared.blob);
      });
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

  return (
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 pb-28 pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] lg:gap-10 lg:pt-8">
      <h1 className="sr-only">Profile</h1>
      <div className="grid gap-6">
        <Panel className="shadow-none" title="Profile identity">
          <div className="mt-6 grid gap-5">
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            {needsLinkOnboarding(draft, profile.published) ? (
              <Notice>
                Your profile link is ready. Add a Portfolio, TikTok, or contact link, then publish
                it.
                <span className="mt-3 block">
                  <DraftSaveButtonLink href="/app/links">Add your first link</DraftSaveButtonLink>
                </span>
              </Notice>
            ) : null}
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
                    Change photo
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
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-name"
                label="Name"
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. Alex Morgan"
                value={draft.name}
              />
              <TextareaField
                id="profile-bio"
                label="Bio or role"
                maxLength={140}
                onChange={(event) => updateField("bio", event.target.value)}
                placeholder="e.g. Designer helping small teams"
                value={draft.bio ?? ""}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-email"
                label="Email"
                onChange={(event) => updateField("email", event.target.value || undefined)}
                placeholder="you@example.com"
                type="email"
                value={draft.email ?? ""}
              />
              <Field
                id="profile-phone"
                label="Phone"
                onChange={(event) => updateField("phone", event.target.value || undefined)}
                placeholder="+63 917 555 0184"
                type="tel"
                value={draft.phone ?? ""}
              />
              <Field
                id="profile-website"
                label="Website"
                onChange={(event) => updateField("website", event.target.value || undefined)}
                placeholder="https://yourwebsite.com"
                type="url"
                value={draft.website ?? ""}
              />
              <Field
                disabled
                help="Only an administrator can change the assigned profile slug."
                id="profile-slug"
                label="Stable profile slug"
                onChange={(event) => updateField("slug", event.target.value)}
                placeholder="alex-morgan"
                value={profile.draft.slug}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-tapit border border-tapit-line/70 bg-tapit-paper px-4 py-3 text-sm">
              <span className="font-semibold text-tapit-ink">Public URL</span>
              <code className="min-w-0 flex-1 truncate text-xs text-tapit-muted">
                {typeof window === "undefined"
                  ? `/${profile.draft.slug}`
                  : `${window.location.origin}/${profile.draft.slug}`}
              </code>
              <Button onClick={copyUrl} type="button" variant="secondary">
                <CopyIcon aria-hidden="true" className="mr-2" size={17} weight="bold" />
                {copyMessage || "Copy"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel className="shadow-none" title="Profile style">
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
            profileUrl={`/${profile.draft.slug}`}
            showProfileUrl
            theme={theme}
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
              disabled={!isDirty || cropFile !== null || imagePending}
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
                imagePending
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
          error={imageError}
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
  const [imageApplied, setImageApplied] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const navigationSaveRef = useRef<() => Promise<boolean>>(async () => true);
  const registeredSave = useCallback(() => navigationSaveRef.current(), []);
  useDraftSaveRegistration(registeredSave);
  const draftRevisionRef = useRef(0);
  const imageRequestRef = useRef(0);
  const liveProfile = profile;
  const imageRevisionRef = useRef(liveProfile.imageRevision ?? 0);

  useEffect(
    () => () => {
      imageRequestRef.current += 1;
    },
    [],
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
  const preview = profileForPreview(currentDraft);
  const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(liveProfile.draft);
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

  function draftForPersistence(content: ProfileContent) {
    const persistedDraft = { ...content };
    delete persistedDraft.imageUrl;
    return persistedDraft;
  }

  async function saveDraft(keepPublishPending = false): Promise<boolean> {
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
      <h1 className="sr-only">Profile</h1>
      <div className="grid gap-6">
        <Panel className="shadow-none" title="Profile identity">
          <div className="mt-6 grid gap-5">
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
            {needsLinkOnboarding(currentDraft, publishedForValidation) ? (
              <Notice>
                Your profile link is ready. Add a Portfolio, TikTok, or contact link, then publish
                it.
                <span className="mt-3 block">
                  <DraftSaveButtonLink href="/app/links">Add your first link</DraftSaveButtonLink>
                </span>
              </Notice>
            ) : null}
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
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-name"
                label="Name"
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="e.g. Alex Morgan"
                value={currentDraft.name}
              />
              <TextareaField
                id="profile-bio"
                label="Bio or role"
                maxLength={140}
                onChange={(event) => updateField("bio", event.target.value || undefined)}
                placeholder="e.g. Designer helping small teams"
                value={currentDraft.bio ?? ""}
              />
              <Field
                id="profile-email"
                label="Email"
                onChange={(event) => updateField("email", event.target.value || undefined)}
                placeholder="you@example.com"
                type="email"
                value={currentDraft.email ?? ""}
              />
              <Field
                id="profile-phone"
                label="Phone"
                onChange={(event) => updateField("phone", event.target.value || undefined)}
                placeholder="+63 917 555 0184"
                type="tel"
                value={currentDraft.phone ?? ""}
              />
              <Field
                id="profile-website"
                label="Website"
                onChange={(event) => updateField("website", event.target.value || undefined)}
                placeholder="https://yourwebsite.com"
                type="url"
                value={currentDraft.website ?? ""}
              />
              <Field
                disabled
                help="Only an administrator can change the assigned profile slug."
                id="profile-slug"
                label="Stable profile slug"
                onChange={(event) => updateField("slug", event.target.value)}
                placeholder="alex-morgan"
                value={liveProfile.slug}
              />
            </div>
          </div>
        </Panel>
        <Panel className="shadow-none" title="Profile style">
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
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
            profileUrl={`/${liveProfile.slug}`}
            showProfileUrl
            theme={theme}
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
              disabled={!isDirty || pending !== null || cropFile !== null}
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
                cropFile !== null
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
          error={imageError}
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
