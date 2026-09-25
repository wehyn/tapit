"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LinkSimple, UserPlus } from "@phosphor-icons/react";
import { PublicBrand, PublicHeader } from "@/components/layout/PublicHeader";

function ProfileCard() {
  return (
    <figure className="relative h-full w-full">
      <Image
        alt="Photographed Tapit profile card for Taylor Kim resting on pale stone."
        className="object-contain drop-shadow-[0_28px_24px_rgba(21,25,24,0.16)]"
        fill
        priority
        sizes="(min-width: 1280px) 31rem, (min-width: 1024px) 26rem, 24rem"
        src="/images/tapit-profile-card-cutout-v3.png"
      />
      <figcaption className="sr-only">
        A physical white Tapit profile card with Taylor Kim&apos;s portrait, profile links, and a
        Save contact button, photographed on a pale stone surface.
      </figcaption>
    </figure>
  );
}

function FeatureSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <section className="border-t border-tapit-line py-24 sm:py-32" id={id}>
      <div className="mx-auto grid w-full max-w-[95rem] gap-12 px-[clamp(1.25rem,5vw,5.25rem)] lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-24">
        <div className="max-w-lg">
          <h2 className="text-4xl font-normal tracking-[-0.055em] text-tapit-ink sm:text-6xl">
            {title}
          </h2>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <main className="bg-tapit-paper text-tapit-ink">
      <PublicHeader />
      <section className="relative -mt-16 min-h-[100dvh] overflow-hidden sm:-mt-[4.5rem]">
        <Image
          alt=""
          aria-hidden="true"
          className="object-cover object-center"
          fill
          priority
          sizes="100vw"
          src="/images/tapit-hero-atmosphere.png"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-tapit-paper/95 via-tapit-paper/65 to-transparent lg:via-tapit-paper/35"
        />
        <div className="relative z-20 mx-auto flex min-h-[100dvh] w-full max-w-[95rem] flex-col px-[clamp(1.25rem,5vw,5.25rem)] xl:max-w-none xl:pr-[6vw]">
          <div className="grid flex-1 items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] lg:gap-8 lg:py-20">
            <div className="max-w-2xl lg:-translate-y-8 xl:translate-y-4">
              <h1 className="max-w-[40rem] text-[clamp(3.5rem,5.6vw,6rem)] leading-[0.93] font-normal tracking-[-0.075em] text-balance">
                <span className="block">Share one profile.</span>
                <span className="block">Update it anytime.</span>
              </h1>
              <p className="mt-8 max-w-xl text-lg leading-8 text-tapit-muted sm:text-xl sm:leading-9">
                Your links, contact details, and more in one tap.
                <br className="hidden sm:block" /> Simple, elegant, always up to date.
              </p>
            </div>

            <div className="relative hidden h-[min(38rem,calc(100dvh-17rem))] w-auto origin-center aspect-[859/1299] justify-self-end lg:flex lg:-translate-x-[1vw] lg:-translate-y-8 lg:rotate-[-1deg] xl:-translate-x-[4vw] xl:-translate-y-6">
              <ProfileCard />
            </div>
          </div>
        </div>
      </section>

      <FeatureSection id="product" title="One place for the things people need next.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.5rem] bg-tapit-ink p-7 text-tapit-paper sm:p-9">
            <LinkSimple aria-hidden="true" className="text-tapit-accent-soft" size={28} />
            <h3 className="mt-20 text-2xl font-medium tracking-tight">Links that stay useful.</h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-tapit-paper/65">
              Put your work, socials, and best contact path behind one clear destination.
            </p>
          </div>
          <div className="mt-8 rounded-[1.5rem] border border-tapit-line bg-tapit-surface p-7 sm:p-9">
            <UserPlus aria-hidden="true" className="text-tapit-accent" size={28} />
            <h3 className="mt-20 text-2xl font-medium tracking-tight">A better first hello.</h3>
            <p className="mt-3 max-w-xs text-sm leading-6 text-tapit-muted">
              Make it simple for someone to save your details and remember what comes next.
            </p>
          </div>
        </div>
      </FeatureSection>

      <FeatureSection id="how-it-works" title="Share once. Stay current.">
        <ol className="grid gap-0 border-t border-tapit-line">
          {[
            ["01", "Create your profile", "Add the details you want people to find."],
            [
              "02",
              "Add what comes next",
              "Arrange links, contact paths, and a clear call to action.",
            ],
            ["03", "Share it anywhere", "Use one profile URL, QR code, or Tapit card."],
          ].map(([number, title, description]) => (
            <li
              className="grid gap-4 border-b border-tapit-line py-6 sm:grid-cols-[5rem_1fr] sm:gap-8"
              key={number}
            >
              <span className="text-sm font-semibold tracking-[0.2em] text-tapit-accent">
                {number}
              </span>
              <div>
                <h3 className="text-xl font-medium tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-tapit-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </FeatureSection>

      <section
        className="border-t border-tapit-line bg-tapit-soft-surface py-24 sm:py-32"
        id="teams"
      >
        <div className="mx-auto w-full max-w-[95rem] px-[clamp(1.25rem,5vw,5.25rem)]">
          <h2 className="mx-auto max-w-3xl text-center text-5xl font-normal tracking-[-0.06em] sm:text-7xl">
            Everyone gets one clear way to be found.
          </h2>
        </div>
      </section>

      <footer className="border-t border-tapit-line">
        <div className="mx-auto flex w-full max-w-[95rem] flex-wrap items-center justify-between gap-4 px-[clamp(1.25rem,5vw,5.25rem)] py-6 text-xs text-tapit-muted">
          <PublicBrand />
          <div className="flex items-center gap-6">
            <span>Built for quick, human introductions.</span>
            <Link className="font-medium text-tapit-ink" href="/app/profile">
              Open workspace
            </Link>
            <Link className="font-medium text-tapit-ink" href="/privacy">
              Privacy
            </Link>
            <Link className="font-medium text-tapit-ink" href="/terms">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
