import Image from "next/image";
import Link from "next/link";

import { PublicAccountAction } from "@/components/layout/PublicAccountAction";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";

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
    question: "Can I order a physical Tapit card today?",
    answer:
      "Custom card ordering is coming soon. You can explore the Canva templates or upload your design on the card-design page in the meantime.",
  },
];

const steps = [
  {
    icon: <Icon name="user" size={20} />,
    title: "Shape your profile",
    description:
      "Add a short introduction, your work, and the links you want to bring into the conversation.",
  },
  {
    icon: <Icon name="link" size={20} />,
    title: "Choose what to share",
    description:
      "Arrange your social profiles and contact details. Change them whenever your priorities do.",
  },
  {
    icon: <Icon name="contactless" size={20} />,
    title: "Tap or scan to connect",
    description:
      "Your NFC card opens the profile. A QR code gives people another easy way to get there.",
  },
];

const profileFeatures = [
  { title: "Save contact", description: "One tap adds you to their phone." },
  { title: "Featured link", description: "Point people to what matters now." },
  { title: "Simple analytics", description: "Views and clicks, no tracking of people." },
  { title: "Your look", description: "Presets, colour and type that fit you." },
];

const quietLinkClasses =
  "inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink";

export default function HomePage() {
  return (
    <main className="overflow-x-clip bg-tapit-paper text-tapit-ink">
      <PublicHeader />

      <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-16 px-4 pb-8 pt-8 sm:px-6 lg:px-8">
        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <p className="tapit-eyebrow">NFC cards · QR · one profile</p>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Share with a tap.
              <br />
              <span className="text-tapit-accent">Follow up with ease.</span>
            </h1>
            <p className="max-w-xl text-base text-tapit-muted sm:text-lg">
              Tapit puts your links, contact details and work on one profile. Tap your card on any
              phone and it opens in the browser. No app required.
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <PublicAccountAction placement="hero" />
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-control bg-tapit-surface px-6 text-base font-semibold text-tapit-ink shadow-card transition-colors hover:bg-tapit-soft-surface"
                href="#how-it-works"
              >
                See how it works
              </Link>
            </div>
            <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
              <Chip>
                <Icon name="check" size={16} />
                No app required
              </Chip>
              <Chip>
                <Icon name="check" size={16} />
                Opens in a browser
              </Chip>
              <Chip>
                <Icon name="check" size={16} />
                Update details anytime
              </Chip>
            </div>
          </div>

          <div className="relative flex justify-center py-6">
            <div className="absolute bottom-6 left-0 z-20 flex aspect-[16/10] w-60 -rotate-6 flex-col justify-between rounded-card bg-tapit-ink p-6 text-white shadow-card sm:bottom-12 sm:left-4">
              <Icon className="self-end text-tapit-warm" name="contactless" size={24} />
              <p className="text-sm font-semibold">Mara Velasquez</p>
            </div>
            <div
              aria-label="Tapit profile on an iPhone"
              className="relative z-10 w-72 rounded-card bg-tapit-surface p-3 shadow-card sm:w-80"
              role="group"
            >
              <div
                className="flex flex-col items-center gap-4 rounded-card bg-tapit-paper px-6 pb-6 pt-8 text-center"
                data-testid="tapit-hero-phone-screen"
              >
                <Image
                  alt=""
                  className="size-24 rounded-full object-cover"
                  height={96}
                  src="/images/tapit-demo-mara-avatar.png"
                  width={96}
                />
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-semibold tracking-tight text-tapit-ink">
                    Mara Velasquez
                  </p>
                  <p className="text-sm text-tapit-muted">Brand systems for independent teams.</p>
                </div>
                <span className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-tapit-accent text-sm font-semibold text-white">
                  Save contact
                </span>
                <ul className="flex w-full flex-col gap-2">
                  <li className="flex min-h-13 items-center gap-3 rounded-control bg-tapit-surface px-4 text-left text-sm font-semibold text-tapit-ink shadow-card">
                    <span className="grid size-9 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent">
                      <Icon name="linkedin" size={16} />
                    </span>
                    LinkedIn
                    <Icon className="ml-auto text-tapit-muted" name="caretRight" size={16} />
                  </li>
                  <li className="flex min-h-13 items-center gap-3 rounded-control bg-tapit-surface px-4 text-left text-sm font-semibold text-tapit-ink shadow-card">
                    <span className="grid size-9 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent">
                      <Icon name="globe" size={16} />
                    </span>
                    Portfolio
                    <Icon className="ml-auto text-tapit-muted" name="caretRight" size={16} />
                  </li>
                  <li className="flex min-h-13 items-center gap-3 rounded-control bg-tapit-surface px-4 text-left text-sm font-semibold text-tapit-ink shadow-card">
                    <span className="grid size-9 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent">
                      <Icon name="calendar" size={16} />
                    </span>
                    Book a conversation
                    <Icon className="ml-auto text-tapit-muted" name="caretRight" size={16} />
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-8" id="how-it-works">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="tapit-eyebrow">How it works</p>
            <h2 className="text-xl font-semibold sm:text-2xl">
              From your card to a better connection.
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                className="flex flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
                key={step.title}
              >
                <span className="grid size-10 place-items-center rounded-control bg-tapit-accent-soft text-tapit-accent">
                  {step.icon}
                </span>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-tapit-muted">Step {index + 1}</p>
                  <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="text-sm text-tapit-muted">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-8 rounded-card bg-tapit-ink p-6 text-white sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-col gap-4">
            <h2 className="text-xl font-semibold sm:text-2xl">Your profile, all together.</h2>
            <p className="text-base text-tapit-accent-soft">
              Everything they need for what comes next: contact details, your work and a way to book
              time.
            </p>
          </div>
          <ul className="grid flex-1 gap-3 sm:grid-cols-2">
            {profileFeatures.map((feature) => (
              <li
                className="flex flex-col gap-1 rounded-control bg-white/12 p-4"
                key={feature.title}
              >
                <p className="text-sm font-semibold">{feature.title}</p>
                <p className="text-xs text-tapit-accent-soft">{feature.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-12 lg:flex-row lg:gap-16" id="faq">
          <div className="flex flex-col gap-2 lg:w-80 lg:shrink-0">
            <p className="tapit-eyebrow">FAQ</p>
            <h2 className="text-xl font-semibold sm:text-2xl">A few things people ask.</h2>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {faqs.map((faq, index) => (
              <details
                className="group rounded-card bg-tapit-surface shadow-card"
                key={faq.question}
                open={index === 0}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
                  <h3 className="text-base font-semibold text-tapit-ink">{faq.question}</h3>
                  <Icon
                    className="shrink-0 text-tapit-muted group-open:hidden"
                    name="caretDown"
                    size={20}
                  />
                  <Icon
                    className="hidden shrink-0 text-tapit-muted group-open:block"
                    name="caretUp"
                    size={20}
                  />
                </summary>
                <p className="px-6 pb-4 text-sm text-tapit-muted">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-center gap-6 rounded-card bg-tapit-surface p-6 text-center shadow-card">
          <h2 className="text-xl font-semibold sm:text-2xl">
            Make every introduction easier to follow up on.
          </h2>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <PublicAccountAction placement="closing" />
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-control px-6 text-base font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink"
              href="/login"
            >
              Sign in
            </Link>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 px-2">
          <p className="text-sm text-tapit-muted">© 2026 Tapit</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-2">
            <Link className={quietLinkClasses} href="/build-card">
              Design a card
            </Link>
            <Link className={quietLinkClasses} href="/privacy">
              Privacy
            </Link>
            <Link className={quietLinkClasses} href="/terms">
              Terms
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
