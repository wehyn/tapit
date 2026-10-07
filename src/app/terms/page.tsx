import type { Metadata } from "next";
import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using Tapit profiles and account features.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-tapit-paper text-tapit-ink">
      <PublicHeader />
      <article className="mx-auto my-6 w-[calc(100%-2rem)] max-w-3xl rounded-tapit border border-tapit-line bg-tapit-surface px-5 pb-10 pt-8 text-base leading-7 shadow-[0_16px_44px_rgba(27,36,51,0.055)] sm:my-12 sm:px-10 sm:py-12 sm:leading-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tapit-accent">Terms</p>
        <h1 className="tapit-display mt-5 text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Tapit terms of use
        </h1>
        <p className="mt-5 text-sm text-tapit-muted">Effective 25 September 2026</p>
        <p className="mt-10 text-tapit-muted">
          These terms apply to Tapit, operated by Wayne Garcia from the Philippines. By creating an
          account or using a Tapit profile or card, you agree to these terms. If you have a
          question, email{" "}
          <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
            wayneegarcia@gmail.com
          </a>
          .
        </p>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="service">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="service">
            The service
          </h2>
          <p className="mt-4 text-tapit-muted">
            Tapit lets account holders create and share a digital contact profile using a web link,
            QR code, or NFC card. A published profile is public to anyone with its link. Features
            may change as the service develops; we will give reasonable notice of material changes
            affecting account holders.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="account">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="account">
            Your account and content
          </h2>
          <p className="mt-4 text-tapit-muted">
            Keep your sign-in account secure and provide information you have the right to share.
            You remain responsible for your profile content and the destinations of your links. You
            grant Tapit permission to store and display the content you choose to publish solely to
            provide the service. You can unpublish your profile and request account deletion.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="use">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="use">
            Acceptable use
          </h2>
          <p className="mt-4 text-tapit-muted">
            Do not use Tapit to impersonate another person, violate their rights, publish unlawful
            content, distribute malware, or interfere with the service or other users. We may
            restrict content or access when reasonably necessary to address misuse, security, or a
            legal requirement. Contact us if you think we made a mistake.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="availability">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="availability">
            Availability
          </h2>
          <p className="mt-4 text-tapit-muted">
            We work to keep Tapit available and secure, but online services can be interrupted. We
            do not promise uninterrupted availability. These terms do not limit rights that
            applicable law does not allow us to limit.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="privacy">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="privacy">
            Privacy and changes
          </h2>
          <p className="mt-4 text-tapit-muted">
            Our{" "}
            <Link className="text-tapit-ink underline" href="/privacy">
              privacy notice
            </Link>{" "}
            explains how information is handled. We may update these terms and will post the new
            effective date. We will give account holders reasonable notice of material changes
            before they take effect.
          </p>
        </section>

        <nav className="mt-16 border-t border-tapit-line pt-6 text-sm" aria-label="Footer">
          <Link className="text-tapit-ink underline" href="/">
            Back to Tapit
          </Link>
        </nav>
      </article>
    </main>
  );
}
