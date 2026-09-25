# Reusable Upload Platform Design

**Date:** 2026-09-24

**Status:** Design approved; implementation has not started.

## Goal

Create a reusable, policy-driven upload platform for Tapit that supports the
completed profile-photo flow, adds persistent card-design uploads, and can
accept future asset kinds without duplicating validation, security, storage,
processing, or cleanup behavior.

The profile-image upload is an existing production candidate and is not
rewritten or migrated by this design. The new generic path is introduced for
card designs and future asset kinds while sharing the same policy and security
model.

## Success criteria

- Card designs can be uploaded, validated, optimized, attached, displayed,
  replaced, and cleaned up through the generic platform.
- Card-design files are strictly below 50 MiB at finalization.
- Untrusted client metadata never determines ownership, format acceptance, or
  public visibility.
- Original card-design bytes remain available privately while an active domain
  record references them.
- Failed, abandoned, expired, and superseded assets are removed safely and
  idempotently.
- New asset kinds require a policy and processor/attachment adapter rather than
  a new copy of the upload lifecycle.
- Existing profile-image behavior and tests remain unchanged.

## Scope and non-goals

### In scope

- A generic upload-asset record and lifecycle for new asset kinds.
- Policy-driven validation and processing.
- Card-design persistence and domain attachment.
- Private quarantine storage, derivative generation, access control, cleanup,
  error contracts, observability, and documentation.
- Tests for security, lifecycle transitions, processing, and cleanup.

### Out of scope

- Migrating `profileImages` or `profileImageUploadJobs` to the generic tables.
- Replacing or changing the completed profile-image endpoint, crop behavior,
  384px output, 192px derivative, or publication rules.
- PDF, SVG, video, audio, or arbitrary document uploads.
- Resumable multipart uploads or external object storage. These can be added
  later if asset sizes or traffic require them.

## Existing boundary

Profile photos currently use the profile-scoped upload endpoint and storage
tables in `convex/profileImageUploadHttp.ts`, `convex/profileImageProcessing.ts`,
and `convex/storage.ts`. That path already performs ownership checks, byte and
format validation, image processing, revision conflict handling, replacement
cleanup, and orphan reconciliation.

The generic platform must not make the profile path depend on the new tables.
It may expose a compatibility policy documenting the profile-photo contract,
but profile photos remain governed by their existing implementation until a
separate migration is approved.

## Supported asset policies

Policies are versioned code definitions, not end-user database configuration.
Each policy defines accepted input formats, size and pixel limits, derivative
outputs, visibility, retention, and permitted domain attachments.

| Asset kind                              | Status                        | Accepted input                                                           | Size and dimensions                                                                                                                                       | Processing and retention                                                                                  |
| --------------------------------------- | ----------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `profile-photo`                         | Existing compatibility policy | User may select JPEG, PNG, or WebP; current upload output is JPEG or PNG | Existing 5 MiB and exact 384x384 processed-image contract                                                                                                 | Existing profile pipeline and cleanup remain authoritative                                                |
| `card-design`                           | New generic policy            | JPEG or PNG only                                                         | Strictly less than 50 MiB; maximum width and height 12,000px; maximum 50 million decoded pixels; exact card-template dimensions are checked at attachment | Preserve original privately; create a 2,048px preview and 512px thumbnail; retain source while referenced |
| PDF, SVG, video, audio, other documents | Unsupported                   | None                                                                     | N/A                                                                                                                                                       | Must receive a dedicated policy and processor before acceptance                                           |

The 50 MiB limit is the technical implementation limit. Product copy should
say that card designs must be under 50 MB. Extensions are display hints only;
magic bytes, decoded format, and policy determine acceptance.

## Architecture

The platform has three layers:

1. **Upload core** — authenticates the caller, creates upload intents, binds
   uploads to an owner and scope, manages quarantine storage, coordinates
   validation and processing, exposes stable errors, and schedules cleanup.
2. **Asset-kind policies** — define format, size, pixel, derivative, retention,
   and access rules for one asset kind.
