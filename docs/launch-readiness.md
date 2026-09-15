# Tapit Launch Readiness

## Release target

Record each entry from the named source before marking a release gate complete:

| Entry                                  | Required source                                                  |
| -------------------------------------- | ---------------------------------------------------------------- |
| Candidate commit                       | Output of git rev-parse --short HEAD from the reviewed worktree  |
| Preview application URL                | URL shown by the selected Vercel preview deployment              |
| Preview Convex deployment reference    | Named non-production deployment accepted by scripts/live-e2e.mjs |
| Production application URL             | Approved production Vercel project domain                        |
| Production Convex deployment reference | Approved production Convex deployment name                       |
| Release owner                          | Named person who owns the go/no-go decision                      |
| Incident contact                       | Named person and escalation destination for the release window   |

## Product and policy decisions

Record the owner-approved value and an evidence link or dashboard reference for each decision:

| Decision                                            | Required record                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Production domain and public URL                    | Exact domain, DNS owner, and approved public URL                              |
| Transactional email provider and verified sender    | Provider name, sender address/domain, and verification status                 |
| Setup-link lifetime and resend policy               | Expiration duration, resend cooldown, and invalidation behavior               |
| Email verification policy                           | Which account actions require verification and how failed delivery is handled |
| Password reset policy                               | Token lifetime, generic response wording, and support escalation              |
| Public signup quota and abuse response              | Per-key quota, edge rule, response behavior, and escalation owner             |
| Support destination                                 | Public support URL or inbox and the responsible owner                         |
| Analytics disclosure and consent treatment          | User-facing disclosure, consent behavior, and retention decision              |
| Unique-view method and retention window             | Counting rule, deduplication window, and retention period                     |
| Account-deletion retention period                   | Deletion behavior, legal retention, and purge owner                           |
| Launch jurisdiction and privacy notice location     | Jurisdiction and URL/path for the applicable notice                           |
| Monitoring owner and alert destination              | Dashboard owner, alert channel, and response target                           |
| Backup frequency, restore owner, and rollback owner | Schedule, named operators, restore target, and rollback authority             |
| Final brand assets and public metadata              | Approved asset revision, title, description, and social preview values        |

Current implementation decisions that still need owner/provider evidence:

- Convex Auth verification and reset links use a provider-neutral HTTPS adapter with a one-hour link lifetime;
  the transactional provider, verified sender, retention behavior, and preview delivery result are pending. The
  preview live-E2E gate additionally requires an authenticated, non-production mail adapter that returns only
  the opaque verification token for the disposable test recipient.
- Verified email is required before self-service customer creation or invitation completion. Reset requests use
  the generic copy “If an account matches that email, reset instructions are on the way.” The public reset action
  applies the same normalized request quota before account lookup and a bounded response-time floor; provider
  sends have a matching normalized email quota.
- Public self-service creation and authentication-email issuance are limited to three attempts per normalized email
  in a 60-minute fixed window; the deployment-edge rule for `POST /api/auth` and the public slug-availability
  request surface still needs a named platform owner and recorded rule before preview certification.
- The local support destination is a placeholder; the approved preview/production support URL and escalation
  owner remain pending.

## Environment matrix

| Environment      | App mode                    | Convex target                | Data policy                          | Live E2E allowed        |
| ---------------- | --------------------------- | ---------------------------- | ------------------------------------ | ----------------------- |
| Local demo       | NEXT_PUBLIC_DEMO_MODE=true  | none                         | deterministic browser-local fixtures | no                      |
| Development live | NEXT_PUBLIC_DEMO_MODE=false | named development deployment | disposable test data                 | yes, with confirmation  |
| Preview          | NEXT_PUBLIC_DEMO_MODE=false | named preview deployment     | isolated test data                   | yes, with confirmation  |
| Production       | NEXT_PUBLIC_DEMO_MODE=false | production deployment        | real customer data                   | no                    |

## Go/no-go gates

- [ ] npm run verify passes from a worktree containing only intended files.
- [ ] npm run test:e2e:demo -- --workers=1 passes.
- [ ] Auth verification, password reset, and abuse controls pass focused tests.
- [ ] Preview deployment has NEXT_PUBLIC_DEMO_MODE=false and matching Convex URL/target.
- [ ] npm run test:e2e:live passes against preview with the complete non-production contract.
- [ ] Backup restore drill succeeds against an isolated target.
- [ ] Responsive review passes at 390px, 768px, and 1440px.
- [ ] Current iPhone and Android NFC/QR/device checks are recorded.
- [ ] Production first-admin, email, support, monitoring, and rollback procedures are verified.

## Backup and rollback runbook

Keep the release decision at no-go until each operational record below has a named owner and external
evidence reference:

1. Record the approved production RPO/RTO, restore owner, rollback owner, and the production backup/PITR
   checkpoint required immediately before the first production cutover.
2. Capture a supported Convex snapshot of the isolated preview state before a release candidate is promoted.
3. Restore that preview snapshot into a throwaway non-production deployment and verify the profile, card, publication,
   image, invitation, and audit boundaries.
4. Record the preview snapshot ID, restore target, operator, verification timestamp, and the approved rollback target.
5. If the release triggers the documented rollback criteria, pause writes when safe, revert the Vercel deployment
   to the recorded target, and restore Convex code/data only through the supported provider workflow.
6. For a production rollback, use only the recorded production checkpoint or supported production PITR target;
   never restore a preview snapshot into production or overwrite production data with preview data.
7. Record the incident decision, approver, deployment IDs, observed data-integrity checks, and final health result.

Rollback triggers include an authentication outage, public-profile or draft privacy leakage, incorrect inactive-card
behavior, or an unrecoverable data-integrity error. Never use the live E2E provisioning harness against production.

## Monitoring and incident ownership

| Signal or operation             | Owner                         | Alert destination                 | Evidence |
| ------------------------------- | ----------------------------- | --------------------------------- | -------- |
| Convex errors and insights      | Pending owner decision        | Pending alert channel             | Pending  |
| Vercel application errors       | Pending owner decision        | Pending alert channel             | Pending  |
| Auth and email delivery         | Pending owner decision        | Pending alert channel             | Pending  |
| Signup abuse and rate limiting  | Pending owner decision        | Pending alert channel             | Pending  |
| Backup and restore execution    | Pending owner decision        | Pending escalation destination    | Pending  |
| Release and incident comms      | Pending owner decision        | Pending escalation destination    | Pending  |

## Edge abuse-control record

| Request surface                                      | Required boundary                                      | Owner                 | Evidence |
| ---------------------------------------------------- | ------------------------------------------------------ | --------------------- | -------- |
| `POST /api/auth`                                     | Deployment-edge rule plus Convex Auth failed-sign-in limiter | Pending owner decision | Pending  |
| Public slug availability (`api.profiles.checkSlugAvailability`) | Deployment-edge request rule; client debounce is not sufficient | Pending owner decision | Pending  |

## Evidence index

Record command output, deployment names, timestamps, and links to external evidence without recording secrets, passwords, setup tokens, or private customer data.

## Current release decision

**NO-GO — evidence is incomplete.** The local/demo regression boundary and repository release contract are
documented, but preview deployment, production authentication/email configuration, backup restore, device
acceptance, monitoring ownership, and production smoke evidence must be recorded before approval.
