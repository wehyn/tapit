"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import { buildVCard, resolveProfileUrl } from "@/lib/vcard";

import type { ProfileTheme } from "@/lib/demo/fixtures";
import { recordLinkClick, recordProfileView } from "@/lib/demo/store";

const iconGlyphs = {
  link: "↗",
  mail: "@",
  phone: "⌕",
  calendar: "▣",
  linkedin: "in",
  instagram: "◎",
  globe: "◎",
} as const;

export function PublicProfile({
  profile,
  profileUrl,
  profileId,
  preview = false,
  theme = "paper",
  trackView = true,
}: {
  profile: PublicProfileProjection;
  profileUrl: string;
  profileId?: string;
  preview?: boolean;
  theme?: ProfileTheme;
  trackView?: boolean;
}) {
  const tracked = useRef(false);

  useEffect(() => {
    if (trackView && !tracked.current) {
      tracked.current = true;
      recordProfileView(profileId);
    }
  }, [profileId, trackView]);

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
      className={`${preview ? "min-h-0" : "min-h-[100dvh]"} px-5 py-8 sm:py-12 ${themeClasses.page}`}
    >
      <div
        className={`mx-auto flex w-full max-w-lg flex-col justify-between ${preview ? "min-h-0" : "min-h-[calc(100dvh-4rem)]"}`}
      >
        <section
          className={`rounded-[2rem] border px-5 py-8 shadow-[0_20px_60px_rgba(23,33,31,0.07)] sm:px-10 sm:py-10 ${themeClasses.panel}`}
        >
          <div className="flex flex-col items-center text-center">
            {profile.imageUrl ? (
              <Image
                alt={`${profile.name} profile`}
                className="size-24 rounded-full object-cover"
                height={96}
                src={profile.imageUrl}
                unoptimized
                width={96}
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-24 place-items-center rounded-full bg-tapit-accent-soft text-3xl font-semibold text-tapit-accent"
              >
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
              {profile.name}
            </h1>
            {profile.bio ? (
              <p className={`mt-2 max-w-sm text-base leading-7 ${themeClasses.muted}`}>
                {profile.bio}
              </p>
            ) : null}
          </div>

          <ul className="mt-9 grid gap-3" aria-label="Profile links">
            {profile.links.map((link) => (
              <li key={link.id}>
                <a
                  className={`group flex min-h-14 items-center justify-between rounded-2xl border px-5 py-4 text-sm font-semibold transition hover:-translate-y-px active:translate-y-px ${themeClasses.link}`}
                  href={link.destination}
                  onClick={() => recordLinkClick(link.id, profileId)}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-7 place-items-center rounded-full border border-current/20 text-[0.7rem] font-bold uppercase"
                    >
                      {iconGlyphs[link.icon ?? "link"]}
                    </span>
                    <span>{link.label}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`text-lg font-normal transition group-hover:text-tapit-accent ${themeClasses.muted}`}
                  >
                    ↗
                  </span>
                </a>
              </li>
            ))}
          </ul>

          {canSaveContact ? (
            <button
              className="mt-5 min-h-14 w-full rounded-2xl bg-tapit-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-tapit-accent-strong active:translate-y-px"
              onClick={saveContact}
              type="button"
            >
              Save contact
            </button>
          ) : null}
        </section>
        <footer
          className={`py-8 text-center text-xs font-semibold tracking-[0.18em] uppercase ${themeClasses.muted}`}
        >
          Tapit
        </footer>
      </div>
    </Container>
  );
}
