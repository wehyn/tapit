"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowRightIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

import {
  normalizeProfileSlug,
  publishProfile,
  validateProfileSlug,
  validatePublicationAccess,
  type ProfileContent,
  type PublishedProfileSnapshot,
  type ProfileStatus,
} from "@/lib/domain";
import {
  stripProfileMediaUrls,
  type ProfileMediaImage,
  type ProfileMediaPresentation,
} from "@/lib/profile-media";
import { requirePairedConvexSiteUrl } from "@/lib/convex-site-url";
import {
  getDemoProfiles,
  updateDemoProfile,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ProfileDetails, type AdminProfileDetailsView } from "@/components/admin/ProfileDetails";
import { AdminProfileContentEditor } from "@/components/admin/AdminProfileContentEditor";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Confirmation = "unpublish" | "suspend" | null;
type ProfileDialogTab = "edit" | "details";
type LiveAdminProfileDetails = NonNullable<
  ReturnType<typeof useQuery<typeof api.profiles.adminDetails>>
>;
type AdminDraftForPersistence = ProfileContent & { media?: ProfileMediaPresentation | null };

function adminDraftForPersistence(
  content: ProfileContent,
  hasPersistedMedia: boolean,
): AdminDraftForPersistence {
  const draft = { ...content, links: content.links.map((link) => ({ ...link })) };
  delete draft.imageUrl;
  if (content.media === undefined) {
    if (hasPersistedMedia) return { ...draft, media: null } as unknown as AdminDraftForPersistence;
    delete draft.media;
    return draft;
  }

  const media = stripProfileMediaUrls(content.media);
  if (media === undefined) {
    if (hasPersistedMedia) return { ...draft, media: null } as unknown as AdminDraftForPersistence;
    delete draft.media;
  } else {
    draft.media = media;
  }
  return draft;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read. Try again."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("That image could not be converted. Try again."));
    reader.readAsDataURL(blob);
  });
}

