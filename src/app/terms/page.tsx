import type { Metadata } from "next";
import Link from "next/link";

import { LegalFrame } from "@/components/legal/LegalFrame";

const sections = [
  { id: "service", title: "The service" },
  { id: "account", title: "Your account and content" },
  { id: "use", title: "Acceptable use" },
  { id: "availability", title: "Availability" },
  { id: "privacy", title: "Privacy and changes" },
];

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using Tapit profiles and account features.",
};

export default function TermsPage() {
  return (
    <LegalFrame
      active="terms"
      effective="Effective 25 September 2026"
      sections={sections}
      title="Tapit terms of use"
    >
      <p className="text-tapit-muted">
        These terms apply to Tapit, operated by Wayne Garcia from the Philippines. By creating an
        account or using a Tapit profile or card, you agree to these terms. If you have a question,
        email{" "}
        <a className="text-tapit-ink underline" href="mailto:wayneegarcia@gmail.com">
          wayneegarcia@gmail.com
        </a>
        .
      </p>

      <section className="flex flex-col gap-4" aria-labelledby="service">
        <h2 className="text-lg font-semibold" id="service">
          The service
        </h2>
        <p className="text-tapit-muted">
          Tapit lets account holders create and share a digital contact profile using a web link, QR
          code, or NFC card. A published profile is public to anyone with its link. Features may
          change as the service develops; we will give reasonable notice of material changes
          affecting account holders.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="account">
        <h2 className="text-lg font-semibold" id="account">
          Your account and content
        </h2>
        <p className="text-tapit-muted">
          Keep your sign-in account secure and provide information you have the right to share. You
          remain responsible for your profile content and the destinations of your links. You grant
          Tapit permission to store and display the content you choose to publish solely to provide
          the service. You can unpublish your profile and request account deletion.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="use">
        <h2 className="text-lg font-semibold" id="use">
          Acceptable use
        </h2>
        <p className="text-tapit-muted">
          Do not use Tapit to impersonate another person, violate their rights, publish unlawful
          content, distribute malware, or interfere with the service or other users. We may restrict
          content or access when reasonably necessary to address misuse, security, or a legal
          requirement. Contact us if you think we made a mistake.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="availability">
        <h2 className="text-lg font-semibold" id="availability">
          Availability
        </h2>
        <p className="text-tapit-muted">
          We work to keep Tapit available and secure, but online services can be interrupted. We do
          not promise uninterrupted availability. These terms do not limit rights that applicable
          law does not allow us to limit.
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="privacy">
        <h2 className="text-lg font-semibold" id="privacy">
          Privacy and changes
        </h2>
        <p className="text-tapit-muted">
          Our{" "}
          <Link className="text-tapit-ink underline" href="/privacy">
            privacy notice
          </Link>{" "}
          explains how information is handled. We may update these terms and will post the new
          effective date. We will give account holders reasonable notice of material changes before
          they take effect.
        </p>
      </section>
    </LegalFrame>
  );
}
