"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRightIcon,
  DesktopIcon,
  DeviceMobileIcon,
  EyeIcon,
  LinkSimpleIcon,
  CopyIcon,
} from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileTheme } from "@/lib/demo/fixtures";
import { PublicProfile } from "@/components/profile/PublicProfile";

export function WorkspacePreview({
  mode,
  onModeChange,
  preview,
  profileUrl,
  showProfileUrl = false,
  theme = preview.theme,
}: {
  mode: "phone" | "desktop";
  onModeChange: (mode: "phone" | "desktop") => void;
  preview: PublicProfileProjection;
  profileUrl: string;
  showProfileUrl?: boolean;
  theme?: ProfileTheme;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  async function copyUrl() {
    const absoluteUrl = new URL(profileUrl, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopyStatus("Profile URL copied.");
    } catch {
      setCopyStatus(`Could not copy automatically. Select this URL: ${absoluteUrl}`);
    }
  }

  const publicProfile = (
    <PublicProfile
      preview
      previewMode={mode}
      profile={preview}
      profileUrl={profileUrl}
      theme={theme}
      trackClicks={false}
      trackView={false}
    />
  );

  return (
    <section className="h-fit min-w-0 overflow-hidden rounded-tapit border border-tapit-line bg-tapit-surface shadow-[0_8px_28px_rgba(40,53,44,0.035)] min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:[zoom:0.86]">
      <div className="flex items-center justify-between gap-3 border-b border-tapit-line px-5 py-4 sm:px-6">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-tapit-ink">
          <EyeIcon aria-hidden="true" size={18} weight="bold" />
          Preview
        </h2>
        <div
          className="flex gap-1 rounded-full bg-tapit-paper p-1"
          role="group"
          aria-label="Preview layout"
        >
          {(["phone", "desktop"] as const).map((option) => (
            <button
              aria-pressed={mode === option}
              className={`inline-flex min-h-11 items-center gap-2 rounded-tapit border px-3 text-sm font-semibold transition ${
                mode === option
                  ? "border-tapit-accent bg-tapit-surface text-tapit-accent-strong shadow-sm"
                  : "border-transparent bg-tapit-paper text-tapit-muted hover:border-tapit-line hover:text-tapit-ink"
              }`}
              key={option}
              onClick={() => onModeChange(option)}
              type="button"
            >
              {option === "phone" ? (
                <DeviceMobileIcon aria-hidden="true" size={17} />
              ) : (
                <DesktopIcon aria-hidden="true" size={17} />
              )}
              <span className="capitalize">{option}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className={`min-h-[34rem] px-3 py-3 sm:min-h-[38rem] sm:px-6 sm:py-3 ${
          preview.customization?.preset === "warm-studio"
            ? "bg-[#fbf6ef]"
            : preview.theme === "night"
              ? "bg-[#17211f]"
              : preview.theme === "moss"
                ? "bg-[#e8f1eb]"
                : "bg-tapit-paper"
        }`}
      >
        <div
          data-testid="profile-preview-frame"
          className={`mx-auto transition-[max-width] duration-300 motion-reduce:transition-none ${
            mode === "phone" ? "max-w-[24.375rem]" : "max-w-[34rem]"
          }`}
        >
          {mode === "phone" ? (
            <div className="mx-auto w-full max-w-[22.5rem] rounded-[2.25rem] border-[5px] border-[#26312c] bg-[#26312c] p-[5px] shadow-[0_24px_48px_rgba(16,27,22,0.2)]">
              <div aria-hidden="true" className="flex h-5 items-center justify-center">
                <span className="h-1.5 w-10 rounded-full bg-[#78827d]" />
              </div>
              <div
                className="overflow-hidden rounded-[1.65rem] bg-tapit-surface"
                data-testid="profile-preview-device"
              >
                {publicProfile}
              </div>
            </div>
          ) : (
            publicProfile
          )}
        </div>
      </div>
      {showProfileUrl ? (
        <div className="flex flex-wrap items-center gap-4 border-t border-tapit-line bg-tapit-surface px-5 py-4 sm:px-6">
          <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-auto sm:flex-1">
            <LinkSimpleIcon aria-hidden="true" className="shrink-0 text-tapit-accent" size={22} />
            <div className="min-w-0">
              <a
                className="flex min-h-11 items-center truncate text-sm font-medium text-tapit-accent-strong hover:underline"
                href={profileUrl}
              >
                {profileUrl}
              </a>
            </div>
          </div>
          <Link
            aria-label="Open profile"
            className="inline-flex min-h-11 items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            href={profileUrl}
          >
            Open profile
            <ArrowUpRightIcon aria-hidden="true" size={17} />
          </Link>
          <button
            aria-label="Copy URL"
            className="inline-flex min-h-11 items-center gap-2 rounded-tapit border border-tapit-line px-3.5 text-sm font-semibold text-tapit-ink hover:border-tapit-accent"
            onClick={() => void copyUrl()}
            type="button"
          >
            <CopyIcon aria-hidden="true" size={17} />
            Copy URL
          </button>
          {copyStatus ? (
            <p className="basis-full break-all text-xs text-tapit-muted select-text" role="status">
              {copyStatus}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