function parseAdminImageUploadResponse(value: unknown): {
  storageId: Id<"_storage">;
  imageUrl: string;
  imageRevision: number;
} {
  if (typeof value !== "object" || value === null)
    throw new Error("The image service returned an invalid response.");
  const response = value as { storageId?: unknown; imageUrl?: unknown; imageRevision?: unknown };
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

function parseAdminMediaUploadResponse(value: unknown): ProfileMediaImage & {
  mediaRevision: number;
} {
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

function toProfileContent(content: LiveAdminProfileDetails["profile"]["draft"]): ProfileContent {
  return {
    ...content,
    links: content.links.map((link) => ({
      ...link,
      icon: link.icon as ProfileContent["links"][number]["icon"],
    })),
  } as ProfileContent;
}

function formatLifecycleTimestamp(value: number | undefined): string | null {
  if (value === undefined) return null;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(value);
}

function toAdminProfileDetailsView(details: LiveAdminProfileDetails): AdminProfileDetailsView {
  const { profile } = details;
  const published: PublishedProfileSnapshot | null = profile.published
    ? ({
        ...profile.published,
        links: profile.published.links.map((link) => ({
          ...link,
          icon: link.icon as ProfileContent["links"][number]["icon"],
        })),
        publishedAt: new Date(profile.published.publishedAt).toISOString(),
      } as PublishedProfileSnapshot)
    : null;

  return {
    currentSlug: profile.slug,
    draft: toProfileContent(profile.draft),
    published,
    status: profile.status,
    customerEmail: details.customerEmail,
    assignedCardCount: details.assignedCardCount,
    assignedCardCountIsCapped: details.assignedCardCountIsCapped,
    createdAt: formatLifecycleTimestamp(profile.createdAt),
    updatedAt: formatLifecycleTimestamp(profile.updatedAt),
    publishedAt: formatLifecycleTimestamp(profile.publishedAt),
    unpublishedAt: formatLifecycleTimestamp(profile.unpublishedAt),
    suspendedAt: formatLifecycleTimestamp(profile.suspendedAt),
  };
}

function ProfileDialog({
  active,
  details,
  description,
  editor,
  onClose,
  title,
}: {
  active: boolean;
  details: ReactNode;
  description?: string;
  editor: ReactNode;
  onClose: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const editTabRef = useRef<HTMLButtonElement>(null);
  const detailsTabRef = useRef<HTMLButtonElement>(null);
  const [selectedTab, setSelectedTab] = useState<ProfileDialogTab>("edit");

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: ProfileDialogTab,
  ) {
    let nextTab: ProfileDialogTab | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextTab = currentTab === "edit" ? "details" : "edit";
    } else if (event.key === "Home") {
      nextTab = "edit";
    } else if (event.key === "End") {
      nextTab = "details";
    }
    if (nextTab === null) return;

    event.preventDefault();
    setSelectedTab(nextTab);
    (nextTab === "edit" ? editTabRef : detailsTabRef).current?.focus();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    function trapFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) => !element.hasAttribute("disabled") && element.closest("[hidden]") === null,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;

      const activeElement = document.activeElement;
      const focusIsInsideDialog =
        activeElement instanceof Node && dialogRef.current.contains(activeElement);
      if (!focusIsInsideDialog || activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      triggerRef.current?.focus();
    };
  }, [active]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-tapit-ink/70 px-3 py-3 sm:px-6 sm:py-6">
      <div
        aria-labelledby="admin-profile-dialog-title"
        aria-hidden={!active}
        aria-modal={active}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-tapit border border-tapit-line bg-tapit-surface shadow-[0_24px_80px_rgba(21,25,24,0.24)] sm:max-h-[calc(100dvh-3rem)]"
        id="admin-profile-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-tapit-line px-5 py-5 sm:px-8 sm:py-6">
          <div className="min-w-0">
            <h2
              className="text-2xl font-semibold tracking-tight text-tapit-ink"
              id="admin-profile-dialog-title"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-tapit-muted">{description}</p>
            ) : null}
          </div>
          <Button
            aria-label="Close profile details"
            className="h-10 w-10 shrink-0 px-0 text-xl leading-none"
            onClick={onClose}
            type="button"
            variant="quiet"
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
        <div className="shrink-0 border-b border-tapit-line px-5 sm:px-8">
          <div aria-label="Profile sections" className="flex gap-4 sm:gap-6" role="tablist">
            <button
              aria-controls="admin-profile-editor-panel"
              aria-selected={selectedTab === "edit"}
              className={`min-h-14 border-b-2 px-1 text-sm font-semibold transition-colors focus-visible:rounded-tapit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tapit-accent ${selectedTab === "edit" ? "border-tapit-accent text-tapit-ink" : "border-transparent text-tapit-muted hover:border-tapit-line hover:text-tapit-ink"}`}
              id="admin-profile-editor-tab"
              onClick={() => setSelectedTab("edit")}
              onKeyDown={(event) => handleTabKeyDown(event, "edit")}
              ref={editTabRef}
              role="tab"
              tabIndex={selectedTab === "edit" ? 0 : -1}
              type="button"
            >
              Edit profile
            </button>
            <button
              aria-controls="admin-profile-details-panel"
              aria-selected={selectedTab === "details"}
              className={`min-h-14 border-b-2 px-1 text-sm font-semibold transition-colors focus-visible:rounded-tapit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tapit-accent ${selectedTab === "details" ? "border-tapit-accent text-tapit-ink" : "border-transparent text-tapit-muted hover:border-tapit-line hover:text-tapit-ink"}`}
              id="admin-profile-details-tab"
              onClick={() => setSelectedTab("details")}
              onKeyDown={(event) => handleTabKeyDown(event, "details")}
              ref={detailsTabRef}
              role="tab"
              tabIndex={selectedTab === "details" ? 0 : -1}
              type="button"
            >
              Details &amp; slug
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <div
            aria-labelledby="admin-profile-editor-tab"
            hidden={selectedTab !== "edit"}
            id="admin-profile-editor-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {editor}
          </div>
          <div
            aria-labelledby="admin-profile-details-tab"
            hidden={selectedTab !== "details"}
            id="admin-profile-details-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {details}
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoProfilesManager() {
  const state = useDemoState();
  const profiles = getDemoProfiles(state);
  const [query, setQuery] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [slugValue, setSlugValue] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingProfiles = profiles.filter((candidate) =>
    `${candidate.draft.name} ${candidate.draft.slug}`.toLowerCase().includes(normalizedQuery),
  );
  const profile = profiles.find((candidate) => candidate.id === selectedProfileId);

  const owner = profile
    ? state.customers.find((customer) => customer.id === profile.ownerId)
    : undefined;
  const assignedCardCount = profile
    ? state.cards.filter((card) => card.profileId === profile.id).length
    : 0;
  const detailsView: AdminProfileDetailsView | null = profile
    ? {
        currentSlug: profile.draft.slug,
        draft: profile.draft,
        published: profile.published,
        status: profile.status,
        customerEmail: owner?.email ?? null,
        assignedCardCount: Math.min(assignedCardCount, 1000),
        assignedCardCountIsCapped: assignedCardCount > 1000,
        createdAt: null,
        updatedAt: null,
        publishedAt: null,
        unpublishedAt: null,
        suspendedAt: null,
      }
    : null;

  function updateDraft<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    if (profile === undefined) return;
    updateDemoState((current) =>
      updateDemoProfile(current, profile.id, (currentProfile) => ({
        ...currentProfile,
        draft: { ...currentProfile.draft, [field]: value },
      })),
    );
  }

  async function uploadDemoPhoto(image: { blob: Blob }) {
    return { imageUrl: await readBlobAsDataUrl(image.blob) };
  }

  async function uploadDemoMedia(file: File): Promise<ProfileMediaImage> {
    const dataUrl = await readBlobAsDataUrl(file);
    return {
      assetId:
        `demo-media-${Date.now()}-${Math.random().toString(36).slice(2)}` as ProfileMediaImage["assetId"],
      altText: "",
      url: dataUrl,
      previewUrl: dataUrl,
    };
  }

  function saveDraft() {
    if (profile === undefined || !profile.draft.name.trim()) {
      setMessage({ tone: "error", text: "A profile name is required." });
      return;
    }
    updateDemoState((current) => ({
      ...current,
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action: "profile.draft_updated",
          target: profile.draft.slug,
          occurredAt: new Date().toISOString(),
        },
        ...current.audits,
      ],
    }));
    setMessage({
      tone: "success",
      text: "Administrative draft changes saved. Public content is unchanged until publication.",
    });
  }

  function saveSlug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile === undefined) return;

    const normalizedSlug = normalizeProfileSlug(slugValue);
    const existingSlugs = profiles
      .filter((candidate) => candidate.id !== profile.id)
      .flatMap((candidate) => [
        candidate.draft.slug,
        ...(candidate.published === null ? [] : [candidate.published.slug]),
      ]);
    const validationError = validateProfileSlug(normalizedSlug, { existingSlugs });
    if (validationError !== null) {
      setSlugError(validationError);
      setSlugSuccess(null);
      return;
    }
    if (normalizedSlug === profile.draft.slug) {
      setSlugValue(profile.draft.slug);
      setSlugError(null);
      setSlugSuccess("The profile already uses this slug.");
      return;
    }

    const occurredAt = new Date().toISOString();
    updateDemoState((current) => {
      const currentProfile = getDemoProfiles(current).find(
        (candidate) => candidate.id === profile.id,
      );
      if (currentProfile === undefined) return current;
      return {
        ...updateDemoProfile(current, profile.id, (candidate) => ({
          ...candidate,
          draft: { ...candidate.draft, slug: normalizedSlug },
          published:
            candidate.published === null ? null : { ...candidate.published, slug: normalizedSlug },
        })),
        audits: [
          {
            id: `audit-${Date.now()}`,
            actor: "admin@tapit.local",
            action: "profile.slug_changed",
            target: normalizedSlug,
            targetAccountEmail: current.customers.find(
              (customer) => customer.id === currentProfile.ownerId,
            )?.email,
            occurredAt,
            before: currentProfile.draft.slug,
            after: normalizedSlug,
          },
          ...current.audits,
        ],
      };
    });
    setSlugValue(normalizedSlug);
    setSlugError(null);
    setSlugSuccess("Profile slug changed.");
  }

  function publish() {
    if (profile === undefined) return;
    const owner = state.customers.find((customer) => customer.id === profile.ownerId);
    const lifecycleErrors = validatePublicationAccess(
      profile.status,
      owner?.status,
      owner?.deletionStatus,
    );
    if (lifecycleErrors.length > 0) {
      setMessage({
        tone: "error",
        text: lifecycleErrors.join(" "),
      });
      return;
    }
    try {
      updateDemoState((current) => {
        const existingSlugs = getDemoProfiles(current)
          .filter((candidate) => candidate.id !== profile.id)
          .flatMap((candidate) => [
            candidate.draft.slug,
            ...(candidate.published === null ? [] : [candidate.published.slug]),
          ]);
        const nextProfile = {
          ...publishProfile(profile, new Date().toISOString(), { existingSlugs }),
          theme: profile.theme,
        };
        return {
          ...updateDemoProfile(current, profile.id, () => nextProfile),
          audits: [
            {
              id: `audit-${Date.now()}`,
              actor: "admin@tapit.local",
              action: "profile.published",
              target: nextProfile.draft.slug,
              occurredAt: new Date().toISOString(),
              after: "published",
            },
            ...current.audits,
          ],
        };
      });
      setMessage({
        tone: "success",
        text: "Profile published. The stable public URL now serves the approved snapshot.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be published.",
      });
    }
  }

  function updateStatus(status: ProfileStatus, action: string) {
    if (profile === undefined) return;
    updateDemoState((current) => ({
      ...updateDemoProfile(current, profile.id, (currentProfile) => ({
        ...currentProfile,
        status,
      })),
      audits: [
        {
          id: `audit-${Date.now()}`,
          actor: "admin@tapit.local",
          action,
          target: profile.draft.slug,
          occurredAt: new Date().toISOString(),
          before: profile.status,
          after: status,
        },
        ...current.audits,
      ],
    }));
    setConfirmation(null);
    setMessage({ tone: "success", text: `Profile status changed to ${status}.` });
  }

  function confirmAction() {
    if (confirmation === "unpublish") updateStatus("unpublished", "profile.unpublished");
    if (confirmation === "suspend") updateStatus("suspended", "profile.suspended");
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Moderation actions affect the public state immediately and are recorded with the administrator and before/after status."
        title="Profile management"
      >
        {message && profile === undefined ? (
          <div className="mt-6">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        <div className="mt-6 max-w-md">
          <Field
            id="profile-search"
            label="Search profiles"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or slug"
            type="search"
            value={query}
          />
        </div>
      </Panel>

      <Panel className="p-3 sm:p-4" title="Profile registry">
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matchingProfiles.length === 0 ? <Notice>No profiles match this search.</Notice> : null}
          {matchingProfiles.map((candidate) => (
            <button
              aria-describedby={`profile-status-${candidate.id}`}
              aria-label={`${candidate.draft.name || "Unnamed profile"} /${candidate.draft.slug}`}
              aria-controls={candidate.id === profile?.id ? "admin-profile-dialog" : undefined}
              aria-expanded={candidate.id === profile?.id}
              aria-haspopup="dialog"
              className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-tapit border p-3.5 text-left transition-colors ${candidate.id === profile?.id ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent/50"}`}
              key={candidate.id}
              onClick={() => {
                setSelectedProfileId(candidate.id);
                setSlugValue(candidate.draft.slug);
                setSlugError(null);
                setSlugSuccess(null);
              }}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-tapit-ink">
                  {candidate.draft.name || "Unnamed profile"}
                </span>
                <span className="mt-1 block truncate text-sm text-tapit-muted">
                  /{candidate.draft.slug}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span id={`profile-status-${candidate.id}`}>
                  <StatusBadge status={candidate.status} />
                </span>
                <ArrowRightIcon aria-hidden="true" className="text-tapit-muted" size={18} />
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {profile ? (
        <ProfileDialog
          active={confirmation === null}
          description={`${profile.draft.name || "Unnamed profile"} · owned by ${state.customers.find((customer) => customer.profileId === profile.id)?.email ?? "unassigned"}`}
          onClose={() => {
            setSelectedProfileId(null);
            setSlugValue("");
            setSlugError(null);
            setSlugSuccess(null);
          }}
          title={`${profile.draft.name || "Unnamed"} profile`}
          editor={
            <>
              {message ? (
                <div className="mt-5">
                  <Notice tone={message.tone}>{message.text}</Notice>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <StatusBadge status={profile.status} />
                {profile.status === "published" ? (
                  <span className="inline-flex items-center gap-1 text-sm text-tapit-accent-strong">
                    <CheckCircleIcon aria-hidden="true" size={17} weight="fill" /> Public
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-sm text-tapit-muted">
                    <WarningCircleIcon aria-hidden="true" size={17} /> Needs review
                  </span>
                )}
                <span className="text-sm text-tapit-muted">
                  Current slug: <code>{profile.draft.slug}</code>
                </span>
              </div>
              <AdminProfileContentEditor
                draft={profile.draft}
                onBusyChange={setEditorBusy}
                onChange={updateDraft}
                onRemovePhoto={async () => Promise.resolve()}
                onUploadMedia={uploadDemoMedia}
                onUploadPhoto={uploadDemoPhoto}
                profileId={profile.id}
              />
              <div className="mt-5 flex flex-wrap gap-3">
                <Button disabled={editorBusy} onClick={saveDraft} type="button" variant="secondary">
                  Save admin draft
                </Button>
                <Button
                  disabled={editorBusy || profile.status === "suspended"}
                  onClick={publish}
                  type="button"
                >
                  Publish
                </Button>
                {profile.status === "published" || profile.status === "draft" ? (
                  <Button
                    onClick={() => setConfirmation("unpublish")}
                    type="button"
                    variant="quiet"
                  >
                    Unpublish
                  </Button>
                ) : null}
                {profile.status === "unpublished" ? (
                  <Button
                    onClick={() => updateStatus("published", "profile.restored")}
                    type="button"
                    variant="secondary"
                  >
                    Restore profile
                  </Button>
                ) : profile.status !== "suspended" ? (
                  <Button onClick={() => setConfirmation("suspend")} type="button" variant="danger">
                    Suspend
                  </Button>
                ) : (
                  <Button
                    onClick={() =>
                      updateStatus(profile.published ? "published" : "draft", "profile.restored")
                    }
                    type="button"
                    variant="secondary"
                  >
                    Restore profile
                  </Button>
                )}
              </div>
            </>
          }
          details={
            <>
              {detailsView ? (
                <ProfileDetails
                  isSubmitting={false}
                  onSlugChange={(value) => {
                    setSlugValue(value);
                    setSlugError(null);
                    setSlugSuccess(null);
                  }}
                  onSlugSubmit={saveSlug}
                  slugError={slugError}
                  slugSuccess={slugSuccess}
                  slugValue={slugValue}
                  view={detailsView}
                />
              ) : null}
              <div className="mt-8 border-t border-tapit-line pt-6">
                <ButtonLink href="/admin/audit-log" variant="quiet">
                  View audit history
                </ButtonLink>
              </div>
            </>
          }
        />
      ) : null}

      <ConfirmDialog
        confirmLabel={confirmation === "suspend" ? "Suspend profile" : "Unpublish profile"}
        description={
          confirmation === "suspend"
            ? "This hides the public profile and every assigned active card immediately. The profile remains assigned for later restoration."
            : "This hides the public profile immediately. Assigned cards remain assigned but show the unavailable page."
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={confirmAction}
        open={confirmation !== null}
        title={confirmation === "suspend" ? "Suspend this profile?" : "Unpublish this profile?"}
      />
    </div>
  );
}

function LiveProfilesManager() {
  const convex = useConvex();
  const authToken = useAuthToken();
  const {
    results: allProfiles,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(api.profiles.adminListPaginated, {}, { initialNumItems: 25 });
  const save = useMutation(api.profiles.saveDraft);
  const publish = useMutation(api.profiles.publish);
  const setStatus = useMutation(api.profiles.setStatus);
  const changeSlug = useMutation(api.profiles.changeSlug);
  const removeImage = useMutation(api.storage.removeImageAsAdmin);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"profiles"> | null>(null);
  const selectedIdRef = useRef<Id<"profiles"> | null>(null);
  const [draftState, setDraftState] = useState<{
    profileId: Id<"profiles">;
    draft: ProfileContent;
    dirty: boolean;
    serverProfileKey: string;
  } | null>(null);
  const uploadRevisionsRef = useRef(
    new Map<Id<"profiles">, { imageRevision: number; mediaRevision: number }>(),
  );
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "publish" | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<{
    profileId: Id<"profiles">;
    profileKey: string;
    details: LiveAdminProfileDetails;
  } | null>(null);
  const [detailsFailure, setDetailsFailure] = useState<{
    profileId: Id<"profiles">;
    profileKey: string;
    message: string;
  } | null>(null);
  const [slugValue, setSlugValue] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSuccess, setSlugSuccess] = useState<string | null>(null);
  const [slugSubmittingFor, setSlugSubmittingFor] = useState<Id<"profiles"> | null>(null);
  const matching = allProfiles.filter((profile) =>
    `${profile.draft.name} ${profile.draft.slug}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const profile = allProfiles.find((candidate) => candidate._id === selectedId);
  const selectedProfileKey = profile === undefined ? null : JSON.stringify(profile);

  useEffect(() => {
    if (selectedId === null || selectedProfileKey === null) return;
    let isCurrent = true;
    void convex
      .query(api.profiles.adminDetails, { profileId: selectedId })
      .then((result) => {
        if (!isCurrent) return;
        setDetailsSnapshot({
          profileId: selectedId,
          profileKey: selectedProfileKey,
          details: result,
        });
        setDetailsFailure(null);
        setSlugValue(result.profile.slug);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        setDetailsFailure({
          profileId: selectedId,
          profileKey: selectedProfileKey,
          message: error instanceof Error ? error.message : "Profile details could not be loaded.",
        });
      });
    return () => {
      isCurrent = false;
    };
  }, [convex, selectedId, selectedProfileKey]);

  const profileDetails =
    detailsSnapshot?.profileId === selectedId && detailsSnapshot.profileKey === selectedProfileKey
      ? detailsSnapshot.details
      : null;
  const detailsError =
    detailsFailure?.profileId === selectedId && detailsFailure.profileKey === selectedProfileKey
      ? detailsFailure.message
      : null;
  const detailsLoading =
    selectedId !== null &&
    selectedProfileKey !== null &&
    profileDetails === null &&
    detailsError === null;
  const detailsView = profileDetails ? toAdminProfileDetailsView(profileDetails) : null;
  const localDraftState =
    profile !== undefined &&
    draftState !== null &&
    draftState.profileId === profile._id &&
    (draftState.dirty || draftState.serverProfileKey === selectedProfileKey)
      ? draftState
      : null;
  const currentDraft =
    profile === undefined
      ? null
      : localDraftState !== null
        ? localDraftState.draft
        : profileDetails === null
          ? null
          : toProfileContent(profileDetails.profile.draft);
  const hasUnsavedChanges = localDraftState?.dirty ?? false;

  function uploadRevisionsFor(selected: NonNullable<typeof profile>) {
    const existing = uploadRevisionsRef.current.get(selected._id);
    if (existing) return existing;
    const initial = {
      imageRevision: selected.imageRevision ?? 0,
      mediaRevision: selected.mediaRevision ?? 0,
    };
    uploadRevisionsRef.current.set(selected._id, initial);
    return initial;
  }

  if (paginationStatus === "LoadingFirstPage")
    return <div className="p-8 text-sm text-tapit-muted">Loading profiles…</div>;

  async function uploadPhoto(prepared: { blob: Blob; contentType: string }) {
    if (!profile) throw new Error("Select a profile before uploading a photo.");
    if (authToken === null) throw new Error("Authentication is required to upload a photo.");
    const revisions = uploadRevisionsFor(profile);
    const siteUrl = requirePairedConvexSiteUrl(
      process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
    );
    const response = await fetch(`${siteUrl}/admin-profile-image-upload`, {
      method: "POST",
      body: prepared.blob,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": prepared.contentType,
        "X-Image-Revision": String(revisions.imageRevision),
        "X-Profile-Id": profile._id,
      },
    });
    if (!response.ok)
      throw new Error((await response.text()) || "The image upload failed. Choose another file.");
    const uploaded = parseAdminImageUploadResponse(await response.json());
    revisions.imageRevision = uploaded.imageRevision;
    return { imageUrl: uploaded.imageUrl, storageId: uploaded.storageId };
  }

  async function removePhoto() {
    if (!profile) throw new Error("Select a profile before removing its photo.");
    const revisions = uploadRevisionsFor(profile);
    const result = await removeImage({
      profileId: profile._id,
      expectedImageRevision: revisions.imageRevision,
    });
    revisions.imageRevision = result.imageRevision;
  }

  async function uploadMedia(file: File): Promise<ProfileMediaImage> {
    if (!profile) throw new Error("Select a profile before uploading media.");
    if (authToken === null) throw new Error("Authentication is required to upload media.");
    const revisions = uploadRevisionsFor(profile);
    const siteUrl = requirePairedConvexSiteUrl(
      process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "",
    );
    const response = await fetch(`${siteUrl}/admin-profile-media-upload`, {
      method: "POST",
      body: file,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": file.type,
        "X-Media-Revision": String(revisions.mediaRevision),
        "X-Profile-Id": profile._id,
      },
    });
    if (!response.ok)
      throw new Error((await response.text()) || "The media upload failed. Choose another file.");
    const uploaded = parseAdminMediaUploadResponse(await response.json());
    revisions.mediaRevision = uploaded.mediaRevision;
    return uploaded;
  }

  async function persistDraft(selected: NonNullable<typeof profile>, draft: ProfileContent) {
    const revisions = uploadRevisionsFor(selected);
    const persisted = await save({
      profileId: selected._id,
      draft: adminDraftForPersistence(draft, selected.draft.media !== undefined),
      expectedImageRevision: revisions.imageRevision,
      expectedMediaRevision: revisions.mediaRevision,
    });
    revisions.imageRevision = persisted.imageRevision;
    revisions.mediaRevision = persisted.mediaRevision;
  }

  async function saveDraft() {
    if (!profile || !currentDraft || editorBusy || pendingAction !== null) return;
    const selectedProfile = profile;
    const draftToSave = currentDraft;
    setPendingAction("save");
    try {
      await persistDraft(selectedProfile, draftToSave);
      setDraftState((previous) =>
        previous !== null &&
        previous.profileId === selectedProfile._id &&
        previous.draft === draftToSave
          ? { ...previous, dirty: false }
          : previous,
      );
      setMessage({ tone: "success", text: "Administrative draft changes saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Draft could not be saved.",
      });
    } finally {
      setPendingAction(null);
    }
  }
  async function changeStatus(status: "draft" | "published" | "unpublished" | "suspended") {
    if (!profile) return;
    try {
      await setStatus({ profileId: profile._id, status });
      setConfirmation(null);
      setMessage({ tone: "success", text: `Profile status changed to ${status}.` });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile status could not be changed.",
      });
    }
  }

  async function saveSlug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profile === undefined) return;
    const profileId = profile._id;
    const previousSlug = profile.slug;
    const draftBeforeRename = currentDraft;
    setSlugSubmittingFor(profileId);
    setSlugError(null);
    setSlugSuccess(null);
    try {
      const result = await changeSlug({ profileId, slug: slugValue });
      setDraftState((previous) => {
        if (selectedIdRef.current !== profileId) return previous;
        let latestDraft = draftBeforeRename;
        let dirty = false;
        let serverProfileKey = selectedProfileKey ?? "";
        if (
          previous !== null &&
          previous.profileId === profileId &&
          (previous.dirty || previous.serverProfileKey === selectedProfileKey)
        ) {
          latestDraft = previous.draft;
          dirty = previous.dirty;
          serverProfileKey = previous.serverProfileKey;
        }
        return latestDraft === null
          ? previous
          : {
              profileId,
              draft: { ...latestDraft, slug: result.slug },
              dirty,
              serverProfileKey,
            };
      });
      if (selectedIdRef.current === profileId) {
        setSlugValue(result.slug);
        setSlugSuccess(
          result.slug === previousSlug
            ? "The profile already uses this slug."
            : "Profile slug changed.",
        );
      }
    } catch (error) {
      if (selectedIdRef.current === profileId)
        setSlugError(error instanceof Error ? error.message : "Profile slug could not be changed.");
    } finally {
      setSlugSubmittingFor((current) => (current === profileId ? null : current));
    }
  }

  async function publishProfile() {
    if (!profile || !currentDraft || editorBusy || pendingAction !== null) return;
    const selectedProfile = profile;
    const profileId = selectedProfile._id;
    const draftToPublish = currentDraft;
    const shouldSaveDraft =
      draftState !== null && draftState.profileId === profileId && draftState.dirty;
    setPendingAction("publish");
    try {
      if (shouldSaveDraft) {
        await persistDraft(selectedProfile, draftToPublish);
        setDraftState((previous) =>
          previous !== null && previous.profileId === profileId && previous.draft === draftToPublish
            ? { ...previous, dirty: false }
            : previous,
        );
      }
      const revisions = uploadRevisionsFor(selectedProfile);
      await publish({
        profileId,
        expectedImageRevision: revisions.imageRevision,
        expectedMediaRevision: revisions.mediaRevision,
      });
      setMessage({ tone: "success", text: "Profile published." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be published.",
      });
    } finally {
      setPendingAction(null);
    }
  }
  function updateDraft<K extends keyof ProfileContent>(field: K, value: ProfileContent[K]) {
    if (!profile || !currentDraft) return;
    const profileId = profile._id;
    const baseDraft = currentDraft;
    setDraftState((previous) => {
      if (selectedIdRef.current !== profileId) return previous;
      let source = baseDraft;
      let serverProfileKey = selectedProfileKey ?? "";
      if (
        previous !== null &&
        previous.profileId === profileId &&
        (previous.dirty || previous.serverProfileKey === selectedProfileKey)
      ) {
        source = previous.draft;
        serverProfileKey = previous.serverProfileKey;
      }
      return {
        profileId,
        draft: { ...source, [field]: value },
        dirty: true,
        serverProfileKey,
      };
    });
    setMessage(null);
  }
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Moderation actions are authorized and audited by Convex."
        title="Profile management"
      >
        {message && profile === undefined ? (
          <div className="mt-6">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}
        <div className="mt-6 max-w-md">
          <Field
            id="profile-search"
            label="Search profiles"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or slug"
            type="search"
            value={query}
          />
        </div>
      </Panel>
      <Panel className="p-3 sm:p-4" title="Profile registry">
        <div className="mt-3 grid gap-2">
          {matching.length === 0 ? (
            <Notice>
              {query.trim() !== "" && paginationStatus === "CanLoadMore"
                ? "No profiles on the loaded pages match. Load more profiles to continue searching."
                : "No profiles match this search."}
            </Notice>
          ) : (
            matching.map((candidate) => (
              <button
                aria-controls={candidate._id === profile?._id ? "admin-profile-dialog" : undefined}
                aria-expanded={candidate._id === profile?._id}
                aria-haspopup="dialog"
                className="flex min-h-16 w-full items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-3 text-left"
                key={candidate._id}
                onClick={() => {
                  selectedIdRef.current = candidate._id;
                  setSelectedId(candidate._id);
                  setDraftState(null);
                  setSlugValue(candidate.slug);
                  setSlugError(null);
                  setSlugSuccess(null);
                  setMessage(null);
                  setDetailsFailure(null);
                }}
                type="button"
              >
                <span>
                  <span className="block font-semibold text-tapit-ink">
                    {candidate.draft.name || "Unnamed profile"}
                  </span>
                  <span className="mt-1 block text-sm text-tapit-muted">
                    /{candidate.draft.slug}
                  </span>
                </span>
                <StatusBadge status={candidate.status} />
              </button>
            ))
          )}
          {paginationStatus !== "Exhausted" ? (
            <Button
              disabled={paginationStatus !== "CanLoadMore"}
              onClick={() => loadMore(25)}
              type="button"
              variant="secondary"
            >
              {paginationStatus === "LoadingMore" ? "Loading more profiles…" : "Load more profiles"}
            </Button>
          ) : null}
        </div>
      </Panel>

      {profile ? (
        <ProfileDialog
          active={confirmation === null}
          onClose={() => {
            selectedIdRef.current = null;
            setSelectedId(null);
            setDraftState(null);
            setSlugValue("");
            setSlugError(null);
            setSlugSuccess(null);
            setMessage(null);
            setDetailsFailure(null);
          }}
          title={`${currentDraft?.name || profile.draft.name || "Unnamed"} profile`}
          editor={
            <>
              {message ? (
                <div className="mt-5">
                  <Notice tone={message.tone}>{message.text}</Notice>
                </div>
              ) : null}
              {currentDraft ? (
                <fieldset className="min-w-0" disabled={pendingAction !== null}>
                  <AdminProfileContentEditor
                    draft={currentDraft}
                    onBusyChange={setEditorBusy}
                    onChange={updateDraft}
                    onRemovePhoto={removePhoto}
                    onUploadMedia={uploadMedia}
                    onUploadPhoto={uploadPhoto}
                    profileId={profile._id}
                  />
                </fieldset>
              ) : (
                <Notice>{detailsError ?? "Loading profile details…"}</Notice>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  disabled={
                    editorBusy ||
                    pendingAction !== null ||
                    currentDraft === null ||
                    !hasUnsavedChanges
                  }
                  loading={pendingAction === "save"}
                  onClick={saveDraft}
                  type="button"
                  variant="secondary"
                >
                  {pendingAction === "save" ? "Saving…" : "Save admin draft"}
                </Button>
                <Button
                  disabled={
                    profile.status === "suspended" ||
                    editorBusy ||
                    pendingAction !== null ||
                    currentDraft === null
                  }
                  loading={pendingAction === "publish"}
                  onClick={publishProfile}
                  type="button"
                >
                  {pendingAction === "publish" ? "Publishing…" : "Publish"}
                </Button>
                {profile.status === "published" || profile.status === "draft" ? (
                  <Button
                    disabled={pendingAction !== null}
                    onClick={() => setConfirmation("unpublish")}
                    type="button"
                    variant="quiet"
                  >
                    Unpublish
                  </Button>
                ) : null}
                {profile.status === "unpublished" ? (
                  <Button
                    disabled={pendingAction !== null}
                    onClick={() => void changeStatus("published")}
                    type="button"
                    variant="secondary"
                  >
                    Restore profile
                  </Button>
                ) : (
                  <Button
                    disabled={pendingAction !== null}
                    onClick={() =>
                      profile.status === "suspended"
                        ? changeStatus(profile.published ? "published" : "draft")
                        : setConfirmation("suspend")
                    }
                    type="button"
                    variant={profile.status === "suspended" ? "secondary" : "danger"}
                  >
                    {profile.status === "suspended" ? "Restore profile" : "Suspend"}
                  </Button>
                )}
              </div>
            </>
          }
          details={
            <>
              {detailsLoading ? (
                <Notice>Loading profile details…</Notice>
              ) : detailsError !== null ? (
                <Notice tone="error">{detailsError}</Notice>
              ) : detailsView !== null ? (
                <ProfileDetails
                  isSubmitting={slugSubmittingFor === selectedId || pendingAction !== null}
                  onSlugChange={(value) => {
                    setSlugValue(value);
                    setSlugError(null);
                    setSlugSuccess(null);
                  }}
                  onSlugSubmit={saveSlug}
                  slugError={slugError}
                  slugSuccess={slugSuccess}
                  slugValue={slugValue}
                  view={detailsView}
                />
              ) : null}
              <div className="mt-8 border-t border-tapit-line pt-6">
                <ButtonLink href="/admin/audit-log" variant="quiet">
                  View audit history
                </ButtonLink>
              </div>
            </>
          }
        />
      ) : null}
      <ConfirmDialog
        confirmLabel={confirmation === "suspend" ? "Suspend profile" : "Unpublish profile"}
        description={
          confirmation === "suspend"
            ? "This hides the public profile and every assigned active card immediately. The profile remains assigned for later restoration."
            : "This hides the public profile immediately. Assigned cards remain assigned but show the unavailable page."
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation === "unpublish") void changeStatus("unpublished");
          if (confirmation === "suspend") void changeStatus("suspended");
        }}
        open={confirmation !== null}
        title={confirmation === "suspend" ? "Suspend this profile?" : "Unpublish this profile?"}
      />
    </div>
  );
}

export function ProfilesManager() {
  return !isLocalDemoMode() ? <LiveProfilesManager /> : <DemoProfilesManager />;
}
