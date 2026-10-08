"use client";

/* eslint-disable @next/next/no-img-element -- Profile uploads already have explicit 192px/384px variants for native srcSet selection. */
import {
  ArrowUpRight,
  Briefcase,
  CalendarDots,
  Camera,
  Code,
  DownloadSimple,
  EnvelopeSimple,
  Globe,
  GithubLogo,
  Images,
  InstagramLogo,
  LinkedinLogo,
  LinkSimple,
  Phone,
  Palette,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileTheme } from "@/lib/demo/fixtures";
import { buildVCard } from "@/lib/vcard";
import type { VCardPhoto } from "@/lib/vcard";
import {
  CUSTOM_PROFILE_ACCENT_SOFT_SURFACE_PERCENT,
  DEFAULT_CUSTOM_PROFILE_COLORS,
  getAutomaticContactActions,
  getFeaturedProfileLink,
  normalizeProfileCustomization,
  resolveProfileAppearance,
  type ProfileThemeColors,
} from "@/lib/profile-customization";
import { ProfileContactStrip } from "./ProfileContactStrip";
import { ProfileMediaSurface } from "./ProfileMediaSurface";
import { ProfileSlideshow } from "./ProfileSlideshow";
import { ProfileSectionDisclosure } from "./ProfileSectionDisclosure";

const MAX_VCARD_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VCARD_PHOTO_PIXELS = 16_000_000;

type ProfileThemeCSSProperties = CSSProperties & Record<`--tapit-${string}`, string>;

const profileThemeStyles: Record<
  Exclude<ProfileTheme, "paper" | "custom">,
  ProfileThemeCSSProperties
> = {
  moss: {
    "--tapit-ink": "#17352b",
    "--tapit-muted": "#4f6d5c",
    "--tapit-surface": "#f7fbf8",
    "--tapit-paper": "#e8f1eb",
    "--tapit-soft-surface": "#dcece2",
    "--tapit-line": "#b9d1c0",
    "--tapit-accent": "#176b57",
    "--tapit-accent-strong": "#105543",
    "--tapit-accent-soft": "#dcece2",
    "--tapit-focus": "#176b57",
  },
  night: {
    "--tapit-ink": "#f2f6f1",
    "--tapit-muted": "#b7c9c0",
    "--tapit-surface": "#22302b",
    "--tapit-paper": "#17211f",
    "--tapit-soft-surface": "#2d4239",
    "--tapit-line": "#40534d",
    "--tapit-accent": "#7bc2a9",
    "--tapit-accent-strong": "#a0dbc5",
    "--tapit-accent-soft": "#2d4239",
    "--tapit-focus": "#a0dbc5",
  },
};

function customProfileThemeStyles(colors: ProfileThemeColors): ProfileThemeCSSProperties {
  const accentSoftSurface = `color-mix(in srgb, ${colors.surface} ${CUSTOM_PROFILE_ACCENT_SOFT_SURFACE_PERCENT}%, ${colors.accent})`;
  return {
    "--tapit-ink": colors.ink,
    "--tapit-muted": colors.ink,
    "--tapit-surface": colors.surface,
    "--tapit-paper": colors.canvas,
    "--tapit-soft-surface": accentSoftSurface,
    "--tapit-line": `color-mix(in srgb, ${colors.ink} 16%, ${colors.surface})`,
    "--tapit-accent": colors.accent,
    "--tapit-accent-strong": colors.accent,
    "--tapit-accent-soft": accentSoftSurface,
    "--tapit-focus": colors.accent,
  };
}

function readableTextOn(hex: string): string {
  const channels = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  return luminance > 0.179 ? "#17211f" : "#ffffff";
}

function identityColorForTheme(color: string, theme: ProfileTheme): string {
  return theme === "night" && color.toLowerCase() !== "#ffffff"
    ? `color-mix(in srgb, ${color} 35%, white)`
    : color;
}

