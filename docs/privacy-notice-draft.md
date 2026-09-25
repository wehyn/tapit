# Tapit privacy notice — draft for review

**Status:** The operator approved the draft direction. The public `/privacy` page is prepared locally but has not been published; this working document preserves the review history and remaining deployment checks.

**Proposed publication date:** 25 September 2026, subject to approval.

Tapit helps people share a digital contact profile through a web link, QR code, or NFC card. This notice explains what information Tapit handles when you sign in, manage a profile, or visit a published profile.

## Who operates Tapit

Wayne Garcia operates Tapit from the Philippines. For privacy questions or requests, contact [wayneegarcia@gmail.com](mailto:wayneegarcia@gmail.com). This is also Tapit's general support address. [Confirm whether a postal or other business contact address is required before publication.]

## Information we handle

- **Account and sign-in information.** When you sign in with Google, Tapit receives the basic account information needed to identify your Google account, including your Google account identifier, email address, name, and profile image when Google provides it. Tapit uses this information to authenticate you and connect you to a Tapit account. Tapit does not ask for access to your Gmail, Google Drive, or contacts.
- **Profile and card information.** You can enter a name, bio, photo or logo, website, email address, phone number, and links. Tapit also stores the profile URL and the status and assignment of NFC or QR cards. A profile's published fields and enabled links are available to anyone with its public URL; drafts and unpublished fields are not intended to be public.
- **Usage information.** When a visitor opens a published profile or follows a profile link, Tapit records aggregate daily view and link-click counts, the profile or link involved, and whether the visit came from NFC, QR, or a direct link when known. The prepared visitor choice allows a random `sessionStorage` key for unique-view estimates only after opt-in; the choice is remembered in browser `localStorage`. The backend stores an allowed key with the profile identifier and removes it after 90 days once deployed. Page-view and link-click counts continue without a key.
- **Operational records.** Tapit keeps account, invitation, deletion-request, upload, and administrator audit records needed to run and protect the service. Hosting and authentication providers may also process technical request and security logs under their own terms.

## Why we use this information

Tapit uses account and Google sign-in data to authenticate users, enforce access to customer and administrator features, and respond to support or security issues. It uses profile and card information to publish the content the profile owner chooses and make NFC or QR links work. It uses usage counts to show profile owners and administrators how published profiles and links are used and to operate the service. [Confirm and state the applicable basis under Philippine privacy law for each purpose, including visitor analytics, before publication.]

## Who can see or process it

Anyone with a published profile URL can view that profile's published fields and enabled links, and may save the contact details offered by the profile. The profile owner can manage their own content and view their own analytics. Authorized Tapit administrators can manage customer accounts, profiles, cards, and service records. Google handles the sign-in interaction; Convex provides authentication, database, and file storage services; Vercel hosts the web application. [Confirm provider entities, processing locations, cross-border transfers, and any other subprocessors before publication.] Tapit does not sell personal information. [Confirm whether any other sharing or marketing uses exist.]

## Your choices and requests

Profile owners choose which optional details and links to add and publish, and can unpublish a profile. Customers can request account deletion through their account page or by emailing [wayneegarcia@gmail.com](mailto:wayneegarcia@gmail.com). A request hides the public profile and deactivates its cards while an administrator reviews it. Administrator approval is required before account data is erased. The prepared cleanup erases approved requests promptly; unapproved requests older than 30 days are flagged for administrator review and remain pending until a decision. This cleanup is not deployed yet. To request access, correction, objection, erasure or blocking, or portability where applicable, email the same address. You may also [file a complaint with the Philippine National Privacy Commission](https://privacy.gov.ph/file-a-complaint-2/). [Confirm request handling and timing before publication.] A visitor can avoid sharing optional information by not using a profile's links or Save contact action; [add a precise choice or consent mechanism for analytics session storage if required].

## Retention and security

**Current Production implementation:** account and profile records, aggregate analytics, and analytics session keys do not have automatic expiry. An approved account deletion unpublishes the profile and removes its profile images, but other personal records and Google Auth records remain. Retention and approved-account erasure code has been prepared locally but has not been deployed. Provider backups and technical logs follow provider-managed lifecycles that have not yet been verified. [Do not publish a fixed retention promise until deployment, verification, and provider lifecycles are checked.] Tapit limits account and administrator access according to role and uses its service providers' security controls. No online service can guarantee absolute security; contact [wayneegarcia@gmail.com](mailto:wayneegarcia@gmail.com) if you suspect misuse.

## Changes and contact

Tapit may update this notice when its practices change. The published notice will show an updated date, and [describe how material changes will be communicated]. Contact Wayne Garcia at [wayneegarcia@gmail.com](mailto:wayneegarcia@gmail.com) with privacy questions or requests. You may also [contact the Philippine National Privacy Commission](https://privacy.gov.ph/contactus/) or [file a complaint](https://privacy.gov.ph/file-a-complaint-2/).

## Proposed retention schedule for operator review

These periods are **proposals, not current behavior or publication-ready promises**. They require code and operational controls, and should be checked against applicable Philippine law and provider terms.

| Data | Proposed rule |
| --- | --- |
| Active account and published profile | Keep while the account is active and needed to provide Tapit. |
| Analytics session keys | Remove within 90 days of the visit. |
| Daily aggregate analytics | Remove after 13 months, or earlier on account erasure unless a lawful exception applies. |
| Invites and expired claim challenges | Remove within 30 days after expiry or use, unless a security investigation requires longer. |
| Deletion request and personal profile data | Hide public content immediately on request. Require administrator approval before erasure; aim to review and erase approved requests within 30 days. Flag pending requests older than 30 days for administrator action. Do not promise automatic erasure without approval. |
| Minimal security and administrator audit records | Keep for one year, then remove or de-identify, unless an investigation or legal duty requires longer. |
| Backups and provider logs | Record and disclose the actual provider lifecycle before publication; exclude restored deleted data from active service. |

## Decisions required before publication

1. Confirm whether Wayne Garcia's postal or business address must appear. The operator, Philippine launch jurisdiction, and privacy email are supplied by the operator.
2. Verify Google profile fields actually retained by Convex Auth. Implement an expiry for the analytics key generated with `crypto.randomUUID()` and stored in browser `sessionStorage`.
3. The operator approved the proposed periods and administrator approval before erasure. Verify the prepared deletion and retention controls for Auth identities, backups, analytics sessions, images, and audit records; deploy before claiming these periods as current behavior.
4. The prepared visitor flow requires opt-in for the unique-view session key; confirm its final wording and lawful basis for the remaining aggregate counts under Philippine law.
5. Confirm subprocessors, processing locations, transfers, and hosting log practices.
6. Review the final text, add a public `/privacy` page and homepage link, and make the Google OAuth privacy-policy URL match it.

**Review basis:** Tapit's current schema and analytics implementation; [Google's OAuth verification requirements](https://support.google.com/cloud/answer/13464321) for a linked, accurate privacy notice; and, if the Philippines is the launch jurisdiction, the [National Privacy Commission's implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/). These are review references, not claims that this draft is legally complete.
