"use client";

import { useLayoutEffect, useRef, useState } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  DotsSixVerticalIcon,
  DotsThreeVerticalIcon,
  EnvelopeSimpleIcon,
  FloppyDiskIcon,
  GlobeIcon,
  InstagramLogoIcon,
  LinkSimpleIcon,
  LinkedinLogoIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import type { LinkIcon, ProfileLink, PublicProfileProjection } from "@/lib/domain";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type LinksWorkspaceMessage = {
  tone: "success" | "error";
  text: string;
};

export type LinksWorkspaceProps = {
  profileUrl: string;
  links: ProfileLink[];
  preview: PublicProfileProjection | null;
  validation: Record<string, string>;
  publicationErrors: string[];
  message: LinksWorkspaceMessage | null;
  previewMode: "phone" | "desktop";
  pendingAction: "save" | "publish" | null;
  isDirty: boolean;
  publicationLabel: string;
  onPreviewModeChange: (mode: "phone" | "desktop") => void;
  onUpdateLink: (id: string, patch: Partial<ProfileLink>) => void;
  onAddLink: () => void;
  onMoveLink: (id: string, direction: -1 | 1) => void;
  onReorderLink: (sourceId: string, targetId: string, insertAfter: boolean) => void;
  onRemoveLink: (id: string) => void;
  onSaveDraft: () => Promise<boolean>;
  onPublish: () => void | Promise<void>;
};

