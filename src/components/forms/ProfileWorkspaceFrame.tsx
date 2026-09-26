import type { ReactNode } from "react";
import { CheckCircleIcon, FloppyDiskIcon, UploadSimpleIcon } from "@phosphor-icons/react";

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
  return (
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-5 pb-28 pt-7 sm:px-8 min-[1400px]:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)] min-[1400px]:gap-10 min-[1400px]:pt-8">
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
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <CheckCircleIcon
              aria-hidden="true"
              className="shrink-0 text-tapit-accent"
              size={21}
              weight="fill"
            />
            <span className="font-semibold text-tapit-ink">Draft changes</span>
            {draftStatus != null ? (
              <span aria-live="polite" className="min-w-0 truncate text-tapit-muted" role="status">
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
      </div>
      {cropDialog}
    </div>
  );
}
