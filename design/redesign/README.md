# Tapit UI redesign — prototype spec

Static HTML prototypes of every screen, exported from the "Tapit UI Redesign" design canvas.
They are a **visual and navigation spec**, not production code. Rebuild them with the existing
React components and Tailwind tokens.

- `tapit.css`: shared tokens (current palette, 3 radii, 8 spacing steps, 7 text sizes) and component classes.
- `Main.dc.html`: the audit findings, before/after numbers and the navigation map.
- `Foundations.dc.html`: token and component rules.
- Each other `*.dc.html` file is one screen. Links between them (`href="Links.dc.html"`) show the intended navigation.

Each file loads `./support.js`, a runtime that exists only inside the design canvas. Ignore that
line; open a file in a browser and the markup and `tapit.css` still show the layout.

| Area | Files |
| --- | --- |
| Public & sign-in | Landing, Login, Setup, Onboarding, Legal, States |
| Customer (desktop) | Profile, Links, Customize, BuildCard (route `/app/card`), Analytics, Account |
| Mobile & public | MProfile, MLinks, MAnalytics, MMore, PublicProfile, CardClaim |
| Admin | AdminCustomers, AdminProfiles, AdminCards, AdminAnalytics, AdminAudit, AdminSettings |

Rules: keep the palette, use only the 12 / 20 / full radii, use only the 4–64 spacing scale and
the 12–40 type scale (56 for the hero), and use no divider lines or 1px outlines.
