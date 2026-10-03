"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpRightIcon,
  DeviceMobileIcon,
  EyeIcon,
  LinkSimpleIcon,
  CopyIcon,
} from "@phosphor-icons/react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileTheme } from "@/lib/demo/fixtures";
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

    const measureFit = () => {
      const naturalProfileHeight = Math.max(profile.offsetHeight, profile.scrollHeight, 1);
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
    window.addEventListener("resize", measureFit);
    measureFit();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureFit);
    };
  }, []);

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

  return (
    <section
      ref={previewPanelRef}
      className={`tapit-preview-entry flex h-fit min-w-0 flex-col overflow-hidden rounded-tapit border border-tapit-line bg-tapit-surface shadow-[0_8px_28px_rgba(16,33,28,0.035)] ${
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
        style={
          phoneNeedsPageScroll && phoneCanvasHeight
            ? { height: `${phoneCanvasHeight}px` }
            : undefined
        }
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
            data-testid="profile-preview-phone"
            className={`relative mx-auto aspect-[9/19.5] w-full max-w-[22.5rem] origin-top ${phoneNeedsPageScroll ? "absolute inset-x-0 top-0" : ""}`}
            style={{ aspectRatio: "9 / 19.5", transform: `scale(${phoneScale})` }}
          >
            <span
              aria-hidden="true"
              className="absolute -left-[2px] top-[18%] z-0 h-[2.35rem] w-[3px] rounded-l-full bg-[linear-gradient(90deg,#65736b,#17211d)] shadow-[-1px_0_2px_rgba(0,0,0,0.2)] sm:h-[3.1rem]"
            />
            <span
              aria-hidden="true"
              className="absolute -left-[2px] top-[29%] z-0 h-[2.35rem] w-[3px] rounded-l-full bg-[linear-gradient(90deg,#65736b,#17211d)] shadow-[-1px_0_2px_rgba(0,0,0,0.2)] sm:h-[3.1rem]"
            />
            <span
              aria-hidden="true"
              className="absolute -left-[2px] top-[12%] z-0 h-[1.2rem] w-[3px] rounded-l-full bg-[linear-gradient(90deg,#65736b,#17211d)] shadow-[-1px_0_2px_rgba(0,0,0,0.2)] sm:h-[1.55rem]"
            />
            <span
              aria-hidden="true"
              className="absolute -right-[2px] top-[25%] z-0 h-[3.8rem] w-[3px] rounded-r-full bg-[linear-gradient(90deg,#17211d,#65736b)] shadow-[1px_0_2px_rgba(0,0,0,0.2)] sm:h-[4.8rem]"
            />
            <div
              className="absolute inset-0 rounded-[2.45rem] border border-[#7b8881] bg-[linear-gradient(105deg,#738078_0%,#202a25_5%,#111915_13%,#18211d_88%,#738078_100%)] p-[0.34rem] shadow-[0_28px_56px_rgba(16,33,28,0.28)] sm:rounded-[3.45rem] sm:p-[0.48rem]"
              data-testid="profile-preview-hardware"
            >
              <div className="relative h-full overflow-hidden rounded-[2.12rem] bg-[#fffdfa] ring-1 ring-black/10 sm:rounded-[2.97rem]">
                <div
                  ref={phoneScreenRef}
                  aria-label="Phone profile preview"
                  className="absolute inset-0 overflow-y-auto bg-tapit-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-focus"
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
                      style={{ transform: `scaleY(${phoneContentScale})` }}
                    >
                      {publicProfile}
                    </div>
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3.1rem] bg-gradient-to-b from-black/10 to-transparent sm:h-[3.6rem]"
                  data-testid="profile-preview-status-bar"
                >
                  <span className="absolute left-[11%] top-[0.63rem] text-[0.45rem] font-bold tracking-tight text-white sm:top-[0.82rem] sm:text-[0.56rem]">
                    9:41
                  </span>
                  <span className="absolute right-[10%] top-[0.68rem] flex items-end gap-[2px] sm:top-[0.9rem]">
                    <span className="h-[3px] w-[2px] rounded-[1px] bg-white/95 sm:h-1" />
                    <span className="h-1 w-[2px] rounded-[1px] bg-white/95 sm:h-[5px]" />
                    <span className="h-[5px] w-[2px] rounded-[1px] bg-white/95 sm:h-[6px]" />
                    <span className="ml-[2px] h-[5px] w-[9px] rounded-[2px] border border-white/90 p-[1px] sm:h-[6px] sm:w-[11px]">
                      <span className="block h-full w-[72%] rounded-[1px] bg-white" />
                    </span>
                  </span>
                  <span
                    className="absolute left-1/2 top-[0.62rem] h-[0.72rem] w-[3.2rem] -translate-x-1/2 rounded-full bg-[#080b0a] shadow-[0_1px_3px_rgba(0,0,0,0.35)] sm:top-[0.82rem] sm:h-[0.9rem] sm:w-[4rem]"
                    data-testid="profile-preview-dynamic-island"
                  >
                    <span className="absolute right-[0.38rem] top-1/2 size-[0.28rem] -translate-y-1/2 rounded-full bg-[#1d3440] ring-1 ring-[#17231f] sm:right-[0.5rem] sm:size-[0.34rem]" />
                  </span>
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
                className="flex min-h-11 scroll-mb-24 items-center truncate text-sm font-medium text-tapit-accent-strong hover:underline"
                href={profileUrl}
              >
                {profileUrl}
              </a>
            </div>
          </div>
          <Link
            aria-label="View published profile"
            className="inline-flex min-h-11 scroll-mb-24 items-center gap-2 rounded-tapit border border-tapit-line bg-tapit-surface px-3.5 text-sm font-semibold text-tapit-ink transition hover:border-tapit-accent hover:text-tapit-accent"
            href={profileUrl}
          >
            View published profile
            <ArrowUpRightIcon aria-hidden="true" size={17} />
          </Link>
          <button
            aria-label="Copy URL"
            className="inline-flex min-h-11 scroll-mb-24 items-center gap-2 rounded-tapit border border-tapit-line px-3.5 text-sm font-semibold text-tapit-ink hover:border-tapit-accent"
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
