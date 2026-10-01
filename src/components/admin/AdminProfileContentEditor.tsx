"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import NextImage from "next/image";
import { CheckCircleIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import type { ProfileContent, ProfileLink, ProfileRedirect, ProfileTheme } from "@/lib/domain";
import { validateLinkDestination, validateProfileRedirect } from "@/lib/domain";
import { prepareProfileImageCrop, validateProfileImageFile, type Crop } from "@/lib/profile-image";
import type { ProfileMediaImage, ProfileMediaPresentation } from "@/lib/profile-media";
import { ProfileCustomizationEditor } from "@/components/forms/ProfileCustomizationEditor";
import { ProfileDetailsEditor } from "@/components/forms/ProfileDetailsEditor";
import { ProfileImageCropDialog } from "@/components/forms/ProfileImageCropDialog";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import type { Id } from "../../../convex/_generated/dataModel";

type PreparedProfileImage = { blob: Blob; contentType: string };
type UploadedProfileImage = { imageUrl: string; storageId?: Id<"_storage"> };
type LinkIcon = NonNullable<ProfileLink["icon"]>;

export type AdminProfileContentEditorProps = {
  profileId: string;
  draft: ProfileContent;
  onChange: <K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) => void;
  onUploadPhoto: (image: PreparedProfileImage) => Promise<UploadedProfileImage>;
  onRemovePhoto: () => Promise<void>;
  onUploadMedia: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  onBusyChange?: (busy: boolean) => void;
};