async function convertWebPToPng(image: Blob): Promise<Blob> {
  const objectUrl = URL.createObjectURL(image);
  try {
    const decodedImage = new Image();
    decodedImage.src = objectUrl;
    await decodedImage.decode();

    const width = decodedImage.naturalWidth;
    const height = decodedImage.naturalHeight;
    if (!width || !height || width * height > MAX_VCARD_PHOTO_PIXELS) {
      throw new Error("The profile photo dimensions are not supported in a contact file.");
    }

    const cropSize = Math.min(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 384;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot convert the profile photo.");
    context.drawImage(
      decodedImage,
      (width - cropSize) / 2,
      (height - cropSize) / 2,
      cropSize,
      cropSize,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) =>
          png
            ? resolve(png)
            : reject(new Error("The profile photo could not be converted to PNG.")),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadVCardPhoto(imageUrl?: string): Promise<VCardPhoto | undefined> {
  if (!imageUrl) return undefined;
  const response = await fetch(imageUrl, { credentials: "omit" });
  if (!response.ok) throw new Error("The profile photo could not be downloaded.");

  let image = await response.blob();
  if (image.size > MAX_VCARD_PHOTO_BYTES) {
    throw new Error("The profile photo is too large to include in a contact file.");
  }
  let type = image.type.split(";")[0]?.trim().toLowerCase();
  if (type === "image/webp") {
    image = await convertWebPToPng(image);
    type = "image/png";
  }
  if (image.size > MAX_VCARD_PHOTO_BYTES) {
    throw new Error("The profile photo is too large to include in a contact file.");
  }
  if (type !== "image/jpeg" && type !== "image/png") {
    throw new Error("The profile photo format is not supported in a contact file.");
  }

  const bytes = new Uint8Array(await image.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return { type: type === "image/png" ? "PNG" : "JPEG", base64: window.btoa(binary) };
}

const linkIcons = {
  link: LinkSimple,
  mail: EnvelopeSimple,
  phone: Phone,
  calendar: CalendarDots,
  linkedin: LinkedinLogo,
  instagram: InstagramLogo,
  globe: Globe,
  briefcase: Briefcase,
  images: Images,
  palette: Palette,
  code: Code,
  camera: Camera,
  github: GithubLogo,
} as const;

export function PublicProfile({
  profile,
  profileUrl,
  profileId,
  preview = false,
  mobileLayout = false,
  fitPhonePreviewContent = false,
  theme: themeOverride,
  trackClicks = true,
  trackView = true,
  onLinkClick,
  onView,
}: {
  profile: PublicProfileProjection;
  profileUrl?: string;
  profileId?: string;
  preview?: boolean;
  mobileLayout?: boolean;
  fitPhonePreviewContent?: boolean;
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
  const selectedTheme = themeOverride ?? profile.theme;
  const customization = normalizeProfileCustomization(profile.customization, selectedTheme);
  const appearance = resolveProfileAppearance(customization, selectedTheme);
  const warmStudio = appearance.mode === "warm-studio";
  const customTheme = appearance.mode === "custom";
  const configured = appearance.mode !== "legacy";
  const accentOverride =
    configured && !warmStudio
      ? appearance.accent === "coral"
        ? "#a84431"
        : appearance.accent === "ink" && !customTheme
          ? "#2c2420"
          : appearance.accent === "jade" && customTheme
            ? "#3e806d"
            : undefined
      : undefined;
  const activeAccent =
    accentOverride ??
    (customTheme
      ? (appearance.customColors?.accent ?? DEFAULT_CUSTOM_PROFILE_COLORS.accent)
      : selectedTheme === "moss"
        ? "#176b57"
        : selectedTheme === "night"
          ? "#7bc2a9"
          : "#3f6de8");
  const media = profile.media;
  const background = media?.background;
  const phonePreview = preview || mobileLayout;
  const compactPhonePreview = phonePreview && fitPhonePreviewContent;
  const wideProfile = !phonePreview;
  const centerIdentity = phonePreview;
  const theme = selectedTheme === "custom" && !customTheme ? "paper" : selectedTheme;
  void profileUrl;
  const automaticContactActions = getAutomaticContactActions(profile);
  const canSaveContact = Boolean(
    profile.name &&
    (automaticContactActions.length > 0 || profile.imageUrl || profile.links.length),
  );
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const featuredLink = getFeaturedProfileLink(profile.links, customization?.featuredLinkId);
  const links = profile.links.filter((link) => link.id !== featuredLink?.id);
  const section = customization?.section;
  const themeClasses = {
    paper: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "border-tapit-line bg-tapit-surface",
      link: "border-tapit-line bg-transparent hover:border-tapit-accent hover:bg-tapit-accent-soft",
      muted: "text-tapit-muted",
    },
    moss: {
      page: "bg-[#e8f1eb] text-[#17352b]",
      panel: "border-[#b9d1c0] bg-[#f7fbf8]",
      link: "border-[#b9d1c0] bg-transparent hover:border-[#176b57] hover:bg-[#dcece2]",
      muted: "text-[#4f6d5c]",
    },
    night: {
      page: "bg-[#17211f] text-[#f2f6f1]",
      panel: "border-[#40534d] bg-[#22302b]",
      link: "border-[#40534d] bg-transparent hover:border-[#7bc2a9] hover:bg-[#2d4239]",
      muted: "text-[#b7c9c0]",
    },
    custom: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "border-tapit-line bg-tapit-surface",
      link: "border-tapit-accent bg-transparent text-tapit-accent hover:bg-tapit-accent-soft",
      muted: "text-tapit-muted",
    },
  }[theme];
  const previewPageClasses = {
    paper: "bg-transparent text-tapit-ink",
    moss: "bg-transparent text-[#17352b]",
    night: "bg-transparent text-[#f2f6f1]",
    custom: "bg-transparent text-tapit-ink",
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
  const linkClasses = warmStudio ? warmAccent.outlined : themeClasses.link;
  const typeScaleClasses =
    configured && appearance.typeScale === "compact"
      ? phonePreview
        ? compactPhonePreview
          ? "text-lg"
          : "text-2xl"
        : "text-2xl sm:text-3xl"
      : configured && appearance.typeScale === "editorial"
        ? phonePreview
          ? compactPhonePreview
            ? "text-2xl"
            : "text-4xl"
          : "text-4xl sm:text-5xl"
        : configured
          ? phonePreview
            ? compactPhonePreview
              ? "text-xl"
              : "text-3xl"
            : "text-3xl sm:text-4xl"
          : phonePreview
            ? "text-2xl"
            : "text-3xl sm:text-4xl";
  const profileLinkMargin = phonePreview
    ? warmStudio
      ? compactPhonePreview
        ? "mt-3"
        : "mt-6"
      : compactPhonePreview
        ? "mt-5"
        : "mt-9"
    : preview
      ? warmStudio
        ? "mt-4"
        : "mt-6"
      : warmStudio
        ? "mt-6"
        : "mt-9";
  const profileLinkGap = phonePreview
    ? compactPhonePreview
      ? "gap-2"
      : "gap-3"
    : !preview
      ? "gap-3"
      : "gap-2";
  async function saveContact() {
    if (savingContact) return;
    setSavingContact(true);
    setContactError("");
    const email = automaticContactActions.find((action) => action.kind === "email");
    const phone = automaticContactActions.find((action) => action.kind === "phone");
    try {
      const photo = await loadVCardPhoto(profile.imageUrl);
      const vCard = buildVCard({
        name: profile.name,
        email: email?.href.replace(/^mailto:/, ""),
        phone: phone?.href.replace(/^tel:/, ""),
        links: profile.links.map(({ label, destination }) => ({ label, destination })),
        photo,
      });
      const blob = new Blob([vCard], { type: "text/vcard;charset=utf-8" });
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${profile.slug}.vcf`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    } catch {
      setContactError(
        "We couldn't include the profile photo. Check your connection and try again.",
      );
    } finally {
      setSavingContact(false);
    }
  }
  function renderLink(link: PublicProfileProjection["links"][number], featured = false) {
    const iconKey =
      link.icon !== undefined && Object.prototype.hasOwnProperty.call(linkIcons, link.icon)
        ? (link.icon as keyof typeof linkIcons)
        : "link";
    const LinkIcon = linkIcons[iconKey];
    const arrowClasses = warmStudio
      ? `${warmAccent.arrow} text-current/80`
      : `group-hover:text-tapit-accent ${mutedClasses}`;
    return (
      <li key={link.id}>
        <a
          className={`group flex items-center justify-between rounded-full border font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px hover:shadow-sm active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${featured ? `${compactPhonePreview ? "min-h-12 px-4 py-3" : "min-h-16 px-5 py-4"}` : compactPhonePreview ? "min-h-11 px-3.5 py-2 text-xs" : phonePreview ? "min-h-14 px-5 py-4 text-sm" : preview ? "min-h-12 px-3.5 py-3 text-sm" : "min-h-14 px-5 py-4 text-sm"} ${linkClasses}`}
          data-featured={featured ? "true" : undefined}
          data-icon={iconKey}
          href={link.destination}
          onClick={() => {
            if (trackClicks) onLinkClick?.(link.id, profileId);
          }}
          rel="noreferrer"
          target="_blank"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <LinkIcon
              aria-hidden="true"
              size={compactPhonePreview ? 16 : phonePreview || !preview ? 20 : 18}
            />
            <span className="break-words text-left">{link.label}</span>
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className={`transition motion-reduce:transition-none ${arrowClasses}`}
            size={compactPhonePreview ? 15 : phonePreview || !preview ? 19 : 17}
          />
        </a>
      </li>
    );
  }
  const disclosure = section ? (
    <ProfileSectionDisclosure section={section} className={`border-current/15 ${mutedClasses}`} />
  ) : null;
  const whiteIdentityText = "box-decoration-clone rounded-md bg-[#26312c] px-2 py-1 shadow-sm";
  const whiteName = warmStudio && appearance.nameColor.toLowerCase() === "#ffffff";
  const whiteBio = warmStudio && appearance.bioColor.toLowerCase() === "#ffffff";
  const nameIdentityText = whiteName ? whiteIdentityText : undefined;
  const bioIdentityText = whiteBio ? whiteIdentityText : undefined;
  const identity = (
    <div
      className={`flex min-w-0 flex-col ${centerIdentity ? "items-center text-center" : "items-center text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left"}`}
    >
      {profile.imageUrl ? (
        <img
          alt={`${profile.name} profile`}
          className={`${compactPhonePreview ? "size-16 border-[3px] border-white shadow-[0_3px_12px_rgba(16,33,28,0.18)]" : phonePreview ? "size-20" : "size-20 sm:size-24"} rounded-full object-cover`}
          height={96}
          src={profile.imageUrl}
          srcSet={profile.imageSrcSet}
          sizes={
            profile.imageSrcSet
              ? compactPhonePreview
                ? "64px"
                : phonePreview
                  ? "80px"
                  : "(min-width: 640px) 96px, 80px"
              : undefined
          }
          width={96}
        />
      ) : (
        <div
          aria-hidden="true"
          className={`${compactPhonePreview ? "size-16 text-2xl" : phonePreview ? "size-20 text-3xl" : "size-20 text-3xl sm:size-24"} grid place-items-center rounded-full font-semibold ${warmStudio ? warmAccent.avatar : "bg-tapit-accent-soft text-tapit-accent"}`}
        >
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div
        className={`min-w-0 max-w-full ${compactPhonePreview ? "mt-3" : phonePreview ? "mt-5" : preview ? "mt-4" : "mt-5 sm:mt-0"}`}
      >
        {preview ? (
          <h2
            className={`${typeScaleClasses} max-w-full break-words font-semibold leading-tight tracking-tight`}
            style={
              warmStudio || customization?.identityColors?.name
                ? { color: identityColorForTheme(appearance.nameColor, selectedTheme) }
                : undefined
            }
          >
            <span className={nameIdentityText}>{profile.name}</span>
          </h2>
        ) : (
          <h1
            className={`${typeScaleClasses} max-w-full break-words font-semibold leading-tight tracking-tight`}
            style={
              warmStudio || customization?.identityColors?.name
                ? { color: identityColorForTheme(appearance.nameColor, selectedTheme) }
                : undefined
            }
          >
            <span className={nameIdentityText}>{profile.name}</span>
          </h1>
        )}
        {profile.bio ? (
          <p
            className={`${compactPhonePreview ? "mt-1 max-w-sm text-xs leading-4" : phonePreview ? "mt-2 max-w-sm text-base leading-7" : preview ? "mt-1 max-w-xs text-sm leading-6" : "mt-2 max-w-sm text-base leading-7"} whitespace-pre-line break-words ${mutedClasses}`}
          >
            <span
              className={bioIdentityText}
              style={
                warmStudio || customization?.identityColors?.bio
                  ? { color: identityColorForTheme(appearance.bioColor, selectedTheme) }
                  : undefined
              }
            >
              {profile.bio}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
  const profileContent = (
    <>
      <ProfileContactStrip
        display={customization?.contactDisplay ?? "labels"}
        email={profile.email}
        phone={profile.phone}
        website={profile.website}
        className={`${compactPhonePreview ? "mt-4 justify-center" : phonePreview ? "mt-7 justify-center" : preview ? "mt-5 justify-start" : "mt-7 justify-center sm:justify-start"} ${mutedClasses}`}
      />
      {featuredLink ? (
        <ul
          className={`tapit-profile-stagger ${compactPhonePreview ? "mt-4" : phonePreview ? "mt-6" : preview ? "mt-4" : "mt-6"} grid gap-3`}
          aria-label="Featured profile link"
        >
          {renderLink(featuredLink, true)}
        </ul>
      ) : null}
      {section && customization?.contentOrder === "section-first" ? (
        <div
          className={`${compactPhonePreview ? "mt-4" : phonePreview ? "mt-6" : preview ? "mt-4" : "mt-6"}`}
        >
          {disclosure}
        </div>
      ) : null}
      <ul
        className={`tapit-profile-stagger ${profileLinkMargin} ${profileLinkGap} grid`}
        aria-label="Profile links"
      >
        {links.map((link) => renderLink(link))}
      </ul>
      {section && customization?.contentOrder !== "section-first" ? (
        <div className={compactPhonePreview ? "mt-4" : "mt-6"}>{disclosure}</div>
      ) : null}
      {canSaveContact ? (
        <button
          className={`${compactPhonePreview ? "mt-4 min-h-11 px-4 py-2 text-xs scroll-mb-24" : phonePreview ? "mt-5 min-h-14 px-5 py-4 text-sm" : preview ? "mt-4 min-h-12 px-4 py-3 text-sm" : "mt-5 min-h-14 px-5 py-4 text-sm"} inline-flex w-full items-center justify-center gap-2 rounded-full border font-semibold transition motion-reduce:transition-none motion-reduce:transform-none hover:-translate-y-px hover:shadow-md active:translate-y-px ${warmStudio ? (appearance.linkTreatment === "outlined" ? warmAccent.outlined : warmAccent.solid) : (configured && appearance.linkTreatment === "outlined") || (!configured && customTheme) ? "border-tapit-accent bg-transparent text-tapit-accent hover:bg-tapit-accent-soft" : "border-transparent bg-tapit-accent text-white hover:bg-tapit-accent-strong"}`}
          style={
            configured && !warmStudio && appearance.linkTreatment === "filled"
              ? { color: readableTextOn(activeAccent) }
              : undefined
          }
          onClick={saveContact}
          disabled={savingContact}
          type="button"
        >
          <DownloadSimple aria-hidden="true" size={compactPhonePreview ? 16 : 19} />
          {savingContact ? "Preparing contact..." : "Save contact"}
        </button>
      ) : null}
      {contactError ? (
        <p className="mt-3 text-center text-sm text-tapit-danger" role="alert">
          {contactError}
        </p>
      ) : null}
      {preview ? (
        <p
          className={`mt-auto pt-5 ${compactPhonePreview ? "text-[0.55rem]" : "text-xs"} text-center font-semibold tracking-[0.16em] uppercase ${mutedClasses}`}
        >
          Powered by Tapit
        </p>
      ) : null}
    </>
  );
  const profileFrameClasses = compactPhonePreview
    ? "rounded-none border-0 shadow-none"
    : !warmStudio
      ? "overflow-hidden rounded-tapit border shadow-[0_20px_60px_rgba(21,25,24,0.12)]"
      : phonePreview
        ? "overflow-hidden rounded-none border-0 shadow-none"
        : preview
          ? "overflow-hidden rounded-tapit border shadow-[0_20px_60px_rgba(21,25,24,0.12)]"
          : "overflow-hidden rounded-none border-0 shadow-none sm:rounded-tapit sm:border sm:shadow-[0_20px_60px_rgba(21,25,24,0.12)]";
  const identityColumnSpacing = phonePreview
    ? compactPhonePreview
      ? "grid content-start gap-3 px-3 py-4"
      : "grid content-start gap-4 px-4 py-6"
    : preview
      ? "grid content-start gap-4 px-4 py-5 sm:px-6 sm:py-7"
      : `grid ${background || media?.slideshow.length ? "content-start" : "content-start lg:content-center"} gap-5 px-5 py-8 sm:px-10 sm:py-10 lg:px-8 lg:py-8`;
  const contentColumnSpacing = phonePreview
    ? compactPhonePreview
      ? "px-3 pb-4"
      : preview
        ? "px-4 pb-2"
        : "px-4 pb-6"
    : preview
      ? "px-4 pb-5 sm:px-6 sm:pb-7"
      : "px-5 pb-8 sm:px-10 lg:px-8 lg:py-8";
  const profileGrid = wideProfile
    ? preview
      ? "min-[480px]:grid min-[480px]:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
      : "lg:grid lg:grid-cols-[minmax(18rem,0.84fr)_minmax(0,1.16fr)]"
    : "";
  const identityColumn = background ? (
    <div className="min-w-0">
      <ProfileMediaSurface
        background={background}
        heroHeight={media?.heroHeight ?? 320}
        treatment="warm"
        compact={phonePreview}
        fullSurface
        responsivePortrait={phonePreview}
        className="rounded-none border-0"
      >
        {identity}
      </ProfileMediaSurface>
      {media && media.slideshow.length > 0 ? (
        <div className="mt-5 px-4 sm:px-6">
          <ProfileSlideshow autoplay={media.autoplay ?? true} images={media.slideshow} />
        </div>
      ) : null}
    </div>
  ) : (
    <div className={`${identityColumnSpacing} min-w-0`}>
      {media && media.slideshow.length > 0 ? (
        <ProfileSlideshow autoplay={media.autoplay ?? true} images={media.slideshow} />
      ) : null}
      {identity}
    </div>
  );
  const pageFrameClasses = warmStudio
    ? "min-h-[100dvh] px-0 py-0 sm:px-5 sm:py-12"
    : "min-h-[100dvh] px-4 py-8 sm:px-6 sm:py-12";
  const profileContentMaxWidth = preview ? "max-w-none" : wideProfile ? "max-w-6xl" : "max-w-md";
  const Container = preview ? "div" : "main";
  return (
    <Container
      style={{
        ...(customTheme
          ? customProfileThemeStyles(appearance.customColors ?? DEFAULT_CUSTOM_PROFILE_COLORS)
          : theme === "paper" || theme === "custom"
            ? {}
            : profileThemeStyles[theme]),
        ...(accentOverride
          ? {
              "--tapit-accent": accentOverride,
              "--tapit-accent-strong": accentOverride,
              "--tapit-focus": accentOverride,
            }
          : {}),
      }}
      className={`tapit-profile-entry ${preview ? "h-full p-0" : pageFrameClasses} ${preview ? (warmStudio ? "bg-transparent text-[#2c2420]" : previewPageClasses) : pageClasses}`}
    >
      <div
        className={`mx-auto flex w-full ${profileContentMaxWidth} flex-col justify-between ${preview ? "h-full" : "min-h-[calc(100dvh-4rem)]"}`}
      >
        <section
          className={`${profileFrameClasses} ${profileGrid} ${panelClasses} ${warmStudio ? "" : "text-tapit-ink"} ${preview ? "flex min-h-full flex-1 flex-col" : ""}`}
        >
          {identityColumn}
          <div
            className={`min-w-0 ${preview ? "flex flex-1 flex-col" : ""} ${compactPhonePreview ? "" : "border-t border-current/10"} ${contentColumnSpacing} ${wideProfile ? `lg:border-t-0 lg:border-l ${preview ? "min-[480px]:border-t-0 min-[480px]:border-l" : ""}` : ""}`}
          >
            {profileContent}
          </div>
        </section>
        {!preview ? (
          <footer
            className={`py-8 text-center text-xs font-semibold tracking-[0.18em] uppercase ${warmStudio ? mutedClasses : "text-tapit-muted"}`}
          >
            Tapit
          </footer>
        ) : null}
      </div>
    </Container>
  );
}
