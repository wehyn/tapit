"use client";

import { useMemo, useState } from "react";
import NextImage from "next/image";
import { CheckCircleIcon, CopyIcon, FloppyDiskIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import {
  projectPublicProfile,
  publishProfile,
  validatePublication,
  validatePublicationAccess,
  type ProfileContent,
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

import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";

function profileForPreview(draft: ProfileContent) {
  return projectPublicProfile({
    id: "preview",
    ownerId: "preview",
    status: "published",
    draft,
    published: { ...draft, publishedAt: new Date().toISOString() },
  });
}

export function ProfileEditor() {
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
  const errors = useMemo(() => {
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
    ];
  }, [draft, profile.id, profile.published, profile.status, session, state]);
  const preview = profileForPreview(draft);
  const slugLocked = profile.published !== null;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(profile.draft);

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

  function saveDraft() {
    try {
      updateDemoState((current) =>
        updateDemoProfile(current, profile.id, (currentProfile) => ({ ...currentProfile, draft })),
      );
      setMessage({
        tone: "success",
        text: "Draft saved. Visitors still see the last published version.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Draft could not be saved.",
      });
    }
  }

  function publish() {
    if (errors.length > 0) {
      setMessage({ tone: "error", text: errors.join(" ") });
      return;
    }
    try {
      const nextProfile = {
        ...publishProfile({ ...profile, draft }, new Date().toISOString(), {
          existingSlugs: getDemoProfiles(state)
            .filter((candidate) => candidate.id !== profile.id)
            .flatMap((candidate) => [
              candidate.draft.slug,
              ...(candidate.published === null ? [] : [candidate.published.slug]),
            ]),
        }),
        theme: profile.theme,
      };
      updateDemoState((current) => ({
        ...updateDemoProfile(current, profile.id, () => nextProfile),
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
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Images must be 5 MB or smaller.");
      return;
    }
    setImageError("");
    const reader = new FileReader();
    reader.onerror = () => setImageError("That image could not be read. Choose another file.");
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setImageError("That image could not be converted. Choose another file.");
        return;
      }
      const image = new Image();
      image.onerror = () =>
        setImageError("That image could not be converted. Choose another file.");
      image.onload = () => {
        try {
          const maxSize = 1200;
          const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          updateField("imageUrl", canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          setImageError("That image could not be converted. Choose another file.");
        }
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
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
        <Panel className="shadow-none" title="Profile identity">
          <div className="mt-6 grid gap-5">
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
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
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-name"
                label="Name"
                onChange={(event) => updateField("name", event.target.value)}
                value={draft.name}
              />
              <TextareaField
                id="profile-bio"
                label="Bio or role"
                maxLength={140}
                onChange={(event) => updateField("bio", event.target.value)}
                value={draft.bio ?? ""}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id="profile-email"
                label="Email"
                onChange={(event) => updateField("email", event.target.value || undefined)}
                type="email"
                value={draft.email ?? ""}
              />
              <Field
                id="profile-phone"
                label="Phone"
                onChange={(event) => updateField("phone", event.target.value || undefined)}
                type="tel"
                value={draft.phone ?? ""}
              />
              <Field
                id="profile-website"
                label="Website"
                onChange={(event) => updateField("website", event.target.value || undefined)}
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
                onChange={(event) => updateField("slug", event.target.value)}
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
              <Button onClick={copyUrl} type="button" variant="secondary">
                <CopyIcon aria-hidden="true" className="mr-2" size={17} weight="bold" />
                {copyMessage || "Copy"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel
          className="shadow-none"
          description="These controls stay deliberately small so every theme remains readable."
          title="Profile style"
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

        <Panel className="shadow-none" title="Publication">
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge status={profile.status} />
            {isDirty ? (
              <span className="text-sm text-tapit-muted">Unsaved draft changes</span>
            ) : (
              <span className="text-sm text-tapit-muted">Draft is saved</span>
            )}
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
          ) : (
            <p className="mt-5 flex items-center gap-2 text-sm text-[#17352b]">
              <CheckCircleIcon aria-hidden="true" size={18} weight="fill" />
              Ready to publish. The required name and one valid enabled link are present.
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
            <Button disabled={!isDirty} onClick={saveDraft} type="button" variant="secondary">
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Save draft
            </Button>
            <Button disabled={errors.length > 0} onClick={publish} type="button">
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              Publish
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
