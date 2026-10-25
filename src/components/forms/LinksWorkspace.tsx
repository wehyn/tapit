"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { LinkIcon, ProfileLink, ProfileRedirect, PublicProfileProjection } from "@/lib/domain";
import { AddLinkDialog } from "./AddLinkDialog";
import { LinkPresetIconPicker } from "./LinkPresetIconPicker";
import { displayDestination, linkKind } from "./LinkDestination";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import type { DraftSaveOutcome } from "@/components/layout/DraftSaveContext";

export type LinksWorkspaceMessage = {
  tone: "success" | "error";
  text: string;
};

export type LinksWorkspaceProps = {
  profileUrl: string;
  links: ProfileLink[];
  redirect?: ProfileRedirect;
  redirectError?: string | null;
  preview: PublicProfileProjection | null;
  validation: Record<string, string>;
  publicationErrors: string[];
  message: LinksWorkspaceMessage | null;
  pendingAction: "save" | "publish" | null;
  isDirty: boolean;
  hasUnpublishedChanges: boolean;
  publicationLabel: string;
  onUpdateLink: (id: string, patch: Partial<ProfileLink>) => void;
  onRedirectChange?: (redirect: ProfileRedirect) => void;
  onAddLink: (link: Pick<ProfileLink, "label" | "destination" | "icon">) => void;
  onMoveLink: (id: string, direction: -1 | 1) => void;
  onReorderLink: (sourceId: string, targetId: string, insertAfter: boolean) => void;
  onRemoveLink: (id: string) => void;
  onSaveDraft: () => Promise<DraftSaveOutcome>;
  onPublish: () => void | Promise<void>;
};

const rowFieldClasses =
  "min-h-11 w-full min-w-0 rounded-control bg-tapit-surface px-4 text-tapit-ink transition-colors placeholder:text-tapit-muted focus:outline-3 focus:outline-offset-2 focus:outline-tapit-accent aria-invalid:bg-tapit-danger-soft aria-invalid:focus:outline-tapit-danger";

function destinationChoiceClass(active: boolean) {
  return `flex min-h-12 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${
    active
      ? "bg-tapit-surface text-tapit-accent-strong shadow-card ring-2 ring-tapit-accent"
      : "text-tapit-muted hover:text-tapit-ink"
  }`;
}

