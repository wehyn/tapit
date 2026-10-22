"use client";

/* eslint-disable @next/next/no-img-element -- Profile uploads already have explicit 192px/384px variants for native srcSet selection. */
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import type { ProfileTheme } from "@/lib/demo/fixtures";
import { buildVCard } from "@/lib/vcard";
import type { VCardPhoto } from "@/lib/vcard";
import { Icon } from "@/components/ui/Icon";
import {
  CUSTOM_PROFILE_ACCENT_SOFT_SURFACE_PERCENT,
  DEFAULT_CUSTOM_PROFILE_COLORS,
  defaultProfileLayoutOrder,
  getAutomaticContactActions,
  getFeaturedProfileLink,
  normalizeProfileCustomization,
  resolveProfileAppearance,
  type ProfileLayoutBlock,
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
    "--tapit-ink": "var(--tapit-moss-ink)",
    "--tapit-muted": "var(--tapit-moss-muted)",
    "--tapit-surface": "var(--tapit-moss-surface)",
    "--tapit-paper": "var(--tapit-moss-paper)",
    "--tapit-soft-surface": "var(--tapit-moss-soft-surface)",
    "--tapit-line": "var(--tapit-moss-soft-surface)",
    "--tapit-accent": "var(--tapit-moss-accent)",
    "--tapit-accent-strong": "var(--tapit-moss-accent-strong)",
    "--tapit-accent-foreground": "var(--tapit-moss-accent-foreground)",
    "--tapit-accent-soft": "var(--tapit-moss-soft-surface)",
    "--tapit-focus": "var(--tapit-moss-accent)",
  },
  night: {
    "--tapit-ink": "var(--tapit-night-ink)",
    "--tapit-muted": "var(--tapit-night-muted)",
    "--tapit-surface": "var(--tapit-night-surface)",
    "--tapit-paper": "var(--tapit-night-paper)",
    "--tapit-soft-surface": "var(--tapit-night-soft-surface)",
    "--tapit-line": "var(--tapit-night-soft-surface)",
    "--tapit-accent": "var(--tapit-night-accent)",
    "--tapit-accent-strong": "var(--tapit-night-accent-strong)",
    "--tapit-accent-foreground": "var(--tapit-night-accent-foreground)",
    "--tapit-accent-soft": "var(--tapit-night-soft-surface)",
    "--tapit-focus": "var(--tapit-night-accent-strong)",
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
    "--tapit-accent-foreground": readableTextOn(colors.accent),
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
  return luminance > 0.179 ? "var(--tapit-night-paper)" : "white";
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
  link: "linkSimple",
  mail: "email",
  phone: "phone",
  calendar: "calendar",
  linkedin: "linkedin",
  instagram: "instagram",
  globe: "globe",
  briefcase: "briefcase",
  images: "images",
  palette: "palette",
  code: "code",
  camera: "camera",
  github: "github",
} as const;

