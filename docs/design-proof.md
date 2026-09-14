# Tapit design and acceptance proof

This record ties the approved screen contract to the local MVP evidence. It intentionally uses the
seeded demo account and contains no real customer data.

## Automated browser proof

| Surface | Route/state | Viewport | Evidence |
|---|---|---:|---|
| Public profile | `/mara-velasquez`, published | Playwright Chromium desktop | `e2e/public-profile.spec.ts`, `e2e/accessibility.spec.ts` |
| Active card | `/c/mara-card-7f2q` | Playwright Chromium desktop | `e2e/public-profile.spec.ts` |
| Inactive card | `/c/mara-card-retired` | Playwright Chromium desktop | `e2e/public-profile.spec.ts` |
| Login/setup | `/login`, `/setup/demo-setup-token` | Playwright Chromium desktop | `e2e/customer.spec.ts` |
| Customer Profile/Links | `/app/profile`, `/app/links` | Playwright Chromium desktop | `e2e/customer.spec.ts` |
| Customer analytics/account | `/app/analytics`, `/app/account` | Playwright Chromium desktop | `e2e/customer.spec.ts` |
| Administrator operations | `/admin/*` | Playwright Chromium desktop | `e2e/admin.spec.ts` |
| Automated accessibility | public, customer, administrator success states | Playwright Chromium desktop | `e2e/accessibility.spec.ts` with axe 4.13.0 |

The browser suite also proves draft privacy, slug immutability in the profile UI, unsafe-link rejection,
link publication, no customer Cards navigation, customer-profile isolation after invitation setup,
duplicate card URL rejection, QR PNG/SVG download names, card replacement, inactive-card privacy,
moderation/unpublish restoration, deletion confirmation and administrator approval, and audit visibility.

## Responsive and manual review matrix

Run the same routes at these widths before a release and attach reviewed screenshots or CI artifacts:

| Width | Required review |
|---:|---|
| 390px | phone-first public profile, login/setup, customer forms, dialog, QR card |
| 768px | public profile and dashboard transition, link rows, stacked admin records |
| 1440px | split customer editor/preview, admin console, QR preview, audit/settings |

The automated suite proves semantic structure, keyboard-operable controls, focus restoration/containment
for the confirmation dialog, and reduced-motion CSS presence. A human still needs to review the visual
baselines at the three widths and replace the provisional Tapit text mark/tokens when the brand gate is
approved.

## Known local-MVP boundaries

- `NEXT_PUBLIC_DEMO_MODE=true` is the acceptance surface: data, sessions, invitations, analytics, and
  image previews are browser-local and deterministic.
- Convex/Auth functions, storage, and schema are implemented and type-checked, but the UI does not
  claim production deployment until an authenticated Convex development deployment is configured and
  generated bindings replace the bootstrap files.
- NFC hardware, current iPhone/Android scans, production email delivery, password recovery, email
  verification, unique-view method, deletion retention, and 4G performance measurements remain release
  gates rather than desktop-browser claims.
