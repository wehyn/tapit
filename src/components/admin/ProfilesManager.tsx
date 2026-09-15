"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowRightIcon, CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

import {
  publishProfile,
  validatePublicationAccess,
  type ProfileContent,
  type ProfileStatus,
} from "@/lib/domain";
import {
  getDemoProfiles,
  updateDemoProfile,
  useDemoState,
  updateDemoState,
} from "@/lib/demo/store";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Confirmation = "unpublish" | "suspend" | null;

function DemoProfilesManager() {
  const state = useDemoState();
  const profiles = getDemoProfiles(state);
  const [query, setQuery] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState(profiles[0]?.id ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingProfiles = profiles.filter((candidate) =>
    `${candidate.draft.name} ${candidate.draft.slug}`.toLowerCase().includes(normalizedQuery),
  );
  const profile =
    matchingProfiles.find((candidate) => candidate.id === selectedProfileId) ?? matchingProfiles[0];

  function updateDraft(field: "name" | "bio", value: string) {
    if (profile === undefined) return;
    updateDemoState((current) =>
      updateDemoProfile(current, profile.id, (currentProfile) => ({
        ...currentProfile,
        draft: { ...currentProfile.draft, [field]: field === "bio" ? value || undefined : value },
      })),
    );
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
          before: profile.published?.name ?? "draft",
          after: profile.draft.name,
        },
        ...current.audits,
      ],
    }));
    setMessage({
      tone: "success",
      text: "Administrative draft changes saved. Public content is unchanged until publication.",
    });
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
        {message ? (
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-start">
        <Panel className="p-3 sm:p-4" title="Profile registry">
          <div className="mt-3 grid gap-2">
            {matchingProfiles.length === 0 ? <Notice>No profiles match this search.</Notice> : null}
            {matchingProfiles.map((candidate) => (
              <button
                aria-describedby={`profile-status-${candidate.id}`}
                aria-label={`${candidate.draft.name || "Unnamed profile"} /${candidate.draft.slug}`}
                aria-pressed={candidate.id === profile?.id}
                className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-tapit border p-3 text-left transition-colors ${candidate.id === profile?.id ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-paper hover:border-tapit-accent/50"}`}
                key={candidate.id}
                onClick={() => setSelectedProfileId(candidate.id)}
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

        {profile === undefined ? (
          <Notice>No profiles match this search.</Notice>
        ) : (
          <Panel
            description={`${profile.draft.name || "Unnamed profile"} · owned by ${state.customers.find((customer) => customer.profileId === profile.id)?.email ?? "unassigned"}`}
            title={`${profile.draft.name || "Unnamed"} profile`}
          >
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
                Stable slug: <code>{profile.draft.slug}</code>
              </span>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                disabled={profile.published !== null}
                help={profile.published ? "Immutable after first publication." : undefined}
                id="admin-profile-name"
                label="Name"
                onChange={(event) => updateDraft("name", event.target.value)}
                value={profile.draft.name}
              />
              <Field disabled id="admin-profile-slug" label="Slug" value={profile.draft.slug} />
            </div>
            <div className="mt-5">
              <TextareaField
                id="admin-profile-bio"
                label="Bio or role"
                maxLength={140}
                onChange={(event) => updateDraft("bio", event.target.value)}
                value={profile.draft.bio ?? ""}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={saveDraft} type="button" variant="secondary">
                Save admin draft
              </Button>
              <Button
                disabled={
                  profile.status === "published" &&
                  profile.published?.name === profile.draft.name &&
                  profile.published?.bio === profile.draft.bio
                }
                onClick={publish}
                type="button"
              >
                Publish
              </Button>
              {profile.status === "published" || profile.status === "draft" ? (
                <Button onClick={() => setConfirmation("unpublish")} type="button" variant="quiet">
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
            <div className="mt-6 rounded-tapit border border-tapit-line bg-tapit-paper p-4 text-sm text-tapit-muted">
              <p>
                Public URL:{" "}
                <code className="text-tapit-ink">
                  /{profile.published?.slug ?? profile.draft.slug}
                </code>
              </p>
              <p className="mt-2">
                Assigned cards:{" "}
                <strong className="text-tapit-ink">
                  {state.cards.filter((card) => card.profileId === profile.id).length}
                </strong>
              </p>
              <div className="mt-4">
                <ButtonLink href="/admin/audit-log" variant="quiet">
                  View audit history
                </ButtonLink>
              </div>
            </div>
          </Panel>
        )}
      </div>

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
  const profiles = useQuery(api.profiles.adminList);
  const save = useMutation(api.profiles.saveDraft);
  const publish = useMutation(api.profiles.publish);
  const setStatus = useMutation(api.profiles.setStatus);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<Id<"profiles"> | null>(null);
  const [draftState, setDraftState] = useState<{
    profileId: Id<"profiles">;
    serverDraftKey: string;
    draft: ProfileContent;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const matching = (profiles ?? []).filter((profile) =>
    `${profile.draft.name} ${profile.draft.slug}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const profile = matching.find((candidate) => candidate._id === selectedId) ?? matching[0];
  const serverDraftKey = profile ? JSON.stringify(profile.draft) : null;
  const currentDraft =
    profile && draftState?.profileId === profile._id && draftState.serverDraftKey === serverDraftKey
      ? draftState.draft
      : profile
        ? ({ ...profile.draft } as ProfileContent)
        : null;

  if (profiles === undefined)
    return <div className="p-8 text-sm text-tapit-muted">Loading profiles…</div>;
  async function saveDraft() {
    if (!profile || !currentDraft) return;
    const profileId = profile._id;
    const draftToSave = currentDraft;
    try {
      await save({ profileId, draft: draftToSave });
      setMessage({ tone: "success", text: "Administrative draft changes saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Draft could not be saved.",
      });
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
  async function publishProfile() {
    if (!profile || !currentDraft) return;
    const profileId = profile._id;
    const draftToPublish = currentDraft;
    try {
      if (JSON.stringify(draftToPublish) !== JSON.stringify(profile.draft)) {
        await save({ profileId, draft: draftToPublish });
      }
      await publish({ profileId });
      setMessage({ tone: "success", text: "Profile published." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Profile could not be published.",
      });
    }
  }
  function updateDraft(field: "name" | "bio", value: string) {
    if (!profile || !currentDraft || serverDraftKey === null) return;
    setDraftState({
      profileId: profile._id,
      serverDraftKey,
      draft: {
        ...currentDraft,
        [field]: field === "bio" ? value || undefined : value,
      },
    });
  }
  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 pb-12 pt-5 sm:gap-6 sm:px-8 sm:pt-6">
      <Panel
        description="Moderation actions are authorized and audited by Convex."
        title="Profile management"
      >
        {message ? (
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:items-start">
        <Panel className="p-3 sm:p-4" title="Profile registry">
          <div className="mt-3 grid gap-2">
            {matching.length === 0 ? (
              <Notice>No profiles match this search.</Notice>
            ) : (
              matching.map((candidate) => (
                <button
                  aria-pressed={candidate._id === profile?._id}
                  className="flex min-h-16 w-full items-center justify-between gap-3 rounded-tapit border border-tapit-line bg-tapit-paper p-3 text-left"
                  key={candidate._id}
                  onClick={() => {
                    setSelectedId(candidate._id);
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
          </div>
        </Panel>
        {profile && currentDraft ? (
          <Panel title={`${currentDraft.name || "Unnamed"} profile`}>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field
                id="admin-profile-name"
                label="Name"
                onChange={(event) => updateDraft("name", event.target.value)}
                value={currentDraft.name}
              />
              <Field disabled id="admin-profile-slug" label="Slug" value={currentDraft.slug} />
            </div>
            <div className="mt-5">
              <TextareaField
                id="admin-profile-bio"
                label="Bio or role"
                maxLength={140}
                onChange={(event) => updateDraft("bio", event.target.value)}
                value={currentDraft.bio ?? ""}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={saveDraft} type="button" variant="secondary">
                Save admin draft
              </Button>
              <Button
                disabled={
                  profile.status === "suspended" ||
                  (profile.status === "published" &&
                    profile.published?.name === currentDraft.name &&
                    profile.published?.bio === currentDraft.bio)
                }
                onClick={publishProfile}
                type="button"
              >
                Publish
              </Button>
              {profile.status === "published" || profile.status === "draft" ? (
                <Button onClick={() => setConfirmation("unpublish")} type="button" variant="quiet">
                  Unpublish
                </Button>
              ) : null}
              {profile.status === "unpublished" ? (
                <Button
                  onClick={() => void changeStatus("published")}
                  type="button"
                  variant="secondary"
                >
                  Restore profile
                </Button>
              ) : (
                <Button
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
          </Panel>
        ) : (
          <Notice>No profiles match this search.</Notice>
        )}
      </div>
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
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
    <LiveProfilesManager />
  ) : (
    <DemoProfilesManager />
  );
}