export function PublicProfile({
  profile,
  profileUrl,
  profileId,
  showOwnerShortcut = false,
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
  showOwnerShortcut?: boolean;
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
    configured && !warmStudio && !customTheme
      ? appearance.accent === "coral"
        ? "var(--tapit-warm-studio-coral-ink)"
        : appearance.accent === "ink"
          ? "var(--tapit-warm-studio-ink)"
          : undefined
      : undefined;
  const media = profile.media;
  const background = media?.background;
  const phonePreview = preview || mobileLayout;
  const publicMobileLayout = mobileLayout && !preview;
  const compactPhonePreview = phonePreview && fitPhonePreviewContent;
  const wideProfile = !phonePreview;
  const centerIdentity = phonePreview;
  const theme = selectedTheme === "custom" && !customTheme ? "paper" : selectedTheme;
  void profileUrl;
  const automaticContactActions = getAutomaticContactActions(profile);
  const hasVCardContactAction = automaticContactActions.some(
    (action) => action.kind === "email" || action.kind === "phone" || action.kind === "website",
  );
  const canSaveContact = Boolean(
    profile.name && (hasVCardContactAction || profile.imageUrl || profile.links.length),
  );
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const featuredLink = getFeaturedProfileLink(profile.links, customization?.featuredLinkId);
  const links = profile.links.filter((link) => link.id !== featuredLink?.id);
  const section = customization?.section;
  const themeClasses = {
    paper: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "bg-tapit-surface",
      link: "bg-tapit-surface shadow-card hover:bg-tapit-soft-surface",
      muted: "text-tapit-muted",
    },
    moss: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "bg-tapit-surface",
      link: "bg-tapit-surface shadow-card hover:bg-tapit-soft-surface",
      muted: "text-tapit-muted",
    },
    night: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "bg-tapit-surface",
      link: "bg-tapit-surface shadow-card hover:bg-tapit-soft-surface",
      muted: "text-tapit-muted",
    },
    custom: {
      page: "bg-tapit-paper text-tapit-ink",
      panel: "bg-tapit-surface",
      link: "bg-transparent text-tapit-accent hover:bg-tapit-accent-soft",
      muted: "text-tapit-muted",
    },
  }[theme];
  const previewPageClasses = {
    paper: "bg-transparent text-tapit-ink",
    moss: "bg-transparent text-tapit-ink",
    night: "bg-transparent text-tapit-ink",
    custom: "bg-transparent text-tapit-ink",
  }[theme];
  const warmAccent = {
    coral: {
      solid: "bg-tapit-warm-studio-coral text-white hover:bg-tapit-warm-studio-coral-strong",
      outlined:
        "bg-transparent text-tapit-warm-studio-coral-ink hover:bg-tapit-warm-studio-coral-hover",
      soft: "bg-tapit-warm-studio-coral-soft hover:bg-tapit-warm-studio-coral-hover",
      avatar: "bg-tapit-warm-studio-coral-hover text-tapit-warm-studio-coral-ink",
      arrow: "group-hover:text-tapit-warm-studio-coral-ink",
    },
    jade: {
      solid: "bg-tapit-warm-studio-jade text-white hover:bg-tapit-warm-studio-jade-strong",
      outlined:
        "bg-transparent text-tapit-warm-studio-jade-strong hover:bg-tapit-warm-studio-jade-hover",
      soft: "bg-tapit-warm-studio-jade-soft hover:bg-tapit-warm-studio-jade-hover",
      avatar: "bg-tapit-warm-studio-jade-hover text-tapit-warm-studio-jade",
      arrow: "group-hover:text-tapit-warm-studio-jade-strong",
    },
    ink: {
      solid: "bg-tapit-warm-studio-ink text-white hover:bg-tapit-warm-studio-ink-strong",
      outlined: "bg-transparent text-tapit-warm-studio-ink hover:bg-tapit-warm-studio-ink-hover",
      soft: "bg-tapit-warm-studio-ink-soft hover:bg-tapit-warm-studio-ink-hover",
      avatar: "bg-tapit-warm-studio-ink-hover text-tapit-warm-studio-ink",
      arrow: "group-hover:text-tapit-warm-studio-ink",
    },
  }[appearance.accent];
  const pageClasses = warmStudio
    ? "bg-tapit-warm-studio-page text-tapit-warm-studio-ink"
    : themeClasses.page;
  const panelClasses = warmStudio
    ? phonePreview
      ? "bg-tapit-warm-studio-surface"
      : preview
        ? "bg-tapit-warm-studio-surface"
        : "sm:bg-tapit-warm-studio-surface"
    : themeClasses.panel;
  const mutedClasses = warmStudio ? "text-tapit-warm-studio-muted" : themeClasses.muted;
  const linkClasses =
    publicMobileLayout && !warmStudio
      ? "bg-tapit-surface text-tapit-ink hover:bg-tapit-soft-surface"
      : warmStudio
        ? warmAccent.outlined
        : themeClasses.link;
  const typeScaleClasses =
    configured && appearance.typeScale === "compact"
      ? phonePreview
        ? compactPhonePreview
          ? "text-lg"
          : "text-xl"
        : "text-xl sm:text-xl"
      : configured && appearance.typeScale === "editorial"
        ? phonePreview
          ? compactPhonePreview
            ? "text-xl"
            : "text-2xl"
          : "text-2xl sm:text-2xl"
        : configured
          ? phonePreview
            ? compactPhonePreview
              ? "text-lg"
              : "text-xl"
            : "text-xl sm:text-2xl"
          : phonePreview
            ? "text-xl"
            : "text-xl sm:text-2xl";
  const profileContentMargin = publicMobileLayout
    ? "mt-0"
    : phonePreview
      ? warmStudio
        ? compactPhonePreview
          ? "mt-3"
          : "mt-6"
        : compactPhonePreview
          ? "mt-4"
          : "mt-8"
      : preview
        ? warmStudio
          ? "mt-4"
          : "mt-6"
        : warmStudio
          ? "mt-6"
          : "mt-8";
  const profileLinkGap = phonePreview
    ? compactPhonePreview || publicMobileLayout
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
    const website = automaticContactActions.find((action) => action.kind === "website");
    let photo: VCardPhoto | undefined;
    try {
      photo = await loadVCardPhoto(profile.imageUrl);
    } catch {
      setContactError(
        "The profile photo could not be included. Your contact will still be downloaded.",
      );
    }
    try {
      const vCard = buildVCard({
        name: profile.name,
        email: email?.href.replace(/^mailto:/, ""),
        phone: phone?.href.replace(/^tel:/, ""),
        website: website?.href,
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
      setContactError("We couldn't prepare your contact file. Please try again.");
    } finally {
      setSavingContact(false);
    }
  }
  function renderLink(link: PublicProfileProjection["links"][number], featured = false) {
    const iconKey =
      link.icon !== undefined && Object.prototype.hasOwnProperty.call(linkIcons, link.icon)
        ? (link.icon as keyof typeof linkIcons)
        : "link";
    const iconName = linkIcons[iconKey];
    const arrowClasses = warmStudio
      ? `${warmAccent.arrow} text-current/80`
      : publicMobileLayout
        ? "text-current/80"
        : `group-hover:text-tapit-accent ${mutedClasses}`;
    const publicMobileLink = publicMobileLayout && !warmStudio;
    const sizeClasses = featured
      ? publicMobileLink
        ? "min-h-11 px-3 py-2 text-sm"
        : compactPhonePreview
          ? "min-h-11 px-4 py-2"
          : "min-h-11 px-4 py-2"
      : publicMobileLink
        ? "min-h-11 px-4 py-2 text-sm"
        : compactPhonePreview
          ? "min-h-11 px-4 py-2 text-xs"
          : phonePreview
            ? "min-h-11 px-4 py-2 text-sm"
            : preview
              ? "min-h-11 px-4 py-2 text-sm"
              : "min-h-11 px-4 py-2 text-sm";
    const toneClasses = publicMobileLink
      ? featured
        ? "bg-tapit-accent-soft text-tapit-accent-strong hover:bg-tapit-accent-soft"
        : customTheme
          ? "bg-transparent text-tapit-accent hover:bg-tapit-accent-soft"
          : "bg-tapit-surface text-tapit-ink shadow-card hover:bg-tapit-soft-surface"
      : linkClasses;
    return (
      <li key={link.id}>
        <a
          className={`group flex items-center justify-between rounded-control font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus ${sizeClasses} ${toneClasses}`}
          data-featured={featured ? "true" : undefined}
          data-icon={iconKey}
          href={link.destination}
          onClick={() => {
            if (trackClicks) onLinkClick?.(link.id, profileId);
          }}
          rel="noreferrer"
          target="_blank"
        >
          <span className={`flex min-w-0 items-center ${publicMobileLink ? "gap-3" : "gap-2"}`}>
            <span
              className={
                publicMobileLink && !featured
                  ? "grid size-9 shrink-0 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent-strong"
                  : ""
              }
            >
              <Icon
                aria-hidden="true"
                name={iconName}
                size={compactPhonePreview ? 16 : phonePreview || !preview ? 20 : 18}
              />
            </span>
            <span className="break-words text-left">{link.label}</span>
          </span>
          <Icon
            aria-hidden="true"
            className={`transition-colors duration-150 ${arrowClasses}`}
            name="arrowUpRight"
            size={compactPhonePreview ? 15 : phonePreview || !preview ? 19 : 17}
          />
        </a>
      </li>
    );
  }
  const disclosure = section ? (
    <ProfileSectionDisclosure section={section} className={mutedClasses} />
  ) : null;
  const saveContactAction = canSaveContact ? (
    <button
      className={`${publicMobileLayout ? "h-11 px-3" : compactPhonePreview ? "mt-4 h-11 px-4 text-xs scroll-mb-24" : "mt-4 h-11 px-4 text-sm"} inline-flex w-full items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 ${warmStudio ? (appearance.linkTreatment === "outlined" ? warmAccent.outlined : warmAccent.solid) : (configured && appearance.linkTreatment === "outlined") || (!configured && customTheme) ? "bg-transparent text-tapit-accent hover:bg-tapit-accent-soft" : "bg-tapit-accent text-tapit-accent-foreground hover:bg-tapit-accent-strong"}`}
      onClick={saveContact}
      disabled={savingContact}
      type="button"
    >
      <Icon aria-hidden="true" name="download" size={compactPhonePreview ? 16 : 19} />
      {savingContact ? "Preparing contact..." : "Save contact"}
    </button>
  ) : null;
  const whiteIdentityText =
    "box-decoration-clone rounded-control bg-tapit-warm-studio-identity px-2 py-1 shadow-card";
  const whiteName = warmStudio && appearance.nameColor.toLowerCase() === "#ffffff";
  const whiteBio = warmStudio && appearance.bioColor.toLowerCase() === "#ffffff";
  const nameIdentityText = whiteName ? whiteIdentityText : undefined;
  const bioIdentityText = whiteBio ? whiteIdentityText : undefined;
  const identity = (
    <div className="grid min-w-0 gap-1">
      <div
        className={`flex min-w-0 flex-col ${centerIdentity ? "items-center text-center" : "items-center text-center sm:flex-row sm:items-start sm:gap-6 sm:text-left"}`}
      >
        {profile.imageUrl ? (
          <img
            alt={`${profile.name} profile`}
            className={`${publicMobileLayout ? "size-[104px] ring-4 ring-tapit-paper shadow-card" : compactPhonePreview ? "size-16 ring-4 ring-white shadow-card" : phonePreview ? "size-20" : "size-20 sm:size-24"} rounded-full object-cover tapit-image-outline`}
            height={96}
            src={profile.imageUrl}
            srcSet={profile.imageSrcSet}
            sizes={
              profile.imageSrcSet
                ? compactPhonePreview
                  ? "64px"
                  : phonePreview
                    ? publicMobileLayout
                      ? "104px"
                      : "80px"
                    : "(min-width: 640px) 96px, 80px"
                : undefined
            }
            width={96}
          />
        ) : (
          <div
            aria-hidden="true"
            className={`${publicMobileLayout ? "size-[104px] text-xl ring-4 ring-tapit-paper shadow-card" : compactPhonePreview ? "size-16 text-xl" : phonePreview ? "size-20 text-xl" : "size-20 text-xl sm:size-24"} grid place-items-center rounded-full font-semibold ${warmStudio ? warmAccent.avatar : publicMobileLayout ? "bg-tapit-accent text-white" : "bg-tapit-accent-soft text-tapit-accent"}`}
          >
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div
          className={`min-w-0 max-w-full ${compactPhonePreview ? "mt-3" : publicMobileLayout ? "mt-4" : phonePreview ? "mt-4" : preview ? "mt-4" : "mt-4 sm:mt-0"}`}
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
      <ProfileContactStrip
        display={
          customization?.contactDisplay ?? (publicMobileLayout ? "icons-soft-square" : "labels")
        }
        email={profile.email}
        phone={profile.phone}
        website={profile.website}
        className={`${compactPhonePreview || publicMobileLayout ? "mt-4 justify-center" : phonePreview ? "mt-6 justify-center" : preview ? "mt-4 justify-start" : "mt-6 justify-center sm:justify-start"} ${mutedClasses}`}
      />
    </div>
  );
  const layoutOrder =
    customization?.layoutOrder ??
    defaultProfileLayoutOrder(customization?.contentOrder ?? "links-first");
  const contentBlockGap = publicMobileLayout
    ? "gap-4"
    : compactPhonePreview
      ? "gap-3"
      : phonePreview
        ? "gap-4"
        : preview
          ? "gap-4"
          : "gap-8";
  const orderedBlocks: Record<ProfileLayoutBlock, ReactNode> = {
    slideshow:
      media && media.slideshow.length > 0 ? (
        <ProfileSlideshow autoplay={media.autoplay ?? true} images={media.slideshow} />
      ) : null,
    links:
      featuredLink || links.length > 0 || (publicMobileLayout && canSaveContact) ? (
        <div
          className={`grid ${publicMobileLayout ? "gap-2" : compactPhonePreview ? "gap-3" : phonePreview ? "gap-4" : "gap-6"}`}
        >
          {publicMobileLayout && (canSaveContact || featuredLink) ? (
            <div
              className={`grid ${canSaveContact && featuredLink ? "grid-cols-2" : "grid-cols-1"} gap-2`}
            >
              {saveContactAction}
              {featuredLink ? (
                <ul className="grid min-w-0" aria-label="Featured profile link">
                  {renderLink(featuredLink, true)}
                </ul>
              ) : null}
            </div>
          ) : null}
          {!publicMobileLayout && featuredLink ? (
            <ul className="tapit-profile-stagger grid gap-3" aria-label="Featured profile link">
              {renderLink(featuredLink, true)}
            </ul>
          ) : null}
          {links.length > 0 ? (
            <ul
              className={`tapit-profile-stagger ${profileLinkGap} grid`}
              aria-label="Profile links"
            >
              {links.map((link) => renderLink(link))}
            </ul>
          ) : null}
          {publicMobileLayout && contactError ? (
            <p className="text-center text-sm text-tapit-danger" role="alert">
              {contactError}
            </p>
          ) : null}
        </div>
      ) : null,
    section: section ? disclosure : null,
  };
  const profileContent = (
    <>
      <div className={`${profileContentMargin} grid ${contentBlockGap}`}>
        {layoutOrder.map((block) => {
          const content = orderedBlocks[block];
          return content ? <div key={block}>{content}</div> : null;
        })}
      </div>
      {!publicMobileLayout ? saveContactAction : null}
      {!publicMobileLayout && contactError ? (
        <p className="mt-3 text-center text-sm text-tapit-danger" role="alert">
          {contactError}
        </p>
      ) : null}
      {preview ? (
        <p
          className={`mt-auto pt-4 text-xs text-center font-semibold tracking-[0.16em] uppercase ${mutedClasses}`}
        >
          Powered by Tapit
        </p>
      ) : null}
    </>
  );
  const profileFrameClasses =
    compactPhonePreview || publicMobileLayout
      ? "overflow-hidden rounded-none border-0 shadow-none"
      : !warmStudio
        ? "overflow-hidden rounded-card shadow-card"
        : phonePreview
          ? "overflow-hidden rounded-none border-0 shadow-none"
          : preview
            ? "overflow-hidden rounded-card shadow-card"
            : "overflow-hidden rounded-none border-0 shadow-none sm:rounded-card sm:shadow-card";
  const showEditProfileLink = showOwnerShortcut && !preview;
  const identityColumnSpacing = phonePreview
    ? compactPhonePreview
      ? "grid content-start gap-3 px-3 py-4"
      : "grid content-start gap-4 px-4 py-6"
    : preview
      ? "grid content-start gap-4 px-4 py-4 sm:p-6"
      : `grid ${background || media?.slideshow.length ? "content-start" : "content-start lg:content-center"} gap-6 p-6`;
  const contentColumnSpacing = phonePreview
    ? compactPhonePreview
      ? "px-3 pb-4"
      : preview
        ? "px-4 pb-2"
        : "px-4 pb-6"
    : preview
      ? "px-4 pb-4 sm:px-6 sm:pb-6"
      : "p-6";
  const profileGrid = wideProfile
    ? preview
      ? "min-[480px]:grid min-[480px]:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"
      : "lg:grid lg:grid-cols-[minmax(18rem,0.84fr)_minmax(0,1.16fr)]"
    : "";
  const ownerShortcut = showEditProfileLink ? (
    <nav aria-label="Profile owner actions" className="absolute right-4 top-4 z-20">
      <Link
        aria-label="Edit profile"
        className="inline-flex min-h-11 items-center gap-2 rounded-control bg-tapit-surface px-3 text-sm font-semibold text-tapit-ink shadow-card transition-colors hover:bg-tapit-soft-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
        href="/app/profile"
      >
        <Icon aria-hidden="true" name="edit" size={16} />
        Edit
      </Link>
    </nav>
  ) : null;
  const identityColumn = background ? (
    <div className="relative min-w-0">
      <ProfileMediaSurface
        background={background}
        heroHeight={media?.heroHeight ?? 320}
        treatment="warm"
        compact={phonePreview}
        fullSurface
        responsivePortrait={phonePreview}
        className="rounded-none border-0"
      >
        {ownerShortcut}
        {identity}
      </ProfileMediaSurface>
    </div>
  ) : publicMobileLayout ? (
    <div aria-label="Profile hero" className="relative min-w-0" role="region">
      <div aria-hidden="true" className="grid h-[180px] grid-cols-3 gap-1 p-1">
        <span className="rounded-control bg-tapit-accent-soft" />
        <span className="rounded-control bg-tapit-soft-surface" />
        <span className="rounded-control bg-tapit-warm/50" />
      </div>
      {ownerShortcut}
      <div className="relative z-10 -mt-12 px-4 pb-4">{identity}</div>
    </div>
  ) : (
    <div className={`${identityColumnSpacing} relative min-w-0`}>
      {ownerShortcut}
      {identity}
    </div>
  );
  const pageFrameClasses = publicMobileLayout
    ? "min-h-[100dvh] px-0 py-0"
    : warmStudio
      ? "min-h-[100dvh] px-0 py-0 sm:px-6 sm:py-12"
      : "min-h-[100dvh] px-4 py-8 sm:px-6 sm:py-12";
  const profileContentMaxWidth = preview ? "max-w-none" : wideProfile ? "max-w-6xl" : "max-w-md";
  const Container = preview ? "div" : "main";
  const activeProfileStyles: ProfileThemeCSSProperties = {
    ...(customTheme
      ? customProfileThemeStyles(appearance.customColors ?? DEFAULT_CUSTOM_PROFILE_COLORS)
      : theme === "paper" || theme === "custom"
        ? {}
        : profileThemeStyles[theme]),
    ...(accentOverride
      ? {
          "--tapit-accent": accentOverride,
          "--tapit-accent-strong": accentOverride,
          "--tapit-accent-foreground": "white",
          "--tapit-focus": accentOverride,
        }
      : {}),
  };
  return (
    <>
      <Container
        style={activeProfileStyles}
        className={`tapit-profile-entry ${preview ? "h-full p-0" : pageFrameClasses} ${preview ? (warmStudio ? "bg-transparent text-tapit-warm-studio-ink" : previewPageClasses) : pageClasses}`}
      >
        <div
          className={`mx-auto flex w-full ${profileContentMaxWidth} flex-col justify-between ${preview ? "h-full" : publicMobileLayout ? "min-h-[100dvh]" : "min-h-[calc(100dvh-4rem)]"}`}
        >
          <section
            className={`${profileFrameClasses} ${profileGrid} ${publicMobileLayout ? "bg-transparent" : panelClasses} ${warmStudio ? "" : "text-tapit-ink"} ${preview ? "flex min-h-full flex-1 flex-col" : ""}`}
          >
            {identityColumn}
            <div
              className={`min-w-0 ${preview ? "flex flex-1 flex-col" : ""} ${contentColumnSpacing}`}
            >
              {profileContent}
            </div>
          </section>
          {!preview ? (
            <footer
              className={`py-6 text-center text-xs ${warmStudio ? mutedClasses : "text-tapit-muted"}`}
            >
              <Link
                aria-label="Made with Tapit"
                className="mx-auto inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
                href="/"
              >
                <span className="grid size-5 place-items-center rounded-control bg-tapit-accent text-white">
                  <Icon aria-hidden="true" name="fingerprint" size={12} />
                </span>
                Made with Tapit
              </Link>
            </footer>
          ) : null}
        </div>
      </Container>
    </>
  );
}
