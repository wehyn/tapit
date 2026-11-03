# Vercel release builds

Vercel runs `npm run build:vercel` from [`vercel.json`](../vercel.json). The script keeps local demo builds offline and checks each live or hosted-demo build before it calls Convex.

## Configure Vercel

Set these variables in the Vercel environment that builds the app:

| Build target | `NEXT_PUBLIC_DEMO_MODE` | `NEXT_PUBLIC_DEMO_STORAGE` | `CONVEX_DEPLOY_KEY` |
| --- | --- | --- | --- |
| Local build or Preview demo | `true` or unset | `local` or unset | Not used |
| Live Preview | `false` | Not used | A `dev:<deployment>\|<secret>` or `preview:<team>:<project>\|<secret>` key |
| Live Production | `false` | Not used | A `prod:` deployment key |
| Hosted demo Preview | `true` | `convex` | A `dev:<deployment>\|<secret>` or `preview:<team>:<project>\|<secret>` key |

Set `CONVEX_DEPLOY_KEY` as a secret Vercel variable. The release script rejects project keys because they do not select one deployment. Live builds also require `VERCEL_ENV` to be `preview` or `production`.

A hosted demo can run only in Vercel Preview. The Convex deployment must also have `TAPIT_DEMO_AUTH_MODE=hosted-demo` set. A live Production build accepts only a Production key. Preview builds reject Production keys, and hosted demo builds reject the Vercel Production environment.

Keep the repository's `NEXT_PUBLIC_DEMO_MODE=true` default. Ordinary `npm run build` remains `next build` and makes no Convex deployment call. `npm run build:vercel` also skips Convex for local demo builds, but Vercel Production must set `NEXT_PUBLIC_DEMO_MODE=false` so it cannot publish the local demo by default.

## How the release gate works

For live and hosted-demo builds, the script starts `convex deploy` with `--cmd` and `--cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL`. Convex 1.45 runs that command before it typechecks and pushes the backend. It sets `NEXT_PUBLIC_CONVEX_URL` and Next's `NEXT_PUBLIC_CONVEX_SITE_URL` from the selected deployment's canonical URLs. The release script validates both canonical HTTPS origins, including custom domains, then runs `npm run build` without forwarding the deploy key to the Next build.

Next.js embeds `NEXT_PUBLIC_*` values during `next build`, so both URLs in the frontend bundle point to the backend selected by the deploy key. The site URL used by Convex Auth comes from the same deployment.

Vercel publishes only when its configured build command exits successfully. A failed Next build stops the Convex deploy before its push. A failed backend push makes `convex deploy` fail, so Vercel does not publish the frontend build.

## First matching Production release

After this change merges, set Production to `NEXT_PUBLIC_DEMO_MODE=false` and configure its `CONVEX_DEPLOY_KEY` with the matching Production deploy key. Run one Production build from the release commit. Convex builds the frontend with the selected deployment's canonical URLs, then pushes that commit's functions and schema. Vercel publishes the frontend only after the push succeeds.

The build command pushes code and schema without invoking the backfill. After release, the first administrator who opens `/admin/customers` automatically starts or resumes `customerSetupStateBackfill` when its status is `not_started` or `stalled`. That existing page behavior schedules batches that update customer setup state. Review this data migration before the Production rollout. If the backend push fails, the current Production deployment stays active and Vercel does not promote the new frontend.

Convex treats an unprefixed legacy deploy key as a Production key. New Vercel configuration should use the explicit `prod:` key format.
