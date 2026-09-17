"use client";

import Image from "next/image";
import {
  ArrowUpRight,
  CalendarDots,
  DownloadSimple,
  EnvelopeSimple,
  Globe,
  InstagramLogo,
  LinkedinLogo,
  LinkSimple,
  Phone,
} from "@phosphor-icons/react";
import { useEffect, useRef } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import { buildVCard, resolveProfileUrl } from "@/lib/vcard";
import type { ProfileTheme } from "@/lib/demo/fixtures";

const linkIcons = {
  link: LinkSimple,
  mail: EnvelopeSimple,
  phone: Phone,
  calendar: CalendarDots,
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
  globe: Globe,
} as const;

export function PublicProfile({
  profile,
  profileUrl,
  profileId,
  preview = false,
  theme = "paper",
  trackClicks = true,
  trackView = true,
  onLinkClick,
  onView,
}: {
  profile: PublicProfileProjection;
  profileUrl: string;
  profileId?: string;
  preview?: boolean;
  theme?: ProfileTheme;
  trackClicks?: boolean;
  trackView?: boolean;
  onLinkClick?: (linkId: string, profileId?: string) => void;
  onView?: (profileId?: string) => void;
}) {
  const tracked = useRef(false);
  useEffect(() => {
    if (trackView && !tracked.current) {
      tracked.current = true;
      onView?.(profileId);
    }
  }, [onView, profileId, trackView]);
  const canSaveContact = Boolean(profile.name && (profile.email || profile.website));
  const themeClasses = {
    paper: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "border-tapit-line bg-tapit-surface",
      link: "border-tapit-line bg-tapit-surface hover:border-tapit-accent hover:bg-tapit-accent-soft",
      muted: "text-tapit-muted",
    },
    moss: {
      page: "bg-[#e8f1eb] text-[#17352b]",
      panel: "border-[#b9d1c0] bg-[#f7fbf8]",
      link: "border-[#b9d1c0] bg-[#f7fbf8] hover:border-[#176b57] hover:bg-[#dcece2]",
      muted: "text-[#4f6d5c]",
    },
    night: {
      page: "bg-[#17211f] text-[#f2f6f1]",
      panel: "border-[#40534d] bg-[#22302b]",
      link: "border-[#40534d] bg-[#22302b] hover:border-[#7bc2a9] hover:bg-[#2d4239]",
      muted: "text-[#b7c9c0]",
    },
  }[theme];
  const previewPageClasses = {
    paper: "bg-transparent text-tapit-ink",
    moss: "bg-transparent text-[#17352b]",
    night: "bg-transparent text-[#f2f6f1]",
  }[theme];
  function saveContact() {
    const vCard = buildVCard({
      name: profile.name,
      email: profile.email,
      website: profile.website,
      profileUrl: resolveProfileUrl(profileUrl, window.location.origin),
    });
    const blob = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${profile.slug}.vcf`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  }
  const Container = preview ? "div" : "main";
  return (
    <Container
      className={`${preview ? "min-h-0 px-3 py-3 sm:px-4 sm:py-5" : "min-h-[100dvh] px-5 py-8 sm:py-12"} ${preview ? previewPageClasses : themeClasses.page}`}
    >
      <div
        className={`mx-auto flex w-full max-w-xl flex-col justify-between ${preview ? "min-h-0" : "min-h-[calc(100dvh-4rem)]"}`}
      >
        <section
          className={`rounded-tapit border shadow-[0_20px_60px_rgba(21,25,24,0.12)] ${preview ? "px-4 py-5 sm:px-6 sm:py-7" : "px-5 py-8 sm:px-10 sm:py-10"} ${themeClasses.panel}`}
        >
          <div
            className={`flex flex-col ${preview ? "items-center text-center" : "items-start text-left sm:flex-row sm:items-center sm:gap-6"}`}
          >
            {profile.imageUrl ? (
              <Image
                alt={`${profile.name} profile`}
                className={`${preview ? "size-20" : "size-20 sm:size-24"} rounded-full object-cover`}
                height={96}
                src={profile.imageUrl}
                unoptimized
                width={96}
              />
            ) : (
              <div
                aria-hidden="true"
                className={`${preview ? "size-20" : "size-20 sm:size-24"} grid place-items-center rounded-full bg-tapit-accent-soft text-3xl font-semibold text-tapit-accent`}
              >
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={preview ? "mt-4" : "mt-5 sm:mt-0"}>
              {preview ? (
                <h2 className="text-2xl font-semibold tracking-tight">{profile.name}</h2>
              ) : (
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {profile.name}
                </h1>
              )}
              {profile.bio ? (
                <p
                  className={`${preview ? "mt-1 max-w-xs text-sm leading-6" : "mt-2 max-w-sm text-base leading-7"} ${themeClasses.muted}`}
                >
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>
          <ul
            className={`${preview ? "mt-6 gap-2" : "mt-9 gap-3"} grid`}
            aria-label="Profile links"
          >
            {profile.links.map((link) => {
              const LinkIcon =
                link.icon !== undefined &&
                Object.prototype.hasOwnProperty.call(linkIcons, link.icon)
                  ? linkIcons[link.icon as keyof typeof linkIcons]
                  : LinkSimple;
              return (
                <li key={link.id}>
                  <a
                    className={`group flex items-center justify-between rounded-tapit border font-semibold transition hover:-translate-y-px active:translate-y-px ${preview ? "min-h-12 px-3.5 py-3 text-sm" : "min-h-14 px-5 py-4 text-sm"} ${themeClasses.link}`}
                    href={link.destination}
                    onClick={() => {
                      if (trackClicks) onLinkClick?.(link.id, profileId);
                    }}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span className="flex items-center gap-3">
                      <LinkIcon aria-hidden="true" size={preview ? 18 : 20} />
                      <span>{link.label}</span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className={`transition group-hover:text-tapit-accent ${themeClasses.muted}`}
                      size={preview ? 17 : 19}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
          {canSaveContact ? (
            <button
              className={`${preview ? "mt-4 min-h-12 px-4 py-3" : "mt-5 min-h-14 px-5 py-4"} inline-flex w-full items-center justify-center gap-2 rounded-full bg-tapit-accent text-sm font-semibold text-white transition hover:bg-tapit-accent-strong active:translate-y-px`}
              onClick={saveContact}
              type="button"
            >
              <DownloadSimple aria-hidden="true" size={19} /> Save contact
            </button>
          ) : null}
          {preview ? (
            <p
              className={`mt-5 text-center text-xs font-semibold tracking-[0.16em] uppercase ${themeClasses.muted}`}
            >
              Powered by Tapit
            </p>
          ) : null}
        </section>
        {!preview ? (
          <footer
            className={`py-8 text-center text-xs font-semibold tracking-[0.18em] uppercase ${themeClasses.muted}`}
          >
            Tapit
          </footer>
        ) : null}
      </div>
    </Container>
  );
}
