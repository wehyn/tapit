"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  DeviceMobileIcon,
  EyeIcon,
  GlobeSimpleIcon,
  LinkSimpleIcon,
  CopyIcon,
} from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileTheme } from "@/lib/demo/fixtures";
import { DEFAULT_CUSTOM_PROFILE_COLORS } from "@/lib/profile-customization";
import { PublicProfile } from "@/components/profile/PublicProfile";

const MIN_PHONE_SCALE = 0.58;
const MIN_PHONE_CONTENT_SCALE = 0.95;

export function WorkspacePreview({
  preview,
  profileUrl,
  showProfileUrl = false,
  fitPhonePreviewContent = false,
  theme = preview.theme,
}: {
  preview: PublicProfileProjection;
  profileUrl: string;
  showProfileUrl?: boolean;
  fitPhonePreviewContent?: boolean;
  theme?: ProfileTheme;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [phoneScale, setPhoneScale] = useState(1);
  const [phoneContentScale, setPhoneContentScale] = useState(1);
  const [phoneContentHeight, setPhoneContentHeight] = useState<number>();
  const [phoneScreenScrollable, setPhoneScreenScrollable] = useState(false);
  const [phoneNeedsPageScroll, setPhoneNeedsPageScroll] = useState(false);
  const [phoneFrameHeight, setPhoneFrameHeight] = useState<number | undefined>();
  const [phoneCanvasHeight, setPhoneCanvasHeight] = useState<number | undefined>();
  const previewPanelRef = useRef<HTMLElement>(null);
  const previewCanvasRef = useRef<HTMLDivElement>(null);
  const phoneDeviceRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const phoneProfileRef = useRef<HTMLDivElement>(null);
  const phoneNeedsPageScrollRef = useRef(false);

  useLayoutEffect(() => {
    const canvas = previewCanvasRef.current;
    const device = phoneDeviceRef.current;
    const screen = phoneScreenRef.current;
    const profile = phoneProfileRef.current;
    const panel = previewPanelRef.current;
    if (!canvas || !device || !screen || !profile || !panel) return;
    const profileSurface = profile.querySelector<HTMLElement>(
      ".tapit-profile-entry > div > section",
    );

    const measureFit = () => {
      const naturalProfileHeight = Math.max(
        profile.offsetHeight,
        profile.scrollHeight,
        profileSurface?.scrollHeight ?? 0,
        1,
      );
      const availableProfileHeight = Math.max(screen.clientHeight, 1);
      const idealContentScale = Math.min(1, availableProfileHeight / naturalProfileHeight);
      const nextContentScale = Math.max(idealContentScale, MIN_PHONE_CONTENT_SCALE);
      const nextContentHeight = Math.max(
        availableProfileHeight,
        Math.ceil(naturalProfileHeight * nextContentScale),
      );

      setPhoneContentScale((currentScale) =>
        Math.abs(currentScale - nextContentScale) < 0.005 ? currentScale : nextContentScale,
      );
      setPhoneContentHeight((currentHeight) =>
        currentHeight === nextContentHeight ? currentHeight : nextContentHeight,
      );
      setPhoneScreenScrollable((currentScrollable) => {
        const nextScrollable = nextContentHeight > availableProfileHeight + 1;
        return currentScrollable === nextScrollable ? currentScrollable : nextScrollable;
      });

      if (window.innerWidth < 1400) {
        phoneNeedsPageScrollRef.current = false;
        setPhoneScale(1);
        setPhoneNeedsPageScroll(false);
        setPhoneFrameHeight(undefined);
        setPhoneCanvasHeight(undefined);
        return;
      }

      const canvasStyle = getComputedStyle(canvas);
      const horizontalPadding =
        Number.parseFloat(canvasStyle.paddingLeft) + Number.parseFloat(canvasStyle.paddingRight);
      const availableWidth = Math.max(canvas.clientWidth - horizontalPadding - 24, 1);
      const wasExpanded = phoneNeedsPageScrollRef.current;
      const panelChromeHeight = Math.max(panel.offsetHeight - canvas.clientHeight, 0);
      const availableHeight = wasExpanded
        ? Math.max(window.innerHeight - 120 - panelChromeHeight - 24, 1)
        : Math.max(canvas.clientHeight - 24, 1);
      const naturalWidth = Math.max(device.offsetWidth, 1);
      const naturalHeight = Math.max(device.offsetHeight, 1);
      const idealScale = Math.min(
        1,
        availableWidth / naturalWidth,
        availableHeight / naturalHeight,
      );
      const nextScale = Math.max(idealScale, MIN_PHONE_SCALE);
      const needsPageScroll = idealScale < MIN_PHONE_SCALE;
      phoneNeedsPageScrollRef.current = needsPageScroll;

      const nextFrameHeight = needsPageScroll
        ? Math.ceil(naturalHeight * MIN_PHONE_SCALE)
        : undefined;
      const nextCanvasHeight = needsPageScroll ? (nextFrameHeight ?? 0) + 24 : undefined;

      setPhoneScale((currentScale) =>
        Math.abs(currentScale - nextScale) < 0.005 ? currentScale : nextScale,
      );
      setPhoneNeedsPageScroll((current) =>
        current === needsPageScroll ? current : needsPageScroll,
      );
      setPhoneFrameHeight((current) => (current === nextFrameHeight ? current : nextFrameHeight));
      setPhoneCanvasHeight((current) =>
        current === nextCanvasHeight ? current : nextCanvasHeight,
      );
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureFit);
    observer?.observe(canvas);
    observer?.observe(device);
    observer?.observe(screen);
    observer?.observe(profile);
    if (profileSurface) observer?.observe(profileSurface);
    window.addEventListener("resize", measureFit);
    measureFit();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureFit);
    };
  }, [fitPhonePreviewContent, preview, theme]);

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
      fitPhonePreviewContent={fitPhonePreviewContent}
      profile={preview}
      profileUrl={profileUrl}
      theme={theme}
      trackClicks={false}
      trackView={false}
    />
  );
  const profilePath = profileUrl.startsWith("/") ? profileUrl : `/${profileUrl}`;
  const customCanvasColor =
    preview.theme === "custom" && preview.customization?.preset === "custom"
      ? (preview.customization.customColors?.canvas ?? DEFAULT_CUSTOM_PROFILE_COLORS.canvas)
      : undefined;

  return (
    <section
      ref={previewPanelRef}
      className={`tapit-preview-entry flex h-fit min-w-0 flex-col overflow-hidden rounded-tapit border border-tapit-line bg-tapit-surface shadow-[0_8px_24px_rgba(27,36,51,0.05)] ${
        phoneNeedsPageScroll
          ? "min-[1400px]:static min-[1400px]:max-h-none"
          : "min-[1400px]:sticky min-[1400px]:top-6 min-[1400px]:max-h-[calc(100dvh-7.5rem)]"
      }`}
      data-preview-fit={phoneNeedsPageScroll ? "page-scroll" : "viewport"}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-tapit-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-tapit-ink">
            <EyeIcon aria-hidden="true" size={18} weight="bold" />
            Preview
          </h2>
          <p className="mt-1 max-w-[24rem] text-xs leading-5 text-tapit-muted">
            Only you can see this draft until you publish it.
          </p>
          {phoneNeedsPageScroll ? (
            <p className="mt-1 max-w-[24rem] text-xs leading-5 text-tapit-muted">
              This phone keeps a readable size. Scroll the workspace to see its full frame.
            </p>
          ) : null}
        </div>
        <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-paper px-3 text-sm font-semibold text-tapit-accent-strong">
          <DeviceMobileIcon aria-hidden="true" size={17} />
          Mobile
        </span>
      </div>
      <div
        ref={previewCanvasRef}
        style={{
          ...(phoneNeedsPageScroll && phoneCanvasHeight
            ? { height: `${phoneCanvasHeight}px` }
            : {}),
          ...(customCanvasColor ? { backgroundColor: customCanvasColor } : {}),
        }}
        className={`min-h-[34rem] px-3 py-3 sm:min-h-[38rem] sm:px-6 sm:py-3 min-[1400px]:min-h-0 min-[1400px]:overscroll-contain ${
          phoneNeedsPageScroll
            ? "min-[1400px]:flex-none min-[1400px]:overflow-visible"
            : "min-[1400px]:flex-1 min-[1400px]:overflow-hidden"
        } ${
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
          className="relative mx-auto max-w-[24.375rem] transition-[max-width] duration-300 motion-reduce:transition-none"
          style={phoneNeedsPageScroll ? { height: phoneFrameHeight } : undefined}
        >
          <div
            ref={phoneDeviceRef}
            aria-label="Mobile web profile preview"
            className={`relative mx-auto aspect-[9/19.5] w-full max-w-[22.5rem] origin-top ${phoneNeedsPageScroll ? "absolute inset-x-0 top-0" : ""}`}
            data-testid="profile-preview-viewport"
            role="group"
            style={{ aspectRatio: "9 / 19.5", transform: `scale(${phoneScale})` }}
          >
            <div className="absolute inset-0 rounded-[2rem] border border-[#d7deea] bg-white p-[0.31rem] shadow-[0_16px_42px_rgba(27,36,51,0.10),0_2px_6px_rgba(27,36,51,0.04)] sm:rounded-[2.125rem] sm:p-[0.31rem]">
              <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.625rem] bg-tapit-surface sm:rounded-[1.75rem]">
                <div className="flex h-10 shrink-0 items-center justify-center border-b border-[#eef0f4] bg-white px-[15px]">
                  <div className="flex h-[25px] w-full items-center justify-center gap-1.5 rounded-[9px] border border-[#edf0f5] bg-[#f8f9fb] px-2 text-[9px] tracking-[0.01em] text-tapit-muted sm:text-[10px]">
                    <GlobeSimpleIcon
                      aria-hidden="true"
                      className="shrink-0 text-[#9aa4b4]"
                      size={11}
                    />
                    <span className="truncate">{`tapit.app${profilePath}`}</span>
                  </div>
                </div>
                <div
                  ref={phoneScreenRef}
                  aria-label="Profile preview"
                  className="relative min-h-0 flex-1 overflow-y-auto bg-tapit-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-focus"
                  data-testid="profile-preview-device"
                  role="region"
                  tabIndex={phoneScreenScrollable ? 0 : undefined}
                >
                  <div
                    className="relative min-h-full overflow-hidden"
                    style={phoneContentHeight ? { height: `${phoneContentHeight}px` } : undefined}
                  >
                    <div
                      ref={phoneProfileRef}
                      className="absolute inset-x-0 top-0 origin-top"
                      style={{
                        height: phoneContentHeight
                          ? `${phoneContentHeight / phoneContentScale}px`
                          : undefined,
                        transform: `scaleY(${phoneContentScale})`,
                      }}
                    >
                      {publicProfile}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showProfileUrl ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-tapit-line bg-tapit-surface px-5 py-4 sm:px-6">
          <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-auto sm:flex-1">
            <LinkSimpleIcon aria-hidden="true" className="shrink-0 text-tapit-accent" size={22} />
            <div className="min-w-0">
              <a
                className="flex min-h-11 scroll-mb-44 items-center truncate text-sm font-medium text-tapit-accent-strong hover:underline"
                href={profileUrl}
              >
                {profileUrl}
              </a>
            </div>
          </div>
          <Link
            aria-label="View published profile"
            className="inline-flex min-h-11 scroll-mb-44 items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            href={profileUrl}
          >
            View published profile
            <ArrowUpRightIcon aria-hidden="true" size={17} />
          </Link>
          <button
            aria-label="Copy URL"
            className="inline-flex min-h-11 scroll-mb-44 items-center gap-2 rounded-tapit border border-tapit-line px-3.5 text-sm font-semibold text-tapit-ink hover:border-tapit-accent"
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
