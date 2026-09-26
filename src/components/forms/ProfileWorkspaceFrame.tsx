import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CaretDownIcon,
  CaretUpIcon,
  CheckCircleIcon,
  FloppyDiskIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";

export type ProfileWorkspaceFrameProps = {
  title: string;
  description: string;
  controls: ReactNode;
  message?: ReactNode;
  preview: PublicProfileProjection | null;
  profileUrl: string;
  previewMode: "phone" | "desktop";
  onPreviewModeChange: (mode: "phone" | "desktop") => void;
  hasDraftChanges: boolean;
  saveDisabled: boolean;
  saveLoading?: boolean;
  onSave: () => void;
  publishDisabled: boolean;
  publishLoading?: boolean;
  onPublish: () => void;
  publishLabel: string;
  draftStatus?: ReactNode;
  cropDialog?: ReactNode;
};

export function ProfileWorkspaceFrame({
  title,
  description,
  controls,
  message,
  preview,
  profileUrl,
  previewMode,
  onPreviewModeChange,
  hasDraftChanges,
  saveDisabled,
  saveLoading = false,
  onSave,
  publishDisabled,
  publishLoading = false,
  onPublish,
  publishLabel,
  draftStatus,
  cropDialog,
}: ProfileWorkspaceFrameProps) {
  const actionRegionId = `profile-draft-actions-${useId().replace(/:/g, "")}`;
  const isBusy = saveLoading || publishLoading;
  const shouldExpand = hasDraftChanges || isBusy;
  const [isExpanded, setIsExpanded] = useState(shouldExpand);
  const compactTriggerRef = useRef<HTMLButtonElement>(null);
  const collapseTriggerRef = useRef<HTMLButtonElement>(null);
  const focusAfterToggleRef = useRef<"compact" | "collapse" | null>(null);
  const compactStatus = typeof draftStatus === "string" ? draftStatus : "Draft saved";

  useEffect(() => {
    // The frame must react to dirty/loading transitions while preserving manual collapse.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsExpanded(shouldExpand);
  }, [shouldExpand]);

  useEffect(() => {
    const focusTarget = focusAfterToggleRef.current;
    if (focusTarget === null) return;
    focusAfterToggleRef.current = null;
    (focusTarget === "compact" ? compactTriggerRef : collapseTriggerRef).current?.focus();
  }, [isExpanded]);

  return (
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 pb-44 pt-7 sm:px-8 sm:pb-28 min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] min-[1400px]:gap-10 min-[1400px]:pt-8">
      <div className="grid self-start gap-6">
        <div className="pb-1">
          <h1 className="text-4xl font-medium tracking-[-0.055em] text-tapit-ink sm:text-5xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-base leading-7 text-tapit-muted">{description}</p>
        </div>
        {message}
        {controls}
      </div>
      <div className="h-fit">
        {preview ? (
          <WorkspacePreview
            mode={previewMode}
            onModeChange={onPreviewModeChange}
            preview={preview}
            profileUrl={profileUrl}
            showProfileUrl
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
        {!isExpanded ? (
          <button
            aria-controls={actionRegionId}
            aria-expanded={false}
            aria-label={`${compactStatus}. Show draft actions`}
            className="mx-auto flex min-h-11 w-full max-w-[1440px] items-center justify-between gap-3 rounded-tapit px-1 py-2 text-left text-sm transition hover:bg-tapit-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus motion-reduce:transition-none"
            onClick={() => {
              focusAfterToggleRef.current = "collapse";
              setIsExpanded(true);
            }}
            ref={compactTriggerRef}
            title="Show draft actions"
            type="button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CheckCircleIcon
                aria-hidden="true"
                className="shrink-0 text-tapit-accent"
                size={21}
                weight="fill"
              />
              <span className="min-w-0 truncate font-semibold text-tapit-ink">
                {draftStatus ?? "Draft saved"}
              </span>
            </span>
            <CaretUpIcon
              aria-hidden="true"
              className="shrink-0 text-tapit-muted"
              size={20}
              weight="bold"
            />
          </button>
        ) : null}
        <section
          aria-label="Draft actions"
          className="mx-auto max-w-[1440px]"
          hidden={!isExpanded}
          id={actionRegionId}
          role="region"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <CheckCircleIcon
                aria-hidden="true"
                className="shrink-0 text-tapit-accent"
                size={21}
                weight="fill"
              />
              <span className="font-semibold text-tapit-ink">Draft changes</span>
              {draftStatus != null ? (
                <span
                  aria-live="polite"
                  className="min-w-0 truncate text-tapit-muted"
                  role="status"
                >
                  {draftStatus}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                aria-controls={actionRegionId}
                aria-expanded={true}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-tapit px-4 py-2.5 text-sm font-semibold text-tapit-muted transition hover:bg-tapit-paper hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                disabled={isBusy}
                onClick={() => {
                  focusAfterToggleRef.current = "compact";
                  setIsExpanded(false);
                }}
                ref={collapseTriggerRef}
                type="button"
              >
                <CaretDownIcon aria-hidden="true" size={18} weight="bold" />
                Collapse draft actions
              </button>
              <Button
                disabled={saveDisabled}
                loading={saveLoading}
                onClick={onSave}
                type="button"
                variant="secondary"
              >
                <FloppyDiskIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
                Save draft
              </Button>
              <Button
                disabled={publishDisabled}
                loading={publishLoading}
                onClick={onPublish}
                type="button"
              >
                <UploadSimpleIcon aria-hidden="true" className="mr-2" size={18} weight="bold" />
                {publishLabel}
              </Button>
            </div>
          </div>
        </section>
      </div>
      {cropDialog}
    </div>
  );
}
