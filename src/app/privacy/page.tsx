import type { Metadata } from "next";
import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Tapit handles account, profile, and visitor information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-tapit-paper text-tapit-ink">
      <PublicHeader />
      <article className="mx-auto my-6 w-[calc(100%-2rem)] max-w-3xl rounded-tapit border border-tapit-line bg-tapit-surface px-5 pb-10 pt-8 text-base leading-7 shadow-[0_16px_44px_rgba(27,36,51,0.055)] sm:my-12 sm:px-10 sm:py-12 sm:leading-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-tapit-accent">
          Privacy
        </p>
        <h1 className="tapit-display mt-5 text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Tapit privacy notice
        </h1>
        <p className="mt-5 text-sm text-tapit-muted">Effective 25 September 2026</p>
        <p className="mt-10 text-tapit-muted">
          Tapit lets people share a digital contact profile through a web link, QR code, or NFC
          card. This notice explains what happens to information when you sign in, manage a profile,
          or visit a published profile.
        </p>

        <section className="mt-14 border-t border-tapit-line pt-6" aria-labelledby="operator">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="operator">
            Who operates Tapit
          </h2>
          <p className="mt-4 text-tapit-muted">
            Wayne Garcia operates Tapit from the Philippines. For privacy questions or requests,
            email{" "}
            <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
              wayneegarcia@gmail.com
            </a>
            .
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="information">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="information">
            Information Tapit handles
          </h2>
          <ul className="mt-4 list-disc space-y-3 pl-6 text-tapit-muted">
            <li>
              <strong className="text-tapit-ink">Google sign-in:</strong> your Google account
              identifier, email address, name, profile image when provided, and sign-in records.
              Tapit uses these to authenticate you and connect you to a Tapit account. Tapit does
              not request access to Gmail, Drive, or contacts.
            </li>
            <li>
              <strong className="text-tapit-ink">Profile and card:</strong> the name, bio, image,
              contact details, and links you enter, plus profile URLs and card status. Published
              fields and enabled links are visible to anyone with the public profile URL.
            </li>
            <li>
              <strong className="text-tapit-ink">Usage:</strong> daily profile-view and link-click
              counts and the source of a visit when known. With your permission, Tapit stores a
              random key in browser session storage and associates it with the profile to estimate
              unique views. The key is not your name or email. Your analytics choice is saved in
              browser local storage so you can change it later.
            </li>
            <li>
              <strong className="text-tapit-ink">Operations:</strong> invitations, deletion
              requests, uploads, and administrator audit records needed to run and protect the
              service. Hosting and sign-in providers may also process technical request and security
              logs.
            </li>
          </ul>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="purpose">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="purpose">
            Why Tapit uses it
          </h2>
          <p className="mt-4 text-tapit-muted">
            Sign-in and account information enable the service you request and protect access to
            customer and administrator features. Profile and card information makes the content you
            choose to publish available through your link, QR code, or NFC card. Limited usage
            counts help profile owners understand visits and help us operate the service. We do not
            sell personal information or use Google sign-in information for advertising.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="sharing">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="sharing">
            Who can access it
          </h2>
          <p className="mt-4 text-tapit-muted">
            Anyone with a published profile URL can view its published fields and enabled links.
            Profile owners can manage their own content and see their analytics. Authorized Tapit
            administrators can manage accounts, profiles, cards, and service records. Google handles
            sign-in; Convex provides authentication, database, and file storage; and Vercel hosts
            the website. These providers may process information outside the Philippines to deliver
            their services.
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="retention">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="retention">
            How long information is kept
          </h2>
          <ul className="mt-4 list-disc space-y-3 pl-6 text-tapit-muted">
            <li>Active account and profile information is kept while needed to provide Tapit.</li>
            <li>
              Analytics session keys are removed after 90 days, and daily aggregate analytics after
              13 months.
            </li>
            <li>
              Expired or used invitations and card-claim challenges are removed after 30 days.
            </li>
            <li>
              Minimal service and administrator audit records are removed after one year, unless a
              legal duty or active investigation requires a longer period.
            </li>
            <li>
              Provider-managed backups and technical logs may follow separate lifecycles.
              Information removed from the active service may remain in those copies until their
              retention period ends.
            </li>
          </ul>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="choices">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="choices">
            Your choices and requests
          </h2>
          <p className="mt-4 text-tapit-muted">
            You choose which optional details and links to publish and can unpublish your profile.
            Customers can request account deletion in the account page or by emailing us. A request
            hides the public profile and deactivates its cards while an administrator reviews it.
            Administrator approval is required before erasure. We aim to review and complete
            approved erasure within 30 days of a request; requests still pending at day 30 are
            flagged for administrator action. A legal duty or active investigation may require us to
            retain limited information longer, and we will explain that when applicable.
          </p>
          <p className="mt-4 text-tapit-muted">
            On a public profile, choose whether to allow a browser session key for unique-view
            analytics. Choosing “Count visits only” leaves the key unset. You can reopen Analytics
            choices on the profile to change your decision. Page-view and link-click counts continue
            without the key.
          </p>
          <p className="mt-4 text-tapit-muted">
            To request access, correction, objection, erasure or blocking, or portability where
            applicable, email{" "}
            <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
              wayneegarcia@gmail.com
            </a>
            . You may also{" "}
            <a
              className="text-tapit-ink underline"
              href="https://privacy.gov.ph/file-a-complaint-2/"
            >
              file a complaint with the Philippine National Privacy Commission
            </a>
            .
          </p>
        </section>

        <section className="mt-12 border-t border-tapit-line pt-6" aria-labelledby="changes">
          <h2 className="tapit-display text-2xl font-medium tracking-tight" id="changes">
            Changes to this notice
          </h2>
          <p className="mt-4 text-tapit-muted">
            We will update the effective date here when this notice changes. For material changes
            affecting account holders, we will also provide notice in the service or by email before
            the new practice takes effect. Contact{" "}
            <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
              wayneegarcia@gmail.com
            </a>{" "}
            with questions.
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
