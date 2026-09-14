"use client";

import { useMemo, useState } from "react";

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

import { PublicProfile } from "@/components/profile/PublicProfile";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";

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
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 pb-12 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <div className="grid gap-6">
        <Panel
          description="Keep the public identity clear and useful. Changes stay in draft until you publish."
          title="Profile identity"
        >
          <div className="mt-6 grid gap-5">
            {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
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
            <div>
              <label className="block text-sm font-semibold text-tapit-ink" htmlFor="profile-image">
                Profile photo or logo
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className="mt-2 block w-full rounded-xl border border-dashed border-tapit-line bg-tapit-paper px-3.5 py-3 text-sm text-tapit-muted"
                id="profile-image"
                onChange={chooseImage}
                type="file"
              />
              <p className="mt-1.5 text-xs leading-5 text-tapit-muted">
                JPG, PNG, or WebP up to 5 MB. The demo shows a centered crop preview.
              </p>
              {imageError ? (
                <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
                  {imageError}
                </p>
              ) : null}
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
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-tapit-paper px-4 py-3 text-sm">
              <span className="font-semibold text-tapit-ink">Public URL</span>
              <code className="min-w-0 flex-1 truncate text-xs text-tapit-muted">
                {typeof window === "undefined"
                  ? `/${draft.slug}`
                  : `${window.location.origin}/${draft.slug}`}
              </code>
              <Button onClick={copyUrl} type="button" variant="secondary">
                {copyMessage || "Copy"}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel
          description="These controls stay deliberately small so every theme remains readable."
          title="Profile style"
        >
          <div className="mt-6 grid gap-5 sm:grid-cols-3">
            {(["paper", "moss", "night"] as const).map((themeOption) => (
              <button
                aria-pressed={theme === themeOption}
                className={`rounded-2xl border p-4 text-left transition ${theme === themeOption ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"}`}
                key={themeOption}
                onClick={() => chooseTheme(themeOption)}
                type="button"
              >
                <span
                  className={`block h-12 rounded-xl ${themeOption === "paper" ? "bg-tapit-paper" : themeOption === "moss" ? "bg-[#e8f1eb]" : "bg-[#17211f]"}`}
                />
                <span className="mt-3 block text-sm font-semibold capitalize text-tapit-ink">
                  {themeOption}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Publication">
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
            <p className="mt-5 text-sm text-[#17352b]">
              Ready to publish. The required name and one valid enabled link are present.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button disabled={!isDirty} onClick={saveDraft} type="button" variant="secondary">
              Save draft
            </Button>
            <Button disabled={errors.length > 0} onClick={publish} type="button">
              Publish
            </Button>
            {profile.status === "published" ? (
              <Button onClick={unpublish} type="button" variant="quiet">
                Unpublish
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel
        className="h-fit lg:sticky lg:top-6"
        description="Preview pending changes without publishing them."
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
              profileUrl={`/${draft.slug}`}
              theme={theme}
              trackView={false}
            />
          </div>
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </Panel>
    </div>
  );
}
