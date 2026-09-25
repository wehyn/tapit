"use client";

/* eslint-disable @next/next/no-img-element -- Profile uploads already have explicit 192px/384px variants for native srcSet selection. */
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
import {
  getAutomaticContactActions,
  getFeaturedProfileLink,
  normalizeProfileCustomization,
  resolveProfileAppearance,
} from "@/lib/profile-customization";
import { ProfileContactStrip } from "./ProfileContactStrip";
import { ProfileMediaSurface } from "./ProfileMediaSurface";
import { ProfileSlideshow } from "./ProfileSlideshow";
import { ProfileSectionDisclosure } from "./ProfileSectionDisclosure";

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
  previewMode,
  trackClicks = true,
  trackView = true,
  onLinkClick,
  onView,
}: {
  profile: PublicProfileProjection;
  profileUrl: string;
  profileId?: string;
  preview?: boolean;
  previewMode?: "phone" | "desktop";
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
  const customization = normalizeProfileCustomization(profile.customization);
  const appearance = resolveProfileAppearance(customization);
  const warmStudio = appearance.mode === "warm-studio";
  const media = profile.media;
  const background = media?.background;
  const hasIntegratedBackground = warmStudio && background !== undefined;
  const hasLegacyBackground = !warmStudio && background !== undefined;
  const hasLegacySlideshow = !warmStudio && (media?.slideshow.length ?? 0) > 0;
  const hasLegacyMedia = hasLegacyBackground || hasLegacySlideshow;
  const phonePreview = preview && (previewMode ?? "phone") === "phone";
  const centerIdentity = preview || hasIntegratedBackground;
  const theme = profile.theme;
  const automaticContactActions = getAutomaticContactActions(profile);
  const canSaveContact = Boolean(profile.name && automaticContactActions.length > 0);
  const featuredLink = getFeaturedProfileLink(profile.links, customization?.featuredLinkId);
  const links = profile.links.filter((link) => link.id !== featuredLink?.id);
  const section = customization?.section;
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
  const warmAccent = {
    coral: {
      solid: "border-[#b24f38] bg-[#b24f38] text-white hover:border-[#963f2e] hover:bg-[#963f2e]",
      outlined: "border-[#a84431] bg-transparent text-[#a84431] hover:bg-[#ffede3]",
      soft: "border-[#ead8c8] bg-[#fff8f1] hover:border-[#a84431] hover:bg-[#ffede3]",
      avatar: "bg-[#ffede3] text-[#a84431]",
      arrow: "group-hover:text-[#a84431]",
    },
    jade: {
      solid: "border-[#3e806d] bg-[#3e806d] text-white hover:border-[#2e6958] hover:bg-[#2e6958]",
      outlined: "border-[#3e806d] bg-transparent text-[#3e806d] hover:bg-[#e1f0ea]",
      soft: "border-[#d5e5dd] bg-[#f2faf5] hover:border-[#3e806d] hover:bg-[#e1f0ea]",
      avatar: "bg-[#e1f0ea] text-[#3e806d]",
      arrow: "group-hover:text-[#3e806d]",
    },
    ink: {
      solid: "border-[#2c2420] bg-[#2c2420] text-white hover:border-[#17120f] hover:bg-[#17120f]",
      outlined: "border-[#2c2420] bg-transparent text-[#2c2420] hover:bg-[#eee8e2]",
      soft: "border-[#ded5cd] bg-[#f8f4ef] hover:border-[#2c2420] hover:bg-[#eee8e2]",
      avatar: "bg-[#eee8e2] text-[#2c2420]",
      arrow: "group-hover:text-[#2c2420]",
    },
  }[appearance.accent];
  const pageClasses = warmStudio ? "bg-[#fbf6ef] text-[#2c2420]" : themeClasses.page;
  const panelClasses = warmStudio
    ? phonePreview
      ? "border-[#e5d6c5] bg-[#fffdf9]"
      : preview
        ? "border-[#e5d6c5] bg-[#fffdf9]"
        : "sm:border-[#e5d6c5] sm:bg-[#fffdf9]"
    : themeClasses.panel;
  const mutedClasses = warmStudio ? "text-[#74665d]" : themeClasses.muted;
  const linkClasses = warmStudio
    ? appearance.linkTreatment === "outlined"
      ? warmAccent.outlined
      : warmAccent.solid
    : themeClasses.link;
  const typeScaleClasses =
    warmStudio && appearance.typeScale === "compact"
      ? phonePreview
        ? "text-2xl"
        : "text-2xl sm:text-3xl"
      : warmStudio && appearance.typeScale === "editorial"
        ? phonePreview
          ? "text-4xl"
          : "text-4xl sm:text-5xl"
        : warmStudio
          ? phonePreview
            ? "text-3xl"
            : "text-3xl sm:text-4xl"
          : preview
            ? "text-2xl"
            : "text-3xl sm:text-4xl";
  const profileLinkMargin = phonePreview
    ? warmStudio
      ? "mt-6"
      : "mt-9"
    : preview
      ? warmStudio
        ? "mt-4"
        : "mt-6"
      : warmStudio
        ? "mt-6"
        : "mt-9";
  const profileLinkGap = phonePreview || !preview ? "gap-3" : "gap-2";
  function saveContact() {
    const email = automaticContactActions.find((action) => action.kind === "email");
    const phone = automaticContactActions.find((action) => action.kind === "phone");
    const website = automaticContactActions.find((action) => action.kind === "website");
    const vCard = buildVCard({
      name: profile.name,
      email: email?.href.replace(/^mailto:/, ""),
      phone: phone?.href.replace(/^tel:/, ""),
      website: website?.href,
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
  function renderLink(link: PublicProfileProjection["links"][number], featured = false) {
    const LinkIcon =
      link.icon !== undefined && Object.prototype.hasOwnProperty.call(linkIcons, link.icon)
        ? linkIcons[link.icon as keyof typeof linkIcons]
        : LinkSimple;
    return (
      <li key={link.id}>
        <a
          className={`group flex items-center justify-between rounded-tapit border font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${featured ? `min-h-16 px-5 py-4 ${warmStudio ? (appearance.linkTreatment === "outlined" ? warmAccent.outlined : warmAccent.solid) : "text-white bg-tapit-accent hover:bg-tapit-accent-strong border-transparent"}` : phonePreview ? "min-h-14 px-5 py-4 text-sm" : preview ? "min-h-12 px-3.5 py-3 text-sm" : "min-h-14 px-5 py-4 text-sm"} ${featured ? "" : linkClasses}`}
          data-featured={featured ? "true" : undefined}
          href={link.destination}
          onClick={() => {
            if (trackClicks) onLinkClick?.(link.id, profileId);
          }}
          rel="noreferrer"
          target="_blank"
        >
          <span className="flex items-center gap-3">
            <LinkIcon aria-hidden="true" size={phonePreview || !preview ? 20 : 18} />
            <span>{link.label}</span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className={`transition motion-reduce:transition-none ${warmStudio ? warmAccent.arrow : "group-hover:text-tapit-accent"} ${featured ? (warmStudio && appearance.linkTreatment === "outlined" ? "text-current/80" : "text-white/80") : mutedClasses}`}
            size={phonePreview || !preview ? 19 : 17}
          />
        </a>
      </li>
    );
  }
  const disclosure = section ? (
    <ProfileSectionDisclosure section={section} className={`border-current/15 ${mutedClasses}`} />
  ) : null;
  const identity = (
    <div
      className={`flex flex-col ${centerIdentity ? "items-center text-center" : "items-start text-left sm:flex-row sm:items-center sm:gap-6"}`}
    >
      {profile.imageUrl ? (
        <img
          alt={`${profile.name} profile`}
          className={`${preview ? "size-20" : "size-20 sm:size-24"} rounded-full object-cover`}
          height={96}
          src={profile.imageUrl}
          srcSet={profile.imageSrcSet}
          sizes={profile.imageSrcSet ? "(min-width: 640px) 96px, 80px" : undefined}
          width={96}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${preview ? "size-20" : "size-20 sm:size-24"} grid place-items-center rounded-full text-3xl font-semibold ${warmStudio ? warmAccent.avatar : "bg-tapit-accent-soft text-tapit-accent"}`}
        >
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div
        className={
          hasIntegratedBackground
            ? "mt-4"
            : phonePreview
              ? "mt-5"
              : preview
                ? "mt-4"
                : "mt-5 sm:mt-0"
        }
      >
        {preview ? (
          <h2
            className={`${typeScaleClasses} font-semibold tracking-tight ${hasIntegratedBackground ? "text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]" : ""}`}
          >
            {profile.name}
          </h2>
        ) : (
          <h1
            className={`${typeScaleClasses} font-semibold tracking-tight ${hasIntegratedBackground ? "text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.45)]" : ""}`}
          >
            {profile.name}
          </h1>
        )}
        {profile.bio ? (
          <p
            className={`${hasIntegratedBackground ? (preview ? "mt-1 max-w-xs text-sm leading-6" : "mt-2 max-w-sm text-base leading-7") : phonePreview ? "mt-2 max-w-sm text-base leading-7" : preview ? "mt-1 max-w-xs text-sm leading-6" : "mt-2 max-w-sm text-base leading-7"} ${hasIntegratedBackground ? "text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : mutedClasses}`}
          >
            {profile.bio}
          </p>
        ) : null}
      </div>
    </div>
  );
  const profileContent = (
    <>
      {media && media.slideshow.length > 0 && hasIntegratedBackground ? (
        <div>
          <ProfileSlideshow autoplay={media.autoplay} images={media.slideshow} />
        </div>
      ) : null}
      {warmStudio ? (
        <ProfileContactStrip
          email={profile.email}
          phone={profile.phone}
          website={profile.website}
          className={`${phonePreview ? "mt-7 justify-center" : preview ? "mt-5 justify-center" : "mt-7 justify-center sm:justify-start"} ${mutedClasses}`}
        />
      ) : null}
      {featuredLink ? (
        <ul
          className={`${phonePreview ? "mt-6" : preview ? "mt-4" : "mt-6"} grid gap-3`}
          aria-label="Featured profile link"
        >
          {renderLink(featuredLink, true)}
        </ul>
      ) : null}
      {section && customization?.contentOrder === "section-first" ? (
        <div className={`${phonePreview ? "mt-6" : preview ? "mt-4" : "mt-6"}`}>{disclosure}</div>
      ) : null}
      <ul className={`${profileLinkMargin} ${profileLinkGap} grid`} aria-label="Profile links">
        {links.map((link) => renderLink(link))}
      </ul>
      {section && customization?.contentOrder !== "section-first" ? (
        <div className="mt-6">{disclosure}</div>
      ) : null}
      {canSaveContact ? (
        <button
          className={`${phonePreview ? "mt-5 min-h-14 px-5 py-4" : preview ? "mt-4 min-h-12 px-4 py-3" : "mt-5 min-h-14 px-5 py-4"} inline-flex w-full items-center justify-center gap-2 rounded-full border text-sm font-semibold transition motion-reduce:transition-none motion-reduce:transform-none active:translate-y-px ${warmStudio ? (appearance.linkTreatment === "outlined" ? warmAccent.outlined : warmAccent.solid) : "border-transparent bg-tapit-accent text-white hover:bg-tapit-accent-strong"}`}
          onClick={saveContact}
          type="button"
        >
          <DownloadSimple aria-hidden="true" size={19} /> Save contact
        </button>
      ) : null}
      {preview ? (
        <p
          className={`mt-5 text-center text-xs font-semibold tracking-[0.16em] uppercase ${mutedClasses}`}
        >
          Powered by Tapit
        </p>
      ) : null}
    </>
  );
  const profileFrameClasses = phonePreview
    ? "rounded-tapit border shadow-[0_20px_60px_rgba(21,25,24,0.12)]"
    : preview
      ? "rounded-tapit border shadow-[0_20px_60px_rgba(21,25,24,0.12)]"
      : "rounded-none border-0 shadow-none sm:rounded-tapit sm:border sm:shadow-[0_20px_60px_rgba(21,25,24,0.12)]";
  const Container = preview ? "div" : "main";
  return (
    <Container
      className={`${phonePreview ? "min-h-0 p-0" : preview ? "min-h-0 px-3 py-3 sm:px-4 sm:py-5" : "min-h-[100dvh] px-0 py-0 sm:px-5 sm:py-12"} ${preview ? (warmStudio ? "bg-transparent text-[#2c2420]" : previewPageClasses) : pageClasses}`}
    >
      <div
        className={`mx-auto flex w-full ${phonePreview ? "max-w-none" : "max-w-xl"} flex-col justify-between ${preview ? "min-h-0" : "min-h-[calc(100dvh-4rem)]"}`}
      >
        {hasIntegratedBackground ? (
          <ProfileMediaSurface
            background={background}
            heroHeight={media?.heroHeight ?? 320}
            className={`${profileFrameClasses} ${panelClasses}`}
            compact={phonePreview}
            fullSurface
          >
            {identity}
            {profileContent}
          </ProfileMediaSurface>
        ) : (
          <section
            className={`${profileFrameClasses} ${phonePreview ? "px-4 py-5" : preview ? "px-4 py-5 sm:px-6 sm:py-7" : "px-5 py-8 sm:px-10 sm:py-10"} ${panelClasses}`}
          >
            {hasLegacyBackground ? (
              <ProfileMediaSurface
                background={background}
                heroHeight={media?.heroHeight ?? 320}
                treatment="legacy"
              />
            ) : null}
            {hasLegacySlideshow ? (
              <div className={hasLegacyBackground ? "mt-5" : ""}>
                <ProfileSlideshow
                  autoplay={media?.autoplay ?? true}
                  images={media?.slideshow ?? []}
                />
              </div>
            ) : null}
            {warmStudio && media && media.slideshow.length > 0 ? (
              <div className="mt-6">
                <ProfileSlideshow autoplay={media.autoplay} images={media.slideshow} />
              </div>
            ) : null}
            <div
              className={
                hasLegacyMedia || (warmStudio && (media?.slideshow.length ?? 0) > 0) ? "mt-6" : ""
              }
            >
              {identity}
            </div>
            {profileContent}
          </section>
        )}
        {!preview ? (
          <footer
            className={`py-8 text-center text-xs font-semibold tracking-[0.18em] uppercase ${mutedClasses}`}
          >
            Tapit
          </footer>
        ) : null}
      </div>
    </Container>
  );
}