const MAX_PROFILE_LINKS = 100;
const linkIcons: readonly { value: LinkIcon; label: string }[] = [
  { value: "link", label: "Generic link" },
  { value: "globe", label: "Website / globe" },
  { value: "mail", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "calendar", label: "Booking / calendar" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
];

function getLinkError(link: ProfileLink, links: readonly ProfileLink[]): string | undefined {
  if (!link.enabled) return undefined;
  if (!link.label.trim()) return "Add a label so visitors know where this link goes.";
  const destinationError = validateLinkDestination(link.destination);
  if (destinationError) return destinationError;
  const normalizedDestination = link.destination.trim().toLowerCase();
  return links.some(
    (candidate) =>
      candidate.id !== link.id &&
      candidate.enabled &&
      candidate.destination.trim().toLowerCase() === normalizedDestination,
  )
    ? "This destination is already used by another link."
    : undefined;
}

function PhotoEditor({
  profileId,
  draft,
  onChange,
  onUpload,
  onRemove,
  onBusyChange,
}: {
  profileId: string;
  draft: ProfileContent;
  onChange: AdminProfileContentEditorProps["onChange"];
  onUpload: AdminProfileContentEditorProps["onUploadPhoto"];
  onRemove: AdminProfileContentEditorProps["onRemovePhoto"];
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const requestRef = useRef(0);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    onBusyChange(pending || cropFile !== null);
  }, [cropFile, onBusyChange, pending]);

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    const validationError = validateProfileImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setApplied(false);
    setCropFile(file);
  }

  async function applyCrop(crop: Crop) {
    if (cropFile === null || pending) return;
    const requestId = ++requestRef.current;
    setPending(true);
    setError("");
    try {
      const prepared = await prepareProfileImageCrop(cropFile, crop);
      if (requestId !== requestRef.current) return;
      const uploaded = await onUpload(prepared);
      if (requestId !== requestRef.current) return;
      onChange("imageUrl", uploaded.imageUrl);
      onChange("imageStorageId", uploaded.storageId);
      setCropFile(null);
      setApplied(true);
    } catch (uploadError) {
      if (requestId === requestRef.current)
        setError(
          uploadError instanceof Error ? uploadError.message : "The photo could not be saved.",
        );
    } finally {
      if (requestId === requestRef.current) setPending(false);
    }
  }

  async function removePhoto() {
    if (pending) return;
    setPending(true);
    setError("");
    setApplied(false);
    try {
      await onRemove();
      onChange("imageUrl", undefined);
      onChange("imageStorageId", undefined);
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : "The photo could not be removed.",
      );
    } finally {
      setPending(false);
    }
  }

  const photoId = `admin-profile-photo-${profileId}-${id}`;
  const imageContent: ReactNode = (
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
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            htmlFor={photoId}
          >
            <UploadSimpleIcon aria-hidden="true" size={17} weight="bold" />
            {pending ? "Saving..." : "Change photo"}
          </label>
          {draft.imageUrl ? (
            <Button
              disabled={pending || cropFile !== null}
              onClick={removePhoto}
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
            disabled={pending || cropFile !== null}
            id={photoId}
            onChange={(event) => {
              choosePhoto(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
            type="file"
          />
          <p className="basis-full text-xs leading-5 text-tapit-muted">
            JPG, PNG, or WebP. Max 5 MB.
          </p>
        </div>
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-tapit-danger" role="alert">
          {error}
        </p>
      ) : null}
      {applied ? (
        <p
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-tapit-accent-strong"
          role="status"
        >
          <CheckCircleIcon aria-hidden="true" size={16} weight="fill" /> Photo applied
        </p>
      ) : null}
      {cropFile ? (
        <ProfileImageCropDialog
          busy={pending}
          file={cropFile}
          onApply={(crop) => void applyCrop(crop)}
          onCancel={() => {
            requestRef.current += 1;
            setCropFile(null);
          }}
        />
      ) : null}
    </div>
  );

  return <>{imageContent}</>;
}

function LinksAndRedirectEditor({
  draft,
  onChange,
}: {
  draft: ProfileContent;
  onChange: AdminProfileContentEditorProps["onChange"];
}) {
  const redirect: ProfileRedirect = draft.redirect ?? { enabled: false, destination: "" };
  const redirectError = validateProfileRedirect(redirect);

  function updateLink(id: string, patch: Partial<ProfileLink>) {
    onChange(
      "links",
      draft.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    );
  }

  function addLink() {
    if (draft.links.length >= MAX_PROFILE_LINKS) return;
    onChange("links", [
      ...draft.links,
      {
        id: `link-${crypto.randomUUID()}`,
        label: "",
        destination: "",
        enabled: true,
        icon: "link",
      },
    ]);
  }

  function moveLink(id: string, direction: -1 | 1) {
    const index = draft.links.findIndex((link) => link.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.links.length) return;
    const links = [...draft.links];
    const [moved] = links.splice(index, 1);
    if (moved) links.splice(nextIndex, 0, moved);
    onChange("links", links);
  }

  function updateRedirect(patch: Partial<ProfileRedirect>) {
    onChange("redirect", { ...redirect, ...patch });
  }

  return (
    <Panel className="shadow-none" title="Links and card redirect">
      <div className="mt-6 grid gap-5">
        <section className="grid gap-4" aria-label="Card tap and scan redirect">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-tapit-ink">
            <input
              checked={redirect.enabled}
              className="size-4 accent-tapit-accent"
              onChange={(event) => updateRedirect({ enabled: event.target.checked })}
              type="checkbox"
            />
            Redirect card taps and scans
          </label>
          <Field
            error={redirect.enabled ? (redirectError ?? undefined) : undefined}
            id="admin-profile-redirect-destination"
            label="HTTPS destination URL"
            onChange={(event) => updateRedirect({ destination: event.target.value })}
            placeholder="https://www.example.com"
            type="url"
            value={redirect.destination}
          />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-tapit-line pt-5">
          <div>
            <h3 className="text-sm font-semibold text-tapit-ink">Profile links</h3>
            <p className="mt-1 text-xs leading-5 text-tapit-muted">
              {draft.links.length} of {MAX_PROFILE_LINKS}. Enabled links appear on the public card.
            </p>
          </div>
          <Button
            disabled={draft.links.length >= MAX_PROFILE_LINKS}
            onClick={addLink}
            type="button"
            variant="secondary"
          >
            Add link
          </Button>
        </div>
        {draft.links.length === 0 ? <Notice>No links saved.</Notice> : null}
        <div className="grid gap-4">
          {draft.links.map((link, index) => (
            <article
              className="grid gap-4 rounded-tapit border border-tapit-line bg-tapit-paper p-4 sm:p-5"
              key={`${link.id}-${index}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-tapit-ink">Link {index + 1}</h4>
                <div className="flex gap-2">
                  <Button
                    aria-label={`Move ${link.label || `link ${index + 1}`} up`}
                    disabled={index === 0}
                    onClick={() => moveLink(link.id, -1)}
                    type="button"
                    variant="quiet"
                  >
                    Move up
                  </Button>
                  <Button
                    aria-label={`Move ${link.label || `link ${index + 1}`} down`}
                    disabled={index === draft.links.length - 1}
                    onClick={() => moveLink(link.id, 1)}
                    type="button"
                    variant="quiet"
                  >
                    Move down
                  </Button>
                  <Button
                    aria-label={`Remove ${link.label || `link ${index + 1}`}`}
                    onClick={() =>
                      onChange(
                        "links",
                        draft.links.filter((item) => item.id !== link.id),
                      )
                    }
                    type="button"
                    variant="quiet"
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  error={getLinkError(link, draft.links)}
                  id={`admin-link-label-${index}`}
                  label="Label"
                  onChange={(event) => updateLink(link.id, { label: event.target.value })}
                  placeholder="e.g. Portfolio"
                  value={link.label}
                />
                <Field
                  error={getLinkError(link, draft.links)}
                  id={`admin-link-destination-${index}`}
                  label="Destination"
                  onChange={(event) => updateLink(link.id, { destination: event.target.value })}
                  placeholder="https:// or mailto: or tel:"
                  value={link.destination}
                />
                <SelectField
                  id={`admin-link-icon-${index}`}
                  label="Icon"
                  onChange={(event) =>
                    updateLink(link.id, { icon: event.target.value as LinkIcon })
                  }
                  value={link.icon ?? "link"}
                >
                  {linkIcons.map((icon) => (
                    <option key={icon.value} value={icon.value}>
                      {icon.label}
                    </option>
                  ))}
                </SelectField>
                <label className="flex min-h-12 items-center gap-3 self-end rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink">
                  <input
                    checked={link.enabled}
                    className="size-4 accent-tapit-accent"
                    onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
                    type="checkbox"
                  />
                  Enabled
                </label>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function copyToClipboard(slug: string, setMessage: (value: string) => void) {
  const url = `${window.location.origin}/${slug}`;
  if (!navigator.clipboard) {
    setMessage(url);
    return;
  }
  void navigator.clipboard.writeText(url).then(
    () => setMessage("Copied"),
    () => setMessage(url),
  );
}

export function AdminProfileContentEditor({
  profileId,
  draft,
  onChange,
  onUploadPhoto,
  onRemovePhoto,
  onUploadMedia,
  onBusyChange,
}: AdminProfileContentEditorProps) {
  const [copyMessage, setCopyMessage] = useState("");
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const theme: ProfileTheme = draft.theme ?? "paper";

  useEffect(() => {
    onBusyChange?.(mediaBusy || photoBusy);
  }, [mediaBusy, onBusyChange, photoBusy]);

  async function uploadMedia(file: File, target: "background" | "slideshow") {
    setMediaBusy(true);
    setMediaError("");
    try {
      return await onUploadMedia(file, target);
    } catch (uploadError) {
      setMediaError(uploadError instanceof Error ? uploadError.message : "Media upload failed.");
      throw uploadError;
    } finally {
      setMediaBusy(false);
    }
  }

  const imageContent = (
    <PhotoEditor
      draft={draft}
      onChange={onChange}
      onRemove={onRemovePhoto}
      onUpload={onUploadPhoto}
      onBusyChange={setPhotoBusy}
      profileId={profileId}
    />
  );

  return (
    <div className="grid gap-5">
      <ProfileDetailsEditor
        customization={draft.customization}
        copyMessage={copyMessage}
        draft={draft}
        imageContent={imageContent}
        links={draft.links}
        onChange={onChange}
        onCustomizationChange={(next) => onChange("customization", next)}
        onCopyUrl={() => copyToClipboard(draft.slug, setCopyMessage)}
        slugLocked
      />
      <LinksAndRedirectEditor draft={draft} onChange={onChange} />
      <Panel
        className="shadow-none"
        title={draft.customization === undefined ? "Legacy appearance" : "Profile appearance"}
      >
        <div className="mt-6">
          <ProfileCustomizationEditor
            customization={draft.customization}
            media={draft.media as ProfileMediaPresentation | undefined}
            mediaBusy={mediaBusy}
            mediaError={mediaError}
            onChange={(next) => onChange("customization", next)}
            onMediaChange={(next) => onChange("media", next)}
            onMediaUpload={uploadMedia}
            onThemeChange={(nextTheme) => onChange("theme", nextTheme)}
            theme={theme}
          />
        </div>
      </Panel>
      {mediaBusy || photoBusy ? (
        <Notice>Waiting for profile media to finish uploading…</Notice>
      ) : null}
    </div>
  );
}
