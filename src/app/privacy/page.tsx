import type { Metadata } from "next";

import { LegalFrame } from "@/components/legal/LegalFrame";

const sections = [
  { id: "operator", title: "Who operates Tapit" },
  { id: "information", title: "Information Tapit handles" },
  { id: "purpose", title: "Why Tapit uses it" },
  { id: "sharing", title: "Who can access it" },
  { id: "retention", title: "How long information is kept" },
  { id: "choices", title: "Your choices and requests" },
  { id: "changes", title: "Changes to this notice" },
];

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How Tapit handles account, profile, and visitor information.",
};

export default function PrivacyPage() {
  return (
    <LegalFrame
      active="privacy"
      effective="Effective 18 October 2026"
      sections={sections}
      title="Tapit privacy notice"
    >
      <p className="text-tapit-muted">
        Tapit lets people share a digital contact profile through a web link, QR code, or NFC card.
        This notice explains what happens to information when you sign in, manage a profile, or
        visit a published profile.
      </p>

      <section className="flex flex-col gap-4" aria-labelledby="operator">
        <h2 className="text-lg font-semibold" id="operator">
          Who operates Tapit
        </h2>
        <p className="text-tapit-muted">
          Wayne Garcia operates Tapit from the Philippines. For privacy questions or requests, email{" "}
          <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
            wayneegarcia@gmail.com
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="information">
        <h2 className="text-lg font-semibold" id="information">
          Information Tapit handles
        </h2>
        <ul className="list-disc space-y-3 pl-6 text-tapit-muted">
          <li>
            <strong className="text-tapit-ink">Google sign-in:</strong> your Google account
            identifier, email address, name, profile image when provided, and sign-in records. Tapit
            uses these to authenticate you and connect you to a Tapit account. Tapit does not
            request access to Gmail, Drive, or contacts.
          </li>
          <li>
            <strong className="text-tapit-ink">Profile and card:</strong> the name, bio, image,
            contact details, and links you enter, plus profile URLs and card status. Published
            fields and enabled links are visible to anyone with the public profile URL.
          </li>
          <li>
            <strong className="text-tapit-ink">Usage:</strong> daily profile-view and link-click
            counts and the source of a visit when known. Tapit automatically creates a random key in
            browser session storage when available and sends it with each public profile view. Tapit
            associates the key with the viewed profile to estimate unique views. The key is not your
            name or email. If session storage is unavailable, Tapit still records profile views and
            link clicks. Views without a key do not contribute to unique-view estimates. Public
            events are recorded only when a strong deployment key is configured. For abuse
            prevention, the backend uses a keyed HMAC of the network address to limit repeated
            requests. It does not store the raw address; this pseudonymous value is not anonymous or
            included in owner analytics. If address metadata is unavailable, requests share a
            fallback limit. The current Production deployment does not automatically remove these
            hashes. The proposed 24-hour cleanup is not active until retention controls are deployed
            and verified.
          </li>
          <li>
            <strong className="text-tapit-ink">Operations:</strong> invitations, deletion requests,
            uploads, and administrator audit records needed to run and protect the service. Hosting
            and sign-in providers may also process technical request and security logs.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="purpose">
        <h2 className="text-lg font-semibold" id="purpose">
          Why Tapit uses it
        </h2>
        <p className="text-tapit-muted">
          Sign-in and account information enable the service you request and protect access to
          customer and administrator features. Profile and card information makes the content you
          choose to publish available through your link, QR code, or NFC card. Limited usage counts
          help profile owners understand visits and help us operate the service. We do not sell
          personal information or use Google sign-in information for advertising.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="sharing">
        <h2 className="text-lg font-semibold" id="sharing">
          Who can access it
        </h2>
        <p className="text-tapit-muted">
          Anyone with a published profile URL can view its published fields and enabled links.
          Profile owners can manage their own content and see their analytics. Authorized Tapit
          administrators can manage accounts, profiles, cards, and service records. Google handles
          sign-in; Convex provides authentication, database, and file storage; and Vercel hosts the
          website. These providers may process information outside the Philippines to deliver their
          services.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="retention">
        <h2 className="text-lg font-semibold" id="retention">
          How long information is kept
        </h2>
        <ul className="list-disc space-y-3 pl-6 text-tapit-muted">
          <li>Active account and profile information is kept while needed to provide Tapit.</li>
          <li>
            Analytics session keys and daily aggregate analytics currently have no automatic expiry.
            The proposed 90-day and 13-month retention periods are not active until the cleanup
            controls are deployed and verified.
          </li>
          <li>
            Network hashes used for abuse prevention currently have no automatic expiry. The
            proposed 24-hour cleanup is not active until retention controls are deployed and
            verified.
          </li>
          <li>
            Expired or used invitations and card-claim challenges currently have no automatic
            expiry. The proposed 30-day cleanup is not active until retention controls are deployed
            and verified.
          </li>
          <li>
            Minimal service and administrator audit records currently have no automatic expiry. The
            proposed one-year cleanup is not active until retention controls are deployed and
            verified.
          </li>
          <li>
            Provider-managed backups and technical logs may follow separate lifecycles. Information
            removed from the active service may remain in those copies until their retention period
            ends.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="choices">
        <h2 className="text-lg font-semibold" id="choices">
          Your choices and requests
        </h2>
        <p className="text-tapit-muted">
          You choose which optional details and links to publish and can unpublish your profile.
          Customers can request account deletion in the account page or by emailing us. A request
          hides the public profile and deactivates its cards while an administrator reviews it.
          Administrator approval is required before erasure. The current Production service does not
          automatically erase all related personal and Google Auth records after approval. Approved
          requests unpublish the profile and remove its images, but other records remain. The
          prepared erasure and retention workflow has not been deployed, so we cannot promise a
          fixed completion time. A legal duty or active investigation may require us to retain
          limited information, and we will explain that when applicable.
        </p>
        <p className="text-tapit-muted">
          To request access, correction, objection, erasure or blocking, or portability where
          applicable, email{" "}
          <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
            wayneegarcia@gmail.com
          </a>
          . You may also{" "}
          <a className="text-tapit-ink underline" href="https://privacy.gov.ph/file-a-complaint-2/">
            file a complaint with the Philippine National Privacy Commission
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="changes">
        <h2 className="text-lg font-semibold" id="changes">
          Changes to this notice
        </h2>
        <p className="text-tapit-muted">
          We will update the effective date here when this notice changes. For material changes
          affecting account holders, we will also provide notice in the service or by email before
          the new practice takes effect. Contact{" "}
          <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
            wayneegarcia@gmail.com
          </a>{" "}
          with questions.
        </p>
      </section>
    </LegalFrame>
  );
}
