"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { ArrowRight, LinkSimple, UserPlus } from "@phosphor-icons/react";
import { isLocalDemoMode } from "@/lib/demo/mode";
import { useDemoSession } from "@/lib/demo/store";
import { api } from "../../convex/_generated/api";

const navItems = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#teams", label: "For teams" },
  { href: "#pricing", label: "Pricing" },
];

function LandingBrand() {
  return (
    <Link
      aria-label="Tapit home"
      className="inline-flex min-h-11 items-center text-[1.75rem] font-semibold tracking-[-0.06em] text-tapit-ink"
      href="/"
    >
      Tapit
    </Link>
  );
}

function AccountLink() {
  return isLocalDemoMode() ? <DemoAccountLink /> : <LiveAccountLink />;
}

function DemoAccountLink() {
  const session = useDemoSession();
  const href =
    session === null ? "/login" : session.role === "admin" ? "/admin/customers" : "/app/profile";
  const label = session === null ? "Sign in" : session.role === "admin" ? "Dashboard" : "Profile";
  return (
    <Link
      className="inline-flex min-h-11 items-center text-base font-medium text-tapit-muted transition hover:text-tapit-ink"
      href={href}
    >
      {label}
    </Link>
  );
}

function LiveAccountLink() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const signedIn = !isLoading && access?.authenticated === true;
  const href = signedIn
    ? access.role === "admin"
      ? "/admin/customers"
      : "/app/profile"
    : "/login";
  const label = signedIn ? (access.role === "admin" ? "Dashboard" : "Profile") : "Sign in";
  return (
    <Link
      className="inline-flex min-h-11 items-center text-base font-medium text-tapit-muted transition hover:text-tapit-ink"
      href={href}
    >
      {label}
    </Link>
  );
}

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
  eyebrow,
  title,
  description,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <section className="border-t border-tapit-line py-24 sm:py-32" id={id}>
      <div className="mx-auto grid w-full max-w-[95rem] gap-12 px-[clamp(1.25rem,5vw,5.25rem)] lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:gap-24">
        <div className="max-w-lg">
          <p className="text-xs font-semibold tracking-[0.24em] text-tapit-accent uppercase">
            {eyebrow}
          </p>
          <h2 className="mt-5 text-4xl font-normal tracking-[-0.055em] text-tapit-ink sm:text-6xl">
            {title}
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-tapit-muted sm:text-lg sm:leading-8">
            {description}
          </p>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const isDemoMode = isLocalDemoMode();

  return (
    <main className="overflow-hidden bg-tapit-paper text-tapit-ink">
      <section className="relative min-h-[100dvh] overflow-hidden">
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
          <header className="flex items-center border-b border-tapit-ink/10 py-5 sm:py-7">
            <LandingBrand />
            <nav
              aria-label="Primary navigation"
              className="hidden items-center gap-9 lg:ml-20 lg:flex lg:mr-auto"
            >
              {navItems.map((item) => (
                <a
                  className="inline-flex min-h-11 items-center text-base text-tapit-muted transition hover:text-tapit-ink"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 sm:gap-7">
              <AccountLink />
            </div>
          </header>

          <div className="grid flex-1 items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.18fr)_minmax(20rem,0.82fr)] lg:gap-8 lg:py-20">
            <div className="max-w-2xl lg:-translate-y-8 xl:translate-y-4">
              <p className="flex items-center gap-4 text-xs font-semibold tracking-[0.28em] text-tapit-muted uppercase">
                <span aria-hidden="true" className="h-px w-12 bg-tapit-muted/70" /> A smarter way to
                connect
              </p>
              <h1 className="mt-7 max-w-[40rem] text-[clamp(3.5rem,5.6vw,6rem)] leading-[0.93] font-normal tracking-[-0.075em] text-balance">
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

      <FeatureSection
        description="Keep your contact details, work, and next step together in a profile that is easy to share and easy to keep current."
        eyebrow="The profile"
        id="product"
        title="One place for the things people need next."
      >
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

      <FeatureSection
        description="Build once, then update your links and contact details whenever your work changes. The public profile stays stable while your story keeps moving."
        eyebrow="How it works"
        id="how-it-works"
        title="Share once. Stay current."
      >
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
        <div className="mx-auto grid w-full max-w-[95rem] gap-12 px-[clamp(1.25rem,5vw,5.25rem)] lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-24">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-tapit-accent uppercase">
              For teams
            </p>
            <h2 className="mt-5 max-w-3xl text-5xl font-normal tracking-[-0.06em] sm:text-7xl">
              Everyone gets one clear way to be found.
            </h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-tapit-muted">
            Give people a polished, updateable profile for events, introductions, and the moments in
            between.
          </p>
        </div>
      </section>

      <section className="border-t border-tapit-line py-24 sm:py-32" id="pricing">
        <div className="mx-auto flex w-full max-w-[95rem] flex-col gap-8 px-[clamp(1.25rem,5vw,5.25rem)] sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.24em] text-tapit-accent uppercase">
              Pricing
            </p>
            <h2 className="mt-5 text-5xl font-normal tracking-[-0.06em] sm:text-7xl">
              Start with a profile that feels like you.
            </h2>
          </div>
          <Link
            className="inline-flex min-h-16 min-w-[17.5rem] items-center justify-between gap-8 rounded-2xl bg-tapit-accent px-7 text-base font-semibold text-white shadow-[0_16px_36px_rgba(24,116,97,0.2)] transition hover:-translate-y-px hover:bg-tapit-accent-strong"
            href={isDemoMode ? "/mara-velasquez" : "/login?mode=signup"}
          >
            Get Started <ArrowRight aria-hidden="true" size={22} weight="bold" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-tapit-line">
        <div className="mx-auto flex w-full max-w-[95rem] flex-wrap items-center justify-between gap-4 px-[clamp(1.25rem,5vw,5.25rem)] py-6 text-xs text-tapit-muted">
          <LandingBrand />
          <div className="flex items-center gap-6">
            <span>Built for quick, human introductions.</span>
            <Link className="font-medium text-tapit-ink" href="/app/profile">
              Open workspace
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
