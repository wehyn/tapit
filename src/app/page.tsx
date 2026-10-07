import Image from "next/image";
import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BrowsersIcon,
  ContactlessPaymentIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  GlobeIcon,
  InstagramLogoIcon,
  QrCodeIcon,
  ShareNetworkIcon,
  UserPlusIcon,
} from "@phosphor-icons/react/dist/ssr";

import { PublicBrand, PublicHeader } from "@/components/layout/PublicHeader";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const faqs = [
  {
    question: "What happens when someone taps my Tapit card?",
    answer:
      "Their phone opens your Tapit profile in a browser. They can explore the links and contact options you choose to share.",
  },
  {
    question: "Does the person I meet need an app?",
    answer:
      "No. Your profile opens on the web, so recipients can view it without installing an app or creating an account.",
  },
  {
    question: "What if their phone cannot read NFC?",
    answer:
      "A QR code is the fallback. People can scan it with their phone camera to open the same profile.",
  },
  {
    question: "Can I update my profile after I make my card?",
    answer:
      "Yes. Update the links and contact details on your profile whenever they change. The profile address stays the same, so the card does not need to be re-encoded.",
  },
  {
    question: "How do people save my details?",
    answer:
      "When your profile has supported contact information, visitors can use Save contact to download a contact card to their device.",
  },
  {
    question: "Can I order a physical Tapit card today?",
    answer:
      "Custom card ordering is coming soon. You can explore the Canva templates or upload your design on the card-design page in the meantime.",
  },
];

const productFacts = [
  { Icon: ContactlessPaymentIcon, title: "NFC tap", detail: "Share with a tap" },
  { Icon: QrCodeIcon, title: "QR fallback", detail: "Scan to open" },
  { Icon: BrowsersIcon, title: "No app required", detail: "Opens in a browser" },
  { Icon: ShareNetworkIcon, title: "Update details anytime", detail: "Keep your profile current" },
];

function SectionIntro({
  eyebrow,
  title,
  children,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
      <p className="tapit-eyebrow">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-[-0.05em] text-tapit-ink sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 max-w-xl text-base leading-7 text-tapit-muted sm:text-lg sm:leading-8">
          {children}
        </p>
      ) : null}
    </div>
  );
}

function ProductCardVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-[34rem] items-center justify-center py-8 sm:py-12 lg:py-0">
      <div
        aria-hidden="true"
        className="tapit-ambient absolute left-1/2 top-1/2 size-[17rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,#a9ddc6_0%,#dff2e9_42%,transparent_72%)] blur-xl sm:size-[27rem]"
      />
      <div
        aria-label="Tapit profile on an iPhone"
        className="relative z-10 aspect-[9/19.5] w-[10rem] drop-shadow-[0_30px_40px_rgba(27,36,51,0.22)] sm:w-[14.35rem] lg:w-[16.15rem]"
        role="group"
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
          className="absolute inset-0 rounded-[2.45rem] border border-[#7b8881] bg-[linear-gradient(105deg,#738078_0%,#202a25_5%,#111915_13%,#18211d_88%,#738078_100%)] p-[0.34rem] shadow-[0_28px_56px_rgba(27,36,51,0.28)] sm:rounded-[3.45rem] sm:p-[0.48rem]"
          data-testid="tapit-iphone-hardware"
        >
          <div
            className="relative h-full overflow-hidden rounded-[2.12rem] bg-[#fffdfa] ring-1 ring-black/10 sm:rounded-[2.97rem]"
            data-testid="tapit-hero-phone-screen"
          >
            <div className="absolute inset-x-0 top-0 h-[29%] overflow-hidden">
              <Image
                alt=""
                aria-hidden="true"
                className="object-cover object-center"
                fill
                priority
                sizes="(min-width: 1024px) 260px, (min-width: 640px) 230px, 160px"
                src="/images/tapit-hero-atmosphere.png"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-[#0c1512]/20 via-transparent to-[#0c1512]/35"
              />
            </div>
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 z-20 h-[3.1rem] bg-gradient-to-b from-black/10 to-transparent sm:h-[3.6rem]"
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
              <span className="absolute left-1/2 top-[0.62rem] h-[0.72rem] w-[3.2rem] -translate-x-1/2 rounded-full bg-[#080b0a] shadow-[0_1px_3px_rgba(0,0,0,0.35)] sm:top-[0.82rem] sm:h-[0.9rem] sm:w-[4rem]">
                <span className="absolute right-[0.38rem] top-1/2 size-[0.28rem] -translate-y-1/2 rounded-full bg-[#1d3440] ring-1 ring-[#17231f] sm:right-[0.5rem] sm:size-[0.34rem]" />
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 top-[24%] flex flex-col items-center px-2 pb-2 sm:top-[25%] sm:px-3 sm:pb-3">
              <Image
                alt=""
                className="-mt-[1.55rem] size-[2.75rem] shrink-0 rounded-full border-[3px] border-white object-cover shadow-[0_3px_12px_rgba(27,36,51,0.18)] sm:-mt-[2rem] sm:size-[3.8rem] sm:border-4"
                height={96}
                loading="eager"
                src="/images/tapit-demo-mara-avatar.png"
                width={96}
              />
              <p className="mt-1 text-center text-[0.72rem] leading-tight font-semibold tracking-[-0.035em] text-tapit-ink sm:mt-1.5 sm:text-[1.12rem]">
                Mara Velasquez
              </p>
              <p className="mt-0.5 line-clamp-1 text-center text-[0.42rem] leading-tight text-tapit-muted sm:mt-1 sm:text-[0.68rem]">
                Brand systems for independent teams.
              </p>
              <div className="mt-auto grid w-full gap-1.5 sm:mt-4 sm:gap-2">
                <div className="flex h-[1.65rem] items-center justify-between rounded-[0.72rem] border border-tapit-line/90 bg-white px-2.5 text-[0.53rem] font-semibold text-tapit-ink shadow-[0_2px_7px_rgba(27,36,51,0.04)] sm:h-10 sm:rounded-[0.95rem] sm:px-3.5 sm:text-[0.78rem]">
                  <span className="flex items-center gap-1.5">
                    <ShareNetworkIcon aria-hidden="true" className="text-tapit-accent" size={13} />
                    LinkedIn
                  </span>
                  <ArrowUpRightIcon aria-hidden="true" className="text-tapit-muted" size={13} />
                </div>
                <div className="flex h-[1.65rem] items-center justify-between rounded-[0.72rem] border border-tapit-line/90 bg-white px-2.5 text-[0.53rem] font-semibold text-tapit-ink shadow-[0_2px_7px_rgba(27,36,51,0.04)] sm:h-10 sm:rounded-[0.95rem] sm:px-3.5 sm:text-[0.78rem]">
                  <span className="flex items-center gap-1.5">
                    <GlobeIcon aria-hidden="true" className="text-tapit-accent" size={13} />
                    Portfolio
                  </span>
                  <ArrowUpRightIcon aria-hidden="true" className="text-tapit-muted" size={13} />
                </div>
                <div className="flex h-[1.65rem] items-center justify-between rounded-[0.72rem] border border-tapit-line/90 bg-white px-2.5 text-[0.53rem] font-semibold text-tapit-ink shadow-[0_2px_7px_rgba(27,36,51,0.04)] sm:h-10 sm:rounded-[0.95rem] sm:px-3.5 sm:text-[0.78rem]">
                  <span className="flex items-center gap-1.5">
                    <EnvelopeSimpleIcon
                      aria-hidden="true"
                      className="text-tapit-accent"
                      size={13}
                    />
                    Email
                  </span>
                  <ArrowUpRightIcon aria-hidden="true" className="text-tapit-muted" size={13} />
                </div>
                <div className="flex h-[1.65rem] items-center justify-between rounded-[0.72rem] border border-tapit-line/90 bg-white px-2.5 text-[0.53rem] font-semibold text-tapit-ink shadow-[0_2px_7px_rgba(27,36,51,0.04)] sm:h-10 sm:rounded-[0.95rem] sm:px-3.5 sm:text-[0.78rem]">
                  <span className="flex items-center gap-1.5">
                    <ContactlessPaymentIcon
                      aria-hidden="true"
                      className="text-tapit-accent"
                      size={13}
                    />
                    Book a conversation
                  </span>
                  <ArrowUpRightIcon aria-hidden="true" className="text-tapit-muted" size={13} />
                </div>
                <div className="flex h-[1.75rem] items-center justify-center gap-1.5 rounded-[0.72rem] bg-tapit-accent text-[0.53rem] font-semibold text-white shadow-[0_4px_10px_rgba(49,95,228,0.18)] sm:mt-0.5 sm:h-10 sm:rounded-[0.95rem] sm:text-[0.78rem]">
                  <DownloadSimpleIcon aria-hidden="true" size={13} />
                  Save contact
                </div>
              </div>
              <p className="mt-1.5 text-center text-[0.36rem] font-semibold tracking-[0.17em] text-tapit-muted uppercase sm:mt-2 sm:text-[0.52rem]">
                Powered by Tapit
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute left-0 top-10 z-20 hidden -translate-x-8 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[0.65rem] font-semibold tracking-[0.1em] text-tapit-muted uppercase shadow-[0_8px_24px_rgba(27,36,51,0.08)] backdrop-blur xl:block xl:left-0 xl:top-16">
        Illustrative example
      </div>
      <div className="absolute bottom-8 left-0 z-20 hidden -translate-x-28 items-center gap-3 rounded-2xl border border-white/75 bg-white/90 px-4 py-3 shadow-[0_12px_36px_rgba(27,36,51,0.11)] backdrop-blur xl:bottom-16 xl:left-2 xl:flex">
        <span className="grid size-10 place-items-center rounded-full bg-tapit-accent-soft text-tapit-accent">
          <ContactlessPaymentIcon aria-hidden="true" size={21} weight="bold" />
        </span>
        <span>
          <span className="block text-xs font-semibold text-tapit-muted">One card</span>
          <span className="block text-sm font-semibold text-tapit-ink">Many ways to connect</span>
        </span>
      </div>
      <div className="absolute right-0 top-14 z-20 rounded-full border border-tapit-line/75 bg-white/90 px-3.5 py-2 text-xs font-semibold text-tapit-accent shadow-[0_8px_28px_rgba(27,36,51,0.08)] backdrop-blur sm:right-1 sm:top-24">
        NFC + QR
      </div>
    </div>
  );
}

function ProfilePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[31rem] px-3 pb-6 pt-8 sm:px-8 sm:pb-10 sm:pt-10">
      <div
        aria-hidden="true"
        className="absolute inset-8 rounded-[3rem] bg-[linear-gradient(140deg,#dcefe5,#e9f4f0_45%,#d5e8df)] blur-2xl"
      />
      <div className="relative mx-auto w-[min(100%,19rem)] rounded-[2.5rem] border border-white/80 bg-[#10211c] p-2.5 shadow-[0_28px_80px_rgba(27,36,51,0.19)]">
        <div className="overflow-hidden rounded-[2rem] bg-white px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
          <div aria-hidden="true" className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[#dce7e1]" />
          <p className="mb-4 text-center text-[0.62rem] font-semibold tracking-[0.16em] text-tapit-muted uppercase">
            Illustrative profile
          </p>
          <div className="flex flex-col items-center text-center">
            <Image
              alt=""
              className="size-[4.5rem] rounded-full border-4 border-white object-cover shadow-md"
              height={72}
              loading="eager"
              src="/images/tapit-demo-mara-avatar.png"
              width={72}
            />
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-tapit-ink">
              Mara Velasquez
            </h3>
            <p className="mt-1 text-xs leading-5 text-tapit-muted">Independent creative studio</p>
          </div>
          <div className="mt-5 grid gap-2.5">
            <div className="flex min-h-11 items-center justify-between rounded-xl bg-tapit-accent px-3.5 text-sm font-semibold text-white">
              <span>Explore my work</span>
              <ArrowUpRightIcon aria-hidden="true" size={17} />
            </div>
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-tapit-line px-3.5 text-sm font-medium text-tapit-ink">
              <GlobeIcon aria-hidden="true" className="text-tapit-accent" size={17} />
              Portfolio
            </div>
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-tapit-line px-3.5 text-sm font-medium text-tapit-ink">
              <InstagramLogoIcon aria-hidden="true" className="text-tapit-accent" size={17} />
              Instagram
            </div>
            <div className="flex min-h-11 items-center gap-3 rounded-xl border border-tapit-line px-3.5 text-sm font-medium text-tapit-ink">
              <EnvelopeSimpleIcon aria-hidden="true" className="text-tapit-accent" size={17} />
              Email
            </div>
            <div className="mt-0.5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tapit-soft-surface text-xs font-semibold text-tapit-accent-strong">
              <DownloadSimpleIcon aria-hidden="true" size={16} />
              Save contact
            </div>
          </div>
          <p className="mt-4 text-center text-[0.6rem] font-semibold tracking-[0.14em] text-tapit-muted uppercase">
            Powered by Tapit
          </p>
        </div>
      </div>
      <div className="absolute bottom-6 right-0 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-tapit-ink shadow-[0_12px_36px_rgba(27,36,51,0.1)] backdrop-blur sm:bottom-10 sm:right-1">
        <span className="size-2 rounded-full bg-[#2c9a67]" />
        Ready to share
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="overflow-x-clip bg-tapit-paper text-tapit-ink">
      <PublicHeader />

      <section className="relative isolate overflow-hidden bg-[linear-gradient(145deg,#fbfcff_0%,#f3f6fc_52%,#e8edf9_100%)]">
        <Image
          alt=""
          aria-hidden="true"
          className="pointer-events-none object-cover object-center opacity-[0.08] mix-blend-multiply"
          fill
          priority
          sizes="100vw"
          src="/images/tapit-hero-atmosphere.png"
        />
        <div
          aria-hidden="true"
          className="tapit-ambient absolute -right-24 top-[-10rem] size-[32rem] rounded-full bg-[radial-gradient(circle,#cbd8fa_0%,transparent_68%)] blur-3xl"
        />
        <div className="relative mx-auto flex w-full max-w-[95rem] flex-col items-center gap-1 px-4 pb-8 pt-8 text-center sm:px-8 sm:pb-10 sm:pt-10 lg:px-[clamp(2rem,5vw,5.25rem)] lg:py-10">
          <div className="relative z-10 mx-auto w-full max-w-4xl py-4">
            <div className="tapit-page-entry tapit-glass inline-flex min-h-9 items-center gap-2 rounded-full border border-tapit-line px-3.5 text-xs font-semibold text-tapit-accent-strong shadow-[0_4px_16px_rgba(27,36,51,0.04)] sm:text-sm">
              <span className="size-1.5 rounded-full bg-tapit-accent" />
              NFC business cards, made personal
            </div>
            <h1 className="tapit-page-entry mx-auto mt-6 max-w-[13ch] text-balance text-[clamp(2.75rem,12vw,5.5rem)] leading-[0.98] font-semibold tracking-[-0.075em] text-tapit-ink sm:mt-7 sm:text-[clamp(3.5rem,8vw,6.5rem)] lg:text-[clamp(4.2rem,6.2vw,6.25rem)]">
              A better introduction, in one tap.
            </h1>
            <p className="tapit-page-entry mx-auto mt-5 max-w-xl text-base leading-7 text-tapit-muted sm:mt-6 sm:text-lg sm:leading-8">
              Your NFC business card opens one polished profile for your socials, work, and contact
              details. Update what you share whenever life or work changes.
            </p>
            <div className="tapit-page-entry mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center sm:justify-center">
              <Link
                aria-label="Go to your profile"
                className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-tapit-accent px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(49,95,228,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-tapit-accent-strong focus-visible:outline-offset-4 active:translate-y-0 sm:px-6"
                href="/app/profile"
              >
                Go to your profile
                <ArrowRightIcon
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-1"
                  size={18}
                  weight="bold"
                />
              </Link>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold text-tapit-ink transition-colors hover:bg-white/65 hover:text-tapit-accent sm:justify-start"
                href="#how-it-works"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs leading-5 text-tapit-muted">
              Keep your profile current—your NFC card continues to open the latest version.
            </p>
          </div>
          <div className="tapit-page-entry relative z-10 w-full max-w-2xl self-center pt-4">
            <ProductCardVisual />
          </div>
        </div>
        <a
          aria-label="Scroll to product facts"
          className="absolute bottom-5 left-1/2 hidden size-10 -translate-x-1/2 items-center justify-center rounded-full border border-tapit-line/80 bg-white/65 text-tapit-accent transition hover:translate-y-1 hover:bg-white md:flex"
          href="#product-proof"
        >
          <ArrowRightIcon aria-hidden="true" className="rotate-90" size={17} />
        </a>
      </section>

      <section
        aria-label="Tapit product facts"
        className="border-y border-tapit-line bg-white"
        id="product-proof"
      >
        <div className="mx-auto grid w-full max-w-[95rem] grid-cols-2 gap-x-5 gap-y-7 px-4 py-7 sm:px-8 sm:py-8 md:grid-cols-4 lg:px-[clamp(2rem,5vw,5.25rem)]">
          {productFacts.map(({ Icon: FactIcon, title, detail }, index) => (
            <ScrollReveal className="min-w-0" delayMs={index * 65} key={title as string}>
              <div className="flex h-full items-start gap-3 sm:gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent sm:size-11">
                  <FactIcon aria-hidden="true" size={20} weight="duotone" />
                </span>
                <span>
                  <span className="block text-sm font-semibold leading-5 text-tapit-ink sm:text-base">
                    {title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-tapit-muted sm:text-sm">
                    {detail}
                  </span>
                </span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="py-20 sm:py-28 lg:py-32" id="product">
        <div className="mx-auto w-full max-w-[95rem] px-4 sm:px-8 lg:px-[clamp(2rem,5vw,5.25rem)]">
          <ScrollReveal>
            <SectionIntro
              eyebrow="Your profile, all together"
              title="Everything they need for what comes next."
            >
              Bring your social profiles, portfolio, and contact details into one simple page that
              is easy to open and easy to keep current.
            </SectionIntro>
          </ScrollReveal>
          <div className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 xl:grid-cols-4">
            <ScrollReveal className="h-full" delayMs={0}>
              <article className="group h-full min-h-56 rounded-[1.6rem] border border-tapit-line bg-white p-6 shadow-[0_12px_32px_rgba(27,36,51,0.035)] transition duration-200 hover:-translate-y-1 hover:border-tapit-accent/35 hover:shadow-[0_22px_48px_rgba(27,36,51,0.09)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent transition group-hover:scale-105">
                  <ShareNetworkIcon aria-hidden="true" size={22} weight="duotone" />
                </span>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-tapit-ink sm:text-xl">
                  Social links
                </h3>
                <p className="mt-2 text-sm leading-6 text-tapit-muted">
                  Give people one place to find the profiles you choose to share.
                </p>
              </article>
            </ScrollReveal>
            <ScrollReveal className="h-full" delayMs={75}>
              <article className="group h-full min-h-56 rounded-[1.6rem] border border-tapit-line bg-white p-6 shadow-[0_12px_32px_rgba(27,36,51,0.035)] transition duration-200 hover:-translate-y-1 hover:border-tapit-accent/35 hover:shadow-[0_22px_48px_rgba(27,36,51,0.09)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent transition group-hover:scale-105">
                  <GlobeIcon aria-hidden="true" size={22} weight="duotone" />
                </span>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-tapit-ink sm:text-xl">
                  Work and portfolio
                </h3>
                <p className="mt-2 text-sm leading-6 text-tapit-muted">
                  Point new connections toward your work, services, and current projects.
                </p>
              </article>
            </ScrollReveal>
            <ScrollReveal className="h-full" delayMs={150}>
              <article className="group h-full min-h-56 rounded-[1.6rem] border border-tapit-line bg-white p-6 shadow-[0_12px_32px_rgba(27,36,51,0.035)] transition duration-200 hover:-translate-y-1 hover:border-tapit-accent/35 hover:shadow-[0_22px_48px_rgba(27,36,51,0.09)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent transition group-hover:scale-105">
                  <EnvelopeSimpleIcon aria-hidden="true" size={22} weight="duotone" />
                </span>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-tapit-ink sm:text-xl">
                  Contact details
                </h3>
                <p className="mt-2 text-sm leading-6 text-tapit-muted">
                  Make the next conversation easy with the contact paths you want people to use.
                </p>
              </article>
            </ScrollReveal>
            <ScrollReveal className="h-full" delayMs={225}>
              <article className="group h-full min-h-56 rounded-[1.6rem] border border-tapit-line bg-white p-6 shadow-[0_12px_32px_rgba(27,36,51,0.035)] transition duration-200 hover:-translate-y-1 hover:border-tapit-accent/35 hover:shadow-[0_22px_48px_rgba(27,36,51,0.09)] sm:p-7">
                <span className="grid size-12 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent transition group-hover:scale-105">
                  <UserPlusIcon aria-hidden="true" size={22} weight="duotone" />
                </span>
                <h3 className="mt-8 text-lg font-semibold tracking-tight text-tapit-ink sm:text-xl">
                  Save contact
                </h3>
                <p className="mt-2 text-sm leading-6 text-tapit-muted">
                  Let visitors save supported contact information to their device in a tap.
                </p>
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        className="relative isolate overflow-hidden border-y border-tapit-line bg-white"
        id="showcase"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_48%,#e5f3eb_0%,transparent_48%)]"
        />
        <div className="relative mx-auto grid w-full max-w-[95rem] items-center gap-10 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-[clamp(2rem,5vw,5.25rem)] lg:py-24">
          <ScrollReveal className="order-2 lg:order-1">
            <div className="max-w-xl">
              <p className="tapit-eyebrow">A card with more room</p>
              <h2 className="mt-4 text-balance text-3xl leading-tight font-semibold tracking-[-0.05em] text-tapit-ink sm:text-4xl lg:text-5xl">
                A thoughtful first hello. A profile that keeps working.
              </h2>
              <p className="mt-5 text-base leading-7 text-tapit-muted sm:text-lg sm:leading-8">
                The card starts the introduction. Your profile gives it somewhere useful to go—with
                the links and details you want to share, ready on their phone.
              </p>
              <ul className="mt-7 grid gap-3 text-sm font-medium text-tapit-ink">
                <li className="flex items-center gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-tapit-accent-soft text-tapit-accent">
                    <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
                  </span>
                  A single profile for your social and contact links
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-tapit-accent-soft text-tapit-accent">
                    <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
                  </span>
                  Updates that do not require re-encoding the card
                </li>
                <li className="flex items-center gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-tapit-accent-soft text-tapit-accent">
                    <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
                  </span>
                  A QR fallback for people who prefer to scan
                </li>
              </ul>
              <Link
                className="group mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-tapit-accent transition-colors hover:text-tapit-accent-strong"
                href="/build-card"
              >
                Explore card designs
                <ArrowRightIcon
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                  size={17}
                  weight="bold"
                />
              </Link>
            </div>
          </ScrollReveal>
          <ScrollReveal className="order-1 lg:order-2" delayMs={90}>
            <div className="mx-auto grid w-full max-w-2xl items-center gap-3 sm:grid-cols-[0.72fr_1.28fr] sm:gap-0">
              <div className="relative mx-auto h-[15rem] w-[10rem] sm:-mr-12 sm:h-[23rem] sm:w-[15rem]">
                <Image
                  alt="Illustrative Tapit card design"
                  className="object-contain drop-shadow-[0_22px_26px_rgba(27,36,51,0.2)]"
                  fill
                  sizes="(min-width: 640px) 240px, 160px"
                  src="/images/tapit-profile-card-cutout-v3.png"
                />
              </div>
              <ProfilePreview />
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section className="py-20 sm:py-28 lg:py-32" id="benefits">
        <div className="mx-auto grid w-full max-w-[95rem] gap-10 px-4 sm:px-8 lg:grid-cols-[0.84fr_1.16fr] lg:items-start lg:gap-20 lg:px-[clamp(2rem,5vw,5.25rem)]">
          <ScrollReveal>
            <SectionIntro
              eyebrow="Less to keep track of"
              title="Make every introduction easier to follow up on."
            >
              A business card should start a useful connection. Tapit puts your chosen next steps
              together and gives you one profile to keep up to date.
            </SectionIntro>
          </ScrollReveal>
          <div className="grid gap-3 sm:grid-cols-2">
            <ScrollReveal className="h-full" delayMs={0}>
              <article className="h-full rounded-[1.5rem] bg-tapit-ink p-6 text-white sm:p-7">
                <p className="text-xs font-semibold tracking-[0.16em] text-[#a9ddc6] uppercase">
                  For your business
                </p>
                <h3 className="mt-8 text-xl font-semibold tracking-tight sm:text-2xl">
                  Keep your details together.
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Share the portfolio, social profiles, and contact options that fit the
                  conversation.
                </p>
              </article>
            </ScrollReveal>
            <ScrollReveal className="h-full" delayMs={85}>
              <article className="h-full rounded-[1.5rem] border border-tapit-line bg-white p-6 sm:p-7">
                <p className="text-xs font-semibold tracking-[0.16em] text-tapit-accent uppercase">
                  For your next connection
                </p>
                <h3 className="mt-8 text-xl font-semibold tracking-tight text-tapit-ink sm:text-2xl">
                  Make the next step clear.
                </h3>
                <p className="mt-3 text-sm leading-6 text-tapit-muted">
                  Give people one simple place to find your work and get in touch after you meet.
                </p>
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        className="border-y border-tapit-line bg-[#eef5f1] py-20 sm:py-28 lg:py-32"
        id="how-it-works"
      >
        <div className="mx-auto w-full max-w-[95rem] px-4 sm:px-8 lg:px-[clamp(2rem,5vw,5.25rem)]">
          <ScrollReveal>
            <SectionIntro
              centered
              eyebrow="A simple way to share"
              title="From your card to a better connection."
            >
              Set up the details you want people to find, then share one profile in person.
            </SectionIntro>
          </ScrollReveal>
          <div className="mt-10 grid gap-5 md:mt-14 md:grid-cols-3">
            {[
              {
                number: "01",
                icon: BrowsersIcon,
                title: "Shape your profile",
                description:
                  "Add a short introduction, your work, and the links you want to bring into the conversation.",
              },
              {
                number: "02",
                icon: UserPlusIcon,
                title: "Choose what to share",
                description:
                  "Arrange your social profiles and contact details. Change them whenever your priorities do.",
              },
              {
                number: "03",
                icon: ContactlessPaymentIcon,
                title: "Tap or scan to connect",
                description:
                  "Your NFC card opens the profile. A QR code gives people another easy way to get there.",
              },
            ].map(({ number, icon: StepIcon, title, description }, index) => (
              <ScrollReveal className="h-full" delayMs={index * 90} key={number}>
                <article className="h-full rounded-[1.6rem] border border-white bg-white/85 p-6 shadow-[0_12px_32px_rgba(27,36,51,0.04)] sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-tapit-accent-soft text-tapit-accent">
                      <StepIcon aria-hidden="true" size={23} weight="duotone" />
                    </span>
                    <span className="text-sm font-semibold tracking-[0.15em] text-tapit-muted">
                      {number}
                    </span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold tracking-tight text-tapit-ink sm:text-xl">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-tapit-muted">{description}</p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 lg:py-32" id="faq">
        <div className="mx-auto grid w-full max-w-[95rem] gap-10 px-4 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20 lg:px-[clamp(2rem,5vw,5.25rem)]">
          <ScrollReveal>
            <SectionIntro eyebrow="Good to know" title="A few things people ask.">
              Straight answers about sharing, profile updates, and what is available today.
            </SectionIntro>
          </ScrollReveal>
          <div className="divide-y divide-tapit-line border-y border-tapit-line">
            {faqs.map((faq, index) => (
              <ScrollReveal key={faq.question} delayMs={index * 45}>
                <details className="group py-5 sm:py-6">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold tracking-tight text-tapit-ink marker:hidden sm:text-lg [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full border border-tapit-line text-tapit-accent transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-2 pr-10 pt-1 text-sm leading-6 text-tapit-muted sm:text-base sm:leading-7">
                    {faq.answer}
                  </p>
                </details>
              </ScrollReveal>
            ))}
            <p className="py-4 text-sm leading-6 text-tapit-muted">
              Custom physical card ordering is coming soon.
            </p>
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden border-y border-tapit-line bg-tapit-ink py-16 text-white sm:py-20 lg:py-24">
        <div
          aria-hidden="true"
          className="tapit-ambient absolute -right-20 -top-40 size-[32rem] rounded-full bg-[radial-gradient(circle,#246b55_0%,transparent_68%)] blur-3xl"
        />
        <div className="relative mx-auto flex w-full max-w-[95rem] flex-col gap-8 px-4 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-[clamp(2rem,5vw,5.25rem)]">
          <ScrollReveal>
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#a9ddc6] uppercase">
                Your next introduction starts here
              </p>
              <h2 className="mt-4 text-balance text-3xl leading-tight font-semibold tracking-[-0.05em] sm:text-4xl lg:text-5xl">
                Make it easy to remember what comes next.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                Open your profile to keep your social links and contact details ready to share.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal className="shrink-0" delayMs={100}>
            <Link
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-tapit-accent transition duration-200 hover:-translate-y-0.5 hover:bg-[#e5f3eb] active:translate-y-0 sm:px-6"
              href="/app/profile"
            >
              Go to your profile
              <ArrowRightIcon
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
                size={18}
                weight="bold"
              />
            </Link>
          </ScrollReveal>
        </div>
      </section>

      <footer className="bg-white">
        <div className="mx-auto grid w-full max-w-[95rem] gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1fr_auto] md:items-start lg:px-[clamp(2rem,5vw,5.25rem)]">
          <div className="max-w-sm">
            <PublicBrand />
            <p className="mt-4 text-sm leading-6 text-tapit-muted">
              A simple way to share your work, social profiles, and contact details—in one tap.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-3">
            <div>
              <h2 className="text-xs font-semibold tracking-[0.14em] text-tapit-ink uppercase">
                Explore
              </h2>
              <div className="mt-3 grid gap-2">
                <a
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="#product"
                >
                  Product
                </a>
                <a
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="#how-it-works"
                >
                  How it works
                </a>
                <a
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="#faq"
                >
                  FAQ
                </a>
              </div>
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-[0.14em] text-tapit-ink uppercase">
                Your Tapit
              </h2>
              <div className="mt-3 grid gap-2">
                <Link
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="/build-card"
                >
                  Design a card
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="/login"
                >
                  Sign in
                </Link>
              </div>
            </div>
            <div>
              <h2 className="text-xs font-semibold tracking-[0.14em] text-tapit-ink uppercase">
                Information
              </h2>
              <div className="mt-3 grid gap-2">
                <Link
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="/privacy"
                >
                  Privacy
                </Link>
                <Link
                  className="inline-flex min-h-10 items-center text-sm text-tapit-muted transition-colors hover:text-tapit-accent"
                  href="/terms"
                >
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-tapit-line">
          <div className="mx-auto flex min-h-14 w-full max-w-[95rem] items-center px-4 text-xs text-tapit-muted sm:px-8 lg:px-[clamp(2rem,5vw,5.25rem)]">
            © Tapit. Designed for thoughtful introductions.
          </div>
        </div>
      </footer>
    </main>
  );
}