3. **Domain adapters** — attach a ready asset to a card-design or future domain
   record and enforce domain-specific constraints such as a card template's
   aspect ratio or physical dimensions.

The generic path uses direct, intent-bound transfer into private quarantine
storage. A 50 MiB file must not be buffered through the application HTTP
handler. Finalization and processing operate on the quarantined object and
return an asset ID whose status can be observed by the client.

## Data model

The generic path uses separate rows for assets, variants, and references so
cleanup can be reference-aware without unbounded arrays on a single document.

### `uploadAssets`

Each row represents one upload intent and its source object.

- `kind`
- `policyVersion`
- server-derived `ownerId` and scope/parent identity
- lifecycle `status`
- quarantine/source storage ID
- detected content type and byte size
- decoded width, height, and pixel count when the asset is an image
- SHA-256 checksum
- created, expiry, ready, attached, and deletion timestamps
- stable failure code and sanitized failure detail when processing fails

### `uploadAssetVariants`

One row per derivative, including:

- asset ID and variant purpose (`preview`, `thumbnail`, or a future purpose)
- storage ID
- content type, byte size, dimensions, and checksum
- creation timestamp

### `uploadAssetReferences`

One row per active or historical domain reference, including:

- asset ID
- domain type and domain record ID
- reference role
- created and released timestamps

Domain records may also store the asset ID needed for their normal reads, but
the reference table is the cleanup authority for generic assets.

## Lifecycle and data flow

The generic state machine is:

`initiated -> uploaded -> validating -> processing -> ready -> attached`

Terminal states are `rejected`, `failed`, `expired`, and `deleted`.

1. The caller requests an upload intent for an allowed asset kind and domain
   scope. The server derives identity, checks authorization, applies the
   policy, creates the asset row, and returns a short-lived transfer target.
2. The client uploads bytes directly to private quarantine storage. The target
   is bound to the asset, owner, policy, and expiration time.
3. Finalization records the uploaded object and checks its actual stored size.
   The asset enters validation only if the object belongs to the intent.
4. A server-side validator checks magic bytes, decoded format, size, dimensions,
   pixel count, animation/multipage status, and metadata safety.
5. A kind-specific processor creates required variants. The asset becomes
   `ready` only when all required variants exist and their metadata is recorded.
6. A domain adapter attaches the ready asset after re-checking owner, scope,
   policy, and asset status. The adapter creates an active reference.
7. Clients observe status and may retry or choose another file based on the
   stable error contract.

The flow is idempotent by asset ID, checksum, and policy version. A repeated
finalization or processing request must not create duplicate variants or
references.

## Validation and security

Client-side checks are UX hints only. Server-side checks are authoritative.

- Derive identity from the authenticated request; never trust a client owner
  ID or scope.
- Require strict configured origins and authenticated transfer/finalization
  requests. Do not use wildcard CORS.
- Enforce per-owner active-upload and byte-rate quotas using the existing
  rate-limiting capability and record the deployment values in operational
  documentation.
- Compare declared MIME type and extension with magic bytes and decoded format.
- Use strict image decoding with a maximum width of 12,000px, maximum height of
  12,000px, and maximum 50 million decoded pixels.
- Reject malformed, animated, multipage, SVG, and unsupported files.
- Normalize orientation and strip metadata from generated derivatives. Preserve
  the original card-design bytes privately and do not treat its metadata as
  trusted.
- Store no executable or user-provided HTML content in the image pipeline.
- Keep quarantine and original source objects private. Do not expose raw
  storage IDs in public projections. Private asset access must go through an
  authorized resolver or equivalent short-lived access mechanism.
- Re-check ownership and active scope at attachment time, not only at intent
  creation.
- Return generic authorization failures that do not reveal whether another
  user's asset exists.
- Future non-image formats require a dedicated malware/content-scanning
  boundary before they can reach `ready`.

## Processing and optimization

Image processing runs server-side in a Node action through a kind-specific
processor.

For card designs:

- Keep the original source unchanged for printing or ordering workflows.
- Decode with strict error handling.
- Generate a preview with a maximum edge of 2,048px and a thumbnail with a
  maximum edge of 512px.