export function LinksWorkspace({
  profileUrl,
  links,
  redirect = { enabled: false, destination: "" },
  redirectError = null,
  preview,
  validation,
  publicationErrors,
  message,
  pendingAction,
  isDirty,
  hasUnpublishedChanges,
  publicationLabel,
  onUpdateLink,
  onRedirectChange = () => {},
  onAddLink,
  onMoveLink,
  onReorderLink,
  onRemoveLink,
  onSaveDraft,
  onPublish,
}: LinksWorkspaceProps) {
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null);
  const draggedLinkIdRef = useRef<string | null>(null);
  const dropCompletedRef = useRef(false);
  const originalOrderRef = useRef<string[]>([]);
  const linksListRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const previousPositionsRef = useRef<Map<string, number> | null>(null);
  const shownCount = links.filter((link) => link.enabled).length;
  const status =
    pendingAction === "save"
      ? "Saving draft"
      : pendingAction === "publish"
        ? "Publishing"
        : isDirty
          ? "Unsaved changes"
          : "Draft saved";
  const publishDisabled =
    publicationErrors.length > 0 ||
    Object.keys(validation).length > 0 ||
    publicationLabel === "Published" ||
    pendingAction !== null;
  const shouldShowActions = isDirty || pendingAction !== null;
  function captureRowPositions() {
    previousPositionsRef.current = new Map(
      [...rowRefs.current].map(([id, row]) => [id, row.getBoundingClientRect().top]),
    );
  }

  useLayoutEffect(() => {
    const previousPositions = previousPositionsRef.current;
    previousPositionsRef.current = null;
    if (!previousPositions || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    for (const [id, row] of rowRefs.current) {
      const previousTop = previousPositions.get(id);
      if (previousTop === undefined) continue;
      row.getAnimations().forEach((animation) => animation.cancel());
      if (id === draggedLinkIdRef.current) continue;
      const delta = previousTop - row.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) continue;
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
        duration: 180,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  }, [links]);

  function finishDrag(event: React.DragEvent<HTMLButtonElement>) {
    const sourceId = draggedLinkIdRef.current;
    const listBounds = linksListRef.current?.getBoundingClientRect();
    const releasedInList =
      listBounds !== undefined &&
      event.clientX >= listBounds.left &&
      event.clientX <= listBounds.right &&
      event.clientY >= listBounds.top &&
      event.clientY <= listBounds.bottom;
    if (sourceId && !dropCompletedRef.current && !releasedInList) {
      const originalIndex = originalOrderRef.current.indexOf(sourceId);
      const neighborId =
        originalIndex > 0
          ? originalOrderRef.current[originalIndex - 1]
          : originalOrderRef.current[1];
      if (neighborId) {
        captureRowPositions();
        onReorderLink(sourceId, neighborId, originalIndex > 0);
      }
    }
    draggedLinkIdRef.current = null;
    dropCompletedRef.current = false;
    originalOrderRef.current = [];
    setDraggedLinkId(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-16">
      {addDialogOpen ? (
        <AddLinkDialog
          destinations={links.map((link) => link.destination)}
          onClose={() => setAddDialogOpen(false)}
          onAdd={(link) => {
            onAddLink(link);
            setAddDialogOpen(false);
          }}
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-tapit-ink" id="links-workspace-title">
          Links
        </h1>
        <p className="text-base text-tapit-muted">
          Drag to reorder. Switch a link off to hide it without deleting it.
        </p>
      </div>
      <div className="xl:hidden">
        <Segmented
          label="Links view"
          onChange={setMobileView}
          options={[
            { label: "Edit", value: "edit" },
            { label: "Preview", value: "preview" },
          ]}
          value={mobileView}
        />
      </div>
      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(32rem,1fr)_minmax(25rem,0.75fr)]">
        <section
          aria-labelledby="links-workspace-title"
          className={`flex min-w-0 flex-col gap-4 ${mobileView === "edit" ? "flex" : "hidden xl:flex"}`}
        >
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <Card
            description="Choose what visitors see when they open your profile link or tap or scan your card."
            title="Destination"
          >
            <div className="grid gap-3">
              <span className="text-sm font-medium text-tapit-ink" id="visitor-destination-label">
                Visitors go to
              </span>
              <div
                aria-labelledby="visitor-destination-label"
                className="grid grid-cols-2 gap-1 rounded-control bg-tapit-soft-surface p-1"
                role="group"
              >
                <button
                  aria-pressed={!redirect.enabled}
                  className={destinationChoiceClass(!redirect.enabled)}
                  onClick={() => onRedirectChange({ ...redirect, enabled: false })}
                  type="button"
                >
                  <Icon name="user" size={18} weight="bold" />
                  Tapit profile
                </button>
                <button
                  aria-pressed={redirect.enabled}
                  className={destinationChoiceClass(redirect.enabled)}
                  onClick={() => onRedirectChange({ ...redirect, enabled: true })}
                  type="button"
                >
                  <Icon name="link" size={18} weight="bold" />
                  Redirect link
                </button>
              </div>
            </div>
            {redirect.enabled ? (
              <Field
                error={redirectError ?? undefined}
                help="When published, your Tapit profile link and card taps or scans will send visitors here."
                id="profile-redirect-destination"
                label="HTTPS destination URL"
                onChange={(event) =>
                  onRedirectChange({ ...redirect, destination: event.target.value })
                }
                placeholder="https://www.yourwebsite.com"
                type="url"
                value={redirect.destination}
              />
            ) : (
              <p className="flex items-start gap-2 text-sm leading-6 text-tapit-muted">
                <Icon className="mt-1 shrink-0" name="info" size={18} />
                Visitors see your contact details and profile links.
              </p>
            )}
          </Card>
          {redirect.enabled ? (
            <Notice>
              Profile links are paused while visitors go to your website. Switch to Tapit profile to
              edit them.
            </Notice>
          ) : null}
          <section
            aria-label="Editable profile links"
            className="flex min-w-0 flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
            ref={linksListRef}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="tapit-display text-lg font-semibold text-tapit-ink">
                  Profile links
                </h2>
                <p className="text-sm text-tapit-muted">
                  {shownCount} shown · {links.length - shownCount} hidden
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span
                  aria-live="polite"
                  className="text-xs font-medium text-tapit-muted"
                  role="status"
                >
                  {status}
                </span>
                {!isDirty && hasUnpublishedChanges && pendingAction === null ? (
                  <Button disabled={publishDisabled} onClick={onPublish} type="button">
                    <Icon name="upload" size={18} weight="bold" />
                    {publicationLabel}
                  </Button>
                ) : null}
                <Button
                  disabled={redirect.enabled}
                  onClick={() => setAddDialogOpen(true)}
                  type="button"
                  variant="secondary"
                >
                  <Icon name="plus" size={18} weight="bold" />
                  Add link
                </Button>
              </div>
            </div>
            {links.length === 0 ? (
              <Notice>
                Add your first link, such as Portfolio or TikTok. Use a valid HTTPS destination;
                choose email or phone to add those actions.
              </Notice>
            ) : null}
            <div className="flex min-w-0 flex-col gap-2">
              {links.map((link, index) => {
                const selectedIcon: LinkIcon = link.icon ?? "link";
                return (
                  <article
                    className={`group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-control p-4 md:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1.2fr)_auto_auto] ${draggedLinkId === link.id ? "bg-tapit-accent-soft opacity-40 outline-2 -outline-offset-2 outline-dashed outline-tapit-accent" : "bg-tapit-soft-surface"} ${redirect.enabled ? "cursor-not-allowed opacity-55" : ""}`}
                    key={link.id}
                    onDragOver={(event) => {
                      if (redirect.enabled) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const sourceId = draggedLinkIdRef.current;
                      if (!sourceId || sourceId === link.id) return;
                      const sourceIndex = links.findIndex((candidate) => candidate.id === sourceId);
                      const targetIndex = links.findIndex((candidate) => candidate.id === link.id);
                      if (sourceIndex < 0 || targetIndex < 0) return;
                      const row = event.currentTarget;
                      const transform = getComputedStyle(row).transform;
                      const animatedY =
                        transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
                      const bounds = row.getBoundingClientRect();
                      const midpoint = bounds.top - animatedY + bounds.height / 2;
                      if (
                        sourceIndex < targetIndex
                          ? event.clientY < midpoint
                          : event.clientY > midpoint
                      )
                        return;
                      captureRowPositions();
                      onReorderLink(sourceId, link.id, sourceIndex < targetIndex);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropCompletedRef.current = true;
                    }}
                    ref={(element) => {
                      if (element) rowRefs.current.set(link.id, element);
                      else rowRefs.current.delete(link.id);
                    }}
                  >
                    <button
                      aria-label={`Reorder ${link.label || "link"}`}
                      className="hidden size-11 touch-none cursor-grab place-items-center rounded-control text-tapit-muted transition-colors hover:bg-tapit-surface hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus active:cursor-grabbing md:grid"
                      disabled={redirect.enabled}
                      draggable={!redirect.enabled}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", link.id);
                        draggedLinkIdRef.current = link.id;
                        originalOrderRef.current = links.map((candidate) => candidate.id);
                        dropCompletedRef.current = false;
                        const row = event.currentTarget.closest("article");
                        if (row) {
                          const bounds = row.getBoundingClientRect();
                          event.dataTransfer.setDragImage(
                            row,
                            Math.max(0, event.clientX - bounds.left),
                            Math.max(0, event.clientY - bounds.top),
                          );
                        }
                        setDraggedLinkId(link.id);
                      }}
                      onDragEnd={finishDrag}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          onMoveLink(link.id, -1);
                        }
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          onMoveLink(link.id, 1);
                        }
                      }}
                      title="Drag to reorder, or press the up and down arrow keys"
                      type="button"
                    >
                      <Icon name="dragHandle" size={18} weight="bold" />
                    </button>
                    <LinkPresetIconPicker
                      disabled={redirect.enabled}
                      value={selectedIcon}
                      label={link.label}
                      onChange={(icon) => onUpdateLink(link.id, { icon })}
                    />
                    <div className="min-w-0">
                      <label className="sr-only" htmlFor={`${link.id}-label`}>
                        Label for {link.label || "link"}
                      </label>
                      <input
                        aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                        aria-invalid={Boolean(validation[link.id])}
                        className={`${rowFieldClasses} text-base font-medium`}
                        id={`${link.id}-label`}
                        disabled={redirect.enabled}
                        onChange={(event) => onUpdateLink(link.id, { label: event.target.value })}
                        placeholder="e.g. Portfolio"
                        value={link.label}
                      />
                    </div>
                    <div className="order-last col-span-full min-w-0 md:order-none md:col-span-1">
                      <label className="sr-only" htmlFor={`${link.id}-destination`}>
                        Destination for {link.label || "link"}
                      </label>
                      <input
                        aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                        aria-invalid={Boolean(validation[link.id])}
                        className={`${rowFieldClasses} text-sm text-tapit-muted`}
                        id={`${link.id}-destination`}
                        disabled={redirect.enabled}
                        onChange={(event) =>
                          onUpdateLink(link.id, {
                            destination:
                              linkKind(link.destination) === "email"
                                ? `mailto:${event.target.value}`
                                : linkKind(link.destination) === "phone"
                                  ? `tel:${event.target.value}`
                                  : event.target.value,
                          })
                        }
                        placeholder={
                          linkKind(link.destination) === "email"
                            ? "you@example.com"
                            : linkKind(link.destination) === "phone"
                              ? "+1 555 123 4567"
                              : "https://example.com"
                        }
                        value={displayDestination(link.destination)}
                      />
                    </div>
                    <label
                      className="flex min-h-11 min-w-11 items-center justify-center"
                      title="Enabled links appear on your profile"
                    >
                      <input
                        aria-label={`Enable ${link.label || "link"}`}
                        checked={link.enabled}
                        className="peer sr-only"
                        disabled={redirect.enabled}
                        onChange={(event) =>
                          onUpdateLink(link.id, { enabled: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span
                        aria-hidden="true"
                        className="relative inline-flex h-7 w-11 shrink-0 rounded-full bg-tapit-muted/40 transition-colors after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white motion-safe:after:transition-transform peer-checked:bg-tapit-accent peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus"
                      />
                    </label>
                    <details className="relative" inert={redirect.enabled}>
                      <summary
                        aria-label={`Actions for ${link.label || "link"}`}
                        className="grid size-11 cursor-pointer list-none place-items-center rounded-control text-tapit-muted transition-colors hover:bg-tapit-surface hover:text-tapit-ink"
                      >
                        <Icon name="more" size={20} weight="bold" />
                      </summary>
                      <div
                        className={`absolute right-0 z-30 grid min-w-36 gap-1 rounded-card bg-tapit-surface p-2 shadow-card ${index >= Math.max(0, links.length - 2) ? "bottom-full mb-2" : "mt-2"}`}
                      >
                        <Button
                          className="justify-start"
                          disabled={redirect.enabled || index === 0}
                          onClick={() => onMoveLink(link.id, -1)}
                          type="button"
                          variant="quiet"
                        >
                          <Icon name="arrowUp" size={16} />
                          Move up
                        </Button>
                        <Button
                          className="justify-start"
                          disabled={redirect.enabled || index === links.length - 1}
                          onClick={() => onMoveLink(link.id, 1)}
                          type="button"
                          variant="quiet"
                        >
                          <Icon name="arrowDown" size={16} />
                          Move down
                        </Button>
                        <Button
                          className="justify-start"
                          disabled={redirect.enabled}
                          onClick={() => onRemoveLink(link.id)}
                          type="button"
                          variant="quiet"
                        >
                          <Icon name="trash" size={16} />
                          Delete
                        </Button>
                      </div>
                    </details>
                    {validation[link.id] ? (
                      <p
                        className="order-last col-span-full px-1 text-xs font-medium text-tapit-danger"
                        id={`${link.id}-error`}
                        role="alert"
                      >
                        {validation[link.id]}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
          {publicationErrors.length > 0 ? (
            <ul className="grid gap-2 text-sm text-tapit-muted">
              {publicationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <section
          className={`h-fit xl:sticky xl:top-6 ${mobileView === "preview" ? "block" : "hidden xl:block"}`}
          aria-label="Live profile preview"
          id="workspace-preview"
        >
          {preview ? (
            <WorkspacePreview preview={preview} profileUrl={profileUrl} />
          ) : (
            <Notice tone="error">Add a valid name and link to see the preview.</Notice>
          )}
        </section>
      </div>
      {shouldShowActions ? (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-tapit-surface px-4 py-2 shadow-card sm:px-8">
          <section aria-label="Draft actions" className="mx-auto max-w-7xl" role="region">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Icon className="shrink-0 text-tapit-accent" name="check" size={20} weight="bold" />
                <span className="font-semibold text-tapit-ink">{status}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!isDirty || pendingAction !== null}
                  loading={pendingAction === "save"}
                  onClick={onSaveDraft}
                  type="button"
                  variant="secondary"
                >
                  <Icon name="save" size={18} weight="bold" />
                  {pendingAction === "save" ? "Saving..." : "Save draft"}
                </Button>
                <Button
                  disabled={publishDisabled}
                  loading={pendingAction === "publish"}
                  onClick={onPublish}
                  type="button"
                >
                  <Icon name="upload" size={18} weight="bold" />
                  {pendingAction === "publish" ? "Publishing..." : publicationLabel}
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
