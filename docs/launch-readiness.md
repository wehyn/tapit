# Tapit Launch Readiness

## Release evidence

Record the candidate commit, Preview application URL, Preview Convex deployment reference, Production application
URL, Production Convex deployment reference, release owner, and incident contact before approving a release.

## Google OAuth deployment gates

- Live development, stable Preview, and Production each use a separate Google OAuth client.
- Each client registers the exact app origin and the matching callback
  `<CONVEX_SITE_URL>/api/auth/callback/google` with provider ID `google` and scopes `openid email profile`.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, platform `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, and the deployment
  reference belong to the same environment. Set Convex `SITE_URL` to that environment's public app origin;
  Convex Auth uses it for the post-OAuth redirect, and it is distinct from `CONVEX_SITE_URL`.
- Convex Auth also needs a deployment-specific `JWT_PRIVATE_KEY` and its matching public `JWKS` to issue and
  verify sessions. Set both through provider-managed environment storage without printing or committing the key.
- `TAPIT_ADMIN_EMAILS` is configured on the deployment. Only a new verified Google identity in that allowlist
  can become the first administrator; allowlist changes do not promote existing accounts.
- Administrators create invitations and hand off links manually to the matching verified Google email. There is
  no transactional email, verification-code adapter, password reset, or email-auth gate in live environments.
- Production starts with fresh application data and a controlled first-admin sign-in. Do not copy hosted-demo or
  live E2E records into Production.

## Environment matrix

| Environment | App mode | Convex target | Authentication | Live E2E |
| --- | --- | --- | --- | --- |
| Local demo | `NEXT_PUBLIC_DEMO_MODE=true` | none or local fixtures | deterministic demo auth | no |
| Development live | `NEXT_PUBLIC_DEMO_MODE=false` | named development deployment | Google OAuth | yes, with explicit confirmation |
| Stable Preview | `NEXT_PUBLIC_DEMO_MODE=false` | named Preview deployment | Google OAuth | yes, with explicit confirmation |
| Production | `NEXT_PUBLIC_DEMO_MODE=false` | Production deployment | Google OAuth | never |

Hosted demo is a separate opt-in mode backed by isolated shared non-production data. Its password compatibility
does not change the live or Production Google-only contract.

## Go/no-go gates

- [ ] `npm run verify` passes from a worktree containing only intended files.
- [ ] `npm run test:e2e:demo` passes with the repository demo defaults.
- [ ] Auth state, ownership, invitation, role, and rate-limit tests pass.
- [ ] Admin personal profile evidence includes the local demo navigation/publication/isolation journey and
      focused Convex provisioning/repair checks. A named non-Production live target separately proves Google
      admin profile creation and retains the internal repair report; local tests alone do not satisfy this gate.
- [ ] Preview has `NEXT_PUBLIC_DEMO_MODE=false`, matching Convex URLs, a stable origin, and the correct Google
      callback/client configuration.
- [ ] The approved `npm run test:e2e:live` run passes against a dedicated development or stable Preview target,
      with three ignored Google storage states and no Production values in the contract.
- [ ] Backup restore, monitoring ownership, support escalation, responsive review, and current device checks have
      recorded evidence.
- [ ] Production has a fresh deployment, controlled first-admin allowlist, approved support URL, rollback owner,
      and a documented smoke plan. No live E2E or provisioning harness is run against Production.
- [ ] The Production build registers the Next.js auth proxy beside `src/app`, and the controlled administrator
      completes one manual Google sign-in that reaches an authenticated administrator workspace.

## Operational evidence

Record command output, target names, timestamps, and external evidence links without recording secrets, Google
storage-state contents, raw invitation tokens, or private customer data. Keep the release decision **NO-GO** until
Preview evidence, Production OAuth configuration, backup/rollback records, monitoring ownership, and device
acceptance are present.

## Rollback and incident handling

Record the production backup/PITR checkpoint, restore owner, rollback owner, and approved target before cutover.
Use supported provider workflows for snapshots and restores. Never restore Preview data into Production or use the
live E2E provisioning harness as a Production smoke test. Authentication outage, profile privacy leakage, incorrect
inactive-card behavior, and unrecoverable data-integrity errors are rollback triggers.

Manual NFC, QR, and device/browser acceptance remains separate evidence in `e2e/real-device-checklist.md`.