- Preserve transparency where required; otherwise use efficient JPEG or WebP
  derivatives.
- Strip metadata from derivatives and apply the decoded orientation.
- Do not upscale small files.
- Retry transient storage/processing failures idempotently. Do not retry
  permanent validation failures.

Exact card-template dimensions and aspect ratio are domain attachment rules,
not generic upload rules.

## Storage retention and cleanup

- Upload intents expire after 60 minutes unless finalized.
- Expired, failed, and abandoned quarantine objects receive a 24-hour grace
  period, then are deleted by reconciliation.
- Unattached `ready` assets are retained for seven days, then deleted.
- Attached sources and variants remain while an active reference exists.
- After the last reference is released, detached assets receive a seven-day
  deletion grace period.
- Reconciliation runs incrementally at least hourly, is paginated and
  idempotent, and supports dry-run mode.
- Cleanup records scanned, deleted, retained, skipped, ambiguous, and failed
  counts. Ambiguous reference matches are retained for manual review.
- Cleanup must never delete an object still referenced by a domain record,
  active reference row, or in-flight processing job.

## Error contract and client behavior

Generic endpoints return a stable object with `code`, user-safe `message`, and
`retryable`. Initial codes are:

`UNAUTHENTICATED`, `FORBIDDEN`, `UNSUPPORTED_TYPE`, `FILE_TOO_LARGE`,
`INVALID_SIGNATURE`, `INVALID_IMAGE`, `DIMENSIONS_EXCEEDED`, `RATE_LIMITED`,
`QUOTA_EXCEEDED`, `UPLOAD_EXPIRED`, `PROCESSING_FAILED`,
`STORAGE_UNAVAILABLE`, and `CONFLICT`.

The client shows validation errors immediately, reports transfer and processing
as separate phases, retries only retryable failures, allows cancellation and
replacement, and keeps the selected file locally until attachment succeeds.
It must not retry rejected files indefinitely.

Logs include asset ID, kind, state, duration, policy version, and failure code.
They must not include file contents, credentials, or customer secrets.

## Documentation and testing

Add an upload-infrastructure document covering the policy matrix, 50 MiB
card-design limit, dimension/pixel limits, derivative behavior, privacy,
retention, cleanup, error codes, and unsupported types. Update the current
card-design UI copy from 10 MB to under 50 MB when the generic backend is
enabled.

Tests must cover:

- Policy boundaries, including exactly 50 MiB and 50 MiB plus one byte.
- Extension/MIME/magic-byte mismatches.
- Malformed, animated, multipage, oversized-pixel, and metadata-heavy images.
- Authentication, owner/scope checks, CORS, quotas, private quarantine access,
  and attachment re-checks.
- Processing retries, duplicate finalization, and idempotent variants.
- Attach, replace, cancel, expire, detach, and cleanup flows.
- Dry-run and ambiguous orphan reconciliation.
- Demo E2E and guarded non-production live E2E; never Production.

## Rollout

1. Add the generic schema, policy registry, error types, and quarantine flow.
2. Add the card-design processor, variants, domain adapter, and cleanup worker.
3. Add security, lifecycle, processing, and reconciliation tests.
4. Update documentation and card-design UI limitations.
5. Enable persistent card-design uploads only after the generic integration and
   cleanup evidence is green.
6. Leave profile-image code, data, and behavior unchanged.

## Acceptance criteria

- A JPEG or PNG card design below 50 MiB can reach `ready`, produce the preview
  and thumbnail, and attach to an authorized card-design record.
- A file at or above 50 MiB, a non-image, a mismatched signature, an invalid
  image, an unsafe pixel count, or an animated/multipage image is rejected with
  a stable non-retryable code.
- Unauthorized callers cannot create, finalize, attach, or read another
  owner's generic asset.
- Original card-design bytes remain private and survive while referenced.
- Expired, failed, abandoned, and released assets are reconciled without
  deleting referenced objects.
- Duplicate finalize/process requests are safe.
- Existing profile-image tests and behavior remain unchanged.