const iconOptions: Array<{ value: LinkIcon; label: string }> = [
  { value: "link", label: "Generic link" },
  { value: "globe", label: "Website / globe" },
  { value: "mail", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "calendar", label: "Booking / calendar" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
];

const linkIconMap = {
  link: LinkSimpleIcon,
  globe: GlobeIcon,
  mail: EnvelopeSimpleIcon,
  phone: PhoneIcon,
  calendar: CalendarDotsIcon,
  linkedin: LinkedinLogoIcon,
  instagram: InstagramLogoIcon,
} as const;

export function LinksWorkspace({
  profileUrl,
  links,
  preview,
  validation,
  publicationErrors,
  message,
  previewMode,
  pendingAction,
  isDirty,
  publicationLabel,
  onPreviewModeChange,
  onUpdateLink,
  onAddLink,
  onMoveLink,
  onReorderLink,
  onRemoveLink,
  onSaveDraft,
  onPublish,
}: LinksWorkspaceProps) {
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null);
  const draggedLinkIdRef = useRef<string | null>(null);
  const dropCompletedRef = useRef(false);
  const originalOrderRef = useRef<string[]>([]);
  const linksListRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const previousPositionsRef = useRef<Map<string, number> | null>(null);
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
    <div className="mx-auto w-full max-w-[1480px] px-4 pb-32 pt-6 sm:px-8 sm:pb-28 lg:px-10 lg:pt-8">
      <div className="grid gap-8 min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(24rem,0.42fr)]">
        <section aria-labelledby="links-workspace-title">
          <h1 className="sr-only" id="links-workspace-title">
            Links
          </h1>
          {message ? (
            <div className="mt-6">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          ) : null}
          <section
            aria-label="Editable profile links"
            className="mt-6 rounded-tapit border border-tapit-line bg-tapit-surface shadow-[0_4px_20px_rgba(16,33,28,0.035)]"
            ref={linksListRef}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tapit-line px-4 py-3 sm:px-5">
              <h2 className="tapit-display text-lg font-semibold tracking-[-0.02em] text-tapit-ink">
                Profile links
              </h2>
              <Button onClick={onAddLink} type="button">
                <PlusIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
                Add link
              </Button>
            </div>
            <div className="hidden border-b border-tapit-line bg-tapit-surface px-5 py-4 text-sm font-medium text-tapit-muted md:grid md:grid-cols-[1.5rem_minmax(11rem,0.75fr)_minmax(12rem,1fr)_6rem_2.5rem] md:gap-4">
              <span aria-hidden="true" />
              <span>Link</span>
              <span>Destination</span>
              <span>Status</span>
              <span aria-hidden="true" />
            </div>
            {links.length === 0 ? (
              <div className="p-6">
                <Notice>
                  Add your first link, such as Portfolio or TikTok. Use a valid HTTPS destination;
                  email and phone actions support mailto: and tel:.
                </Notice>
              </div>
            ) : null}
            {links.map((link, index) => {
              const selectedIcon: LinkIcon =
                link.icon !== undefined &&
                Object.prototype.hasOwnProperty.call(linkIconMap, link.icon)
                  ? link.icon
                  : "link";
              const LinkIcon = linkIconMap[selectedIcon];
              return (
                <article
                  className={`group border-b border-tapit-line px-4 py-5 last:border-b-0 sm:px-5 sm:py-6 ${draggedLinkId === link.id ? "bg-tapit-accent-soft/60 opacity-40 outline-2 -outline-offset-2 outline-dashed outline-tapit-accent" : ""}`}
                  key={link.id}
                  onDragOver={(event) => {
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
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 md:grid-cols-[1.5rem_minmax(11rem,0.75fr)_minmax(12rem,1fr)_6rem_2.5rem] md:gap-4">
                    <button
                      aria-label={`Reorder ${link.label || "link"}`}
                      className="hidden size-10 touch-none cursor-grab place-items-center rounded-tapit text-tapit-muted transition hover:bg-tapit-paper hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus active:cursor-grabbing md:grid"
                      draggable
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
                      <DotsSixVerticalIcon aria-hidden="true" size={18} weight="bold" />
                    </button>
                    <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                      <div className="relative grid size-10 shrink-0 place-items-center rounded-tapit bg-tapit-accent-soft text-tapit-accent">
                        <LinkIcon aria-hidden="true" size={19} weight="bold" />
                        <label className="sr-only" htmlFor={`${link.id}-icon`}>
                          Preset icon for {link.label || "link"}
                        </label>
                        <select
                          aria-label={`Preset icon for ${link.label || "link"}`}
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          id={`${link.id}-icon`}
                          onChange={(event) =>
                            onUpdateLink(link.id, { icon: event.target.value as LinkIcon })
                          }
                          value={selectedIcon}
                        >
                          {iconOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="sr-only" htmlFor={`${link.id}-label`}>
                          Label for {link.label || "link"}
                        </label>
                        <input
                          aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                          aria-invalid={Boolean(validation[link.id])}
                          className={`min-h-11 w-full min-w-0 rounded-tapit border border-transparent bg-transparent px-2 text-base font-medium text-tapit-ink outline-none transition placeholder:text-tapit-muted/70 focus:border-tapit-accent focus:bg-tapit-paper ${validation[link.id] ? "border-tapit-danger" : ""}`}
                          id={`${link.id}-label`}
                          onChange={(event) => onUpdateLink(link.id, { label: event.target.value })}
                          placeholder="e.g. Portfolio"
                          value={link.label}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="sr-only" htmlFor={`${link.id}-destination`}>
                        Destination for {link.label || "link"}
                      </label>
                      <input
                        aria-describedby={validation[link.id] ? `${link.id}-error` : undefined}
                        aria-invalid={Boolean(validation[link.id])}
                        className="min-h-11 w-full min-w-0 rounded-tapit border border-transparent bg-transparent px-2 text-sm text-tapit-muted outline-none transition placeholder:text-tapit-muted/70 focus:border-tapit-accent focus:bg-tapit-paper"
                        id={`${link.id}-destination`}
                        onChange={(event) =>
                          onUpdateLink(link.id, { destination: event.target.value })
                        }
                        placeholder="https:// or mailto: or tel:"
                        value={link.destination}
                      />
                    </div>
                    <label
                      className="col-start-1 flex min-h-11 items-center gap-2 text-sm font-medium text-tapit-ink md:col-auto"
                      title="Enabled links appear on your profile"
                    >
                      <input
                        aria-label={`Enable ${link.label || "link"}`}
                        checked={link.enabled}
                        className="peer sr-only"
                        onChange={(event) =>
                          onUpdateLink(link.id, { enabled: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span
                        aria-hidden="true"
                        className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-tapit-soft-surface transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-tapit-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus"
                      />
                      <span className="hidden md:inline">Enabled</span>
                    </label>
                    <details className="relative col-start-2 justify-self-end md:col-auto md:justify-self-auto">
                      <summary
                        aria-label={`Actions for ${link.label || "link"}`}
                        className="grid size-11 cursor-pointer list-none place-items-center rounded-tapit border border-transparent text-tapit-muted transition hover:border-tapit-line hover:bg-tapit-paper hover:text-tapit-ink"
                      >
                        <DotsThreeVerticalIcon aria-hidden="true" size={20} weight="bold" />
                      </summary>
                      <div
                        className={`absolute right-0 z-30 grid min-w-36 gap-1 rounded-tapit border border-tapit-line bg-white p-2 shadow-xl ${index >= Math.max(0, links.length - 2) ? "bottom-full mb-2" : "mt-2"}`}
                      >
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          disabled={index === 0}
                          onClick={() => onMoveLink(link.id, -1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowUpIcon aria-hidden="true" className="mr-2" size={16} />
                          Move up
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          disabled={index === links.length - 1}
                          onClick={() => onMoveLink(link.id, 1)}
                          type="button"
                          variant="quiet"
                        >
                          <ArrowDownIcon aria-hidden="true" className="mr-2" size={16} />
                          Move down
                        </Button>
                        <Button
                          className="justify-start !min-h-10 !px-3"
                          onClick={() => onRemoveLink(link.id)}
                          type="button"
                          variant="quiet"
                        >
                          <TrashIcon aria-hidden="true" className="mr-2" size={16} />
                          Delete
                        </Button>
                      </div>
                    </details>
                  </div>
                  {validation[link.id] ? (
                    <p
                      className="mt-1.5 text-xs font-medium text-tapit-danger sm:ml-6"
                      id={`${link.id}-error`}
                      role="alert"
                    >
                      {validation[link.id]}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </section>
          {publicationErrors.length > 0 ? (
            <ul className="mt-4 grid gap-2 text-sm text-tapit-muted">
              {publicationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </section>
        <section
          className="h-fit min-[1400px]:sticky min-[1400px]:top-6"
          aria-label="Live profile preview"
        >
          {preview ? (
            <WorkspacePreview
              mode={previewMode}
              onModeChange={onPreviewModeChange}
              preview={preview}
              profileUrl={profileUrl}
            />
          ) : (
            <Notice tone="error">Add a valid name and link to see the preview.</Notice>
          )}
        </section>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-tapit-paper/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3">
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
            {isDirty ? (
              <span className="hidden text-tapit-muted sm:inline">Last saved just now</span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!isDirty || pendingAction !== null}
              loading={pendingAction === "save"}
              onClick={onSaveDraft}
              type="button"
              variant="secondary"
            >
              <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {pendingAction === "save" ? "Saving..." : "Save draft"}
            </Button>
            <Button
              disabled={
                publicationErrors.length > 0 ||
                Object.keys(validation).length > 0 ||
                publicationLabel === "Published" ||
                pendingAction !== null
              }
              loading={pendingAction === "publish"}
              onClick={onPublish}
              type="button"
            >
              <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
              {pendingAction === "publish" ? "Publishing..." : publicationLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
