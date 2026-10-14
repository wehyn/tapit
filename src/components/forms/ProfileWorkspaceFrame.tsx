import { useState, type ReactNode } from "react";
import { CheckCircleIcon, EyeIcon, FloppyDiskIcon, UploadSimpleIcon } from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";

export type ProfileWorkspaceFrameProps = {
  title: string;
  controls: ReactNode;
  message?: ReactNode;
  preview: PublicProfileProjection | null;
  profileUrl: string;
  hasPublishedProfile: boolean;
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
  controls,
  message,
  preview,
  profileUrl,
  hasPublishedProfile,
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
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const isBusy = saveLoading || publishLoading;
  const shouldShowActions = hasDraftChanges || isBusy;
  const actionBarVisibility = mobileView === "preview" ? "hidden min-[1280px]:block" : "";
  const bottomPadding = shouldShowActions
    ? mobileView === "preview"
      ? "pb-8 min-[1280px]:pb-28"
      : "pb-44 sm:pb-28"
    : "pb-8";
  const selectedViewClass = "block min-[1280px]:block";
  const hiddenViewClass = "hidden min-[1280px]:block";

  return (
    <div
      className={`mx-auto grid min-w-0 w-full max-w-[1480px] gap-6 px-4 pt-6 sm:gap-8 sm:px-8 sm:pt-7 min-[1280px]:grid-cols-[minmax(32rem,1.12fr)_minmax(25rem,0.88fr)] min-[1280px]:gap-10 min-[1280px]:pt-8 ${bottomPadding}`}
    >
      <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="tapit-display text-2xl font-semibold tracking-tight text-tapit-ink sm:text-3xl">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${hasPublishedProfile ? "bg-tapit-accent-soft text-tapit-accent-strong" : "bg-tapit-paper text-tapit-muted"}`}
            >
              {hasPublishedProfile ? "Published" : "Draft"}
            </span>
            {draftStatus != null ? (
              <span aria-live="polite" className="text-sm text-tapit-muted" role="status">
                {draftStatus}
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-[1280px]:hidden">
          <div
            aria-label={`${title} view`}
            className="inline-flex rounded-tapit border border-tapit-line bg-tapit-surface p-1"
            role="group"
          >
            {(["edit", "preview"] as const).map((view) => (
              <button
                aria-pressed={mobileView === view}
                className={`min-h-9 rounded-[10px] px-3 text-sm font-semibold capitalize transition ${mobileView === view ? "bg-tapit-accent text-white" : "text-tapit-muted hover:bg-tapit-paper hover:text-tapit-ink"}`}
                key={view}
                onClick={() => setMobileView(view)}
                type="button"
              >
                {view === "edit" ? (
                  "Edit"
                ) : (
                  <>
                    <EyeIcon aria-hidden="true" className="mr-1.5 inline" size={16} />
                    Preview
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div
        className={`grid min-w-0 self-start gap-6 ${mobileView === "edit" ? selectedViewClass : hiddenViewClass}`}
      >
        {message}
        {controls}
      </div>
      <div
        className={`h-fit min-w-0 scroll-mt-24 min-[1280px]:sticky min-[1280px]:top-6 ${mobileView === "preview" ? selectedViewClass : hiddenViewClass}`}
        id="workspace-preview"
      >
        {preview ? (
          <WorkspacePreview
            preview={preview}
            profileUrl={profileUrl}
            showProfileUrl={hasPublishedProfile}
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      {shouldShowActions ? (
        <div
          className={`fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-tapit-surface/95 px-4 py-3 shadow-[0_-12px_35px_rgba(27,36,51,0.08)] backdrop-blur sm:px-8 xl:right-auto xl:w-[min(calc(50vw_-_122px),48rem)] ${actionBarVisibility}`}
        >
          <section aria-label="Draft actions" className="mx-auto max-w-[1440px]" role="region">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <CheckCircleIcon
                  aria-hidden="true"
                  className="shrink-0 text-tapit-accent"
                  size={21}
                  weight="fill"
                />
                <span className="font-semibold text-tapit-ink">Draft changes</span>
              </div>
              <div className="flex flex-wrap gap-3">
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
      ) : null}
      {cropDialog}
    </div>
  );
}
