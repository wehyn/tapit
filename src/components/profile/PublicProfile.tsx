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
import { useEffect, useRef, useState } from "react";

import type { PublicProfileProjection } from "@/lib/domain";
import { buildVCard, resolveProfileUrl } from "@/lib/vcard";
import type { VCardPhoto } from "@/lib/vcard";
import type { ProfileTheme } from "@/lib/demo/fixtures";

const MAX_VCARD_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_VCARD_PHOTO_PIXELS = 16_000_000;

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
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");
  useEffect(() => {
    if (trackView && !tracked.current) {
      tracked.current = true;
      onView?.(profileId);
    }
  }, [onView, profileId, trackView]);
  const canSaveContact = Boolean(
    profile.name &&
    (profile.email || profile.phone || profile.website || profile.imageUrl || profile.links.length),
  );
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
  async function saveContact() {
    if (savingContact) return;
    setSavingContact(true);
    setContactError("");
    try {
      const photo = await loadVCardPhoto(profile.imageUrl);
      const vCard = buildVCard({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
        profileUrl: resolveProfileUrl(profileUrl, window.location.origin),
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
              disabled={savingContact}
              type="button"
            >
              <DownloadSimple aria-hidden="true" size={19} />
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
