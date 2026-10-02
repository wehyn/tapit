import { type ReactNode } from "react";
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
  controls,
  message,
  preview,
  profileUrl,
  hasPublishedProfile,
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
  const isBusy = saveLoading || publishLoading;
  const shouldShowActions = hasDraftChanges || isBusy;

  return (
    <div
      className={`mx-auto grid w-full max-w-[1480px] gap-8 px-4 pt-6 sm:gap-10 sm:px-8 sm:pt-7 min-[1400px]:grid-cols-[minmax(0,1.12fr)_minmax(25rem,0.88fr)] min-[1400px]:pt-8 ${shouldShowActions ? "pb-44 sm:pb-28" : "pb-8"}`}
    >
      <h1 className="sr-only">{title}</h1>
      <div className="grid self-start gap-6">
        <div className="pb-1 min-[1400px]:hidden">
          <a
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-4 text-sm font-semibold text-tapit-accent-strong transition hover:border-tapit-accent hover:text-tapit-accent"
            href="#workspace-preview"
          >
            <EyeIcon aria-hidden="true" size={17} weight="bold" />
            View preview
          </a>
        </div>
        {message}
        {controls}
      </div>
      <div className="h-fit min-w-0 scroll-mt-24" id="workspace-preview">
        {preview ? (
          <WorkspacePreview
            mode={previewMode}
            onModeChange={onPreviewModeChange}
            preview={preview}
            profileUrl={profileUrl}
            fitPhonePreviewContent
            showProfileUrl={hasPublishedProfile}
          />
        ) : (
          <Notice tone="error">Add a name and one valid link to see a preview.</Notice>
        )}
      </div>
      {shouldShowActions ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-tapit-line bg-tapit-surface/95 px-4 py-3 shadow-[0_-12px_35px_rgba(21,25,24,0.08)] backdrop-blur sm:px-8">
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
