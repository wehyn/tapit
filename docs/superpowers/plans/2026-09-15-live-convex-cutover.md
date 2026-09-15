# Live Convex Cutover Implementation Plan

> **For agentic workers:** Use the orchestrator workflow and the installed test-driven-development and verification-before-completion skills for every code change or completion claim.

**Goal:** Close the remaining locally actionable Phase 6 work in `docs/live-convex-integration-plan.md`, harden deployment bootstrap ownership, and leave an evidence-based runbook for the non-production live gates.

**Architecture:** Keep the existing Convex Auth/provider boundary and demo-mode fallback. Add the missing bootstrap invariants that prevent one authenticated user from being linked to multiple customer records, implement an owned Convex Storage profile-image lifecycle, and document the explicit non-production live workflow without storing credentials or deployment secrets.

**Tech Stack:** Next.js 16.3.5, React 19.3.0, Convex 1.45.0, `@convex-dev/auth` 0.0.95, Vitest/`convex-test`, Playwright.

**Spec:** `docs/live-convex-integration-plan.md`

## Global Constraints

- Keep `NEXT_PUBLIC_DEMO_MODE=true` as the safe local default until the live vertical-slice gate is green.
- Derive authorization identity inside Convex; do not accept caller-supplied identity as an authorization decision.
- Do not hand-edit generated Convex files.
- Do not commit deployment URLs, auth secrets, passwords, setup tokens, or personal seed credentials.
- Preserve unrelated untracked `public/images/tapit-profile-card-cutout-v2.png`.

---

### Task 1: Reject duplicate Auth-user/customer bootstrap links

**Files:**

- Modify: `convex/integration/auth-ownership.test.ts`
- Modify: `convex/bootstrap.ts`
- Modify: `scripts/live-e2e.mjs`

**Interfaces:**

- Consumes: the existing `internal.bootstrap.bootstrap` mutation and `by_userId` customer index.
- Produces: the same successful bootstrap return shape, plus a deterministic data-integrity error when either supplied Auth user is already linked to a different customer record and a configured published bio in the seeded draft/snapshot.

- [x] **Step 1: Write the failing regression test**

Add a test beside the existing bootstrap idempotency test:

```ts
it("rejects bootstrap when an Auth user is already linked to another customer", async () => {
  const t = convexTest(schema, modules);
  const data = await seed(t);

  await expect(
    t.mutation(internal.bootstrap.bootstrap, {
      adminUserId: data.otherUserId,
      customerUserId: data.ownerUserId,
      adminEmail: "new-admin@example.com",
      customerEmail: "owner@example.com",
      customerSlug: "owner",
      publishedBio: "Owner bootstrap bio",
      cardUrl: "https://tapit.test/c/bootstrap-token",
      cardToken: "bootstrap-token",
    }),
  ).rejects.toThrow("already linked to another customer");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run convex/integration/auth-ownership.test.ts -t "rejects bootstrap when an Auth user is already linked"
```

Expected: the test fails because the current mutation inserts an admin customer for `otherUserId` even though that user already owns the seeded `other@example.com` customer.

- [x] **Step 3: Implement the smallest invariant check**

After resolving each email-based existing customer and before inserting or patching either account, query `customers` through `by_userId`. Reject when a non-null user-linked record is not the email-resolved record for that bootstrap role. Keep same-record reruns idempotent and preserve the existing email conflict checks.

Pass `TAPIT_LIVE_PUBLISHED_BIO` to the bootstrap mutation and use the trimmed, bounded value for both the draft and published profile snapshots.

- [x] **Step 4: Run the focused test and regression suite**

Run:

```bash
npx vitest run convex/integration/auth-ownership.test.ts
npm run typecheck
```

Expected: the focused file passes, including idempotent bootstrap and setup/ownership cases, and TypeScript exits 0.

- [x] **Step 5: Regenerate only through the installed Convex workflow if required**

Run the root-owned code generation/typecheck command against the explicitly selected development deployment only after reviewing the diff; do not hand-edit `convex/_generated/`.

### Task 2: Make the live verification runbook discoverable and safe

**Files:**

- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/live-e2e.md`
- Modify: `docs/live-convex-integration-plan.md` only for checklist evidence that is actually verified.

**Interfaces:**

- Consumes: `npm run test:e2e:live`, `scripts/live-e2e.mjs`, `docs/live-e2e.md`, and the existing `convex:dev` script.
- Produces: documentation that identifies the non-production target, supported Password-account provisioning prerequisite, exact live command, safe local default, and the fact that manual device evidence remains external.

- [x] **Step 1: Add a safe, commented live-environment block**

Document variable names and non-secret placeholders only. Keep real values in ignored environment storage and keep `NEXT_PUBLIC_DEMO_MODE=true` in the example defaults.

- [x] **Step 2: Document the combined local live-development command**

Show the existing supported command form:

```bash
NEXT_PUBLIC_DEMO_MODE=false npx convex dev --start "npm run dev -- --hostname 127.0.0.1"
```

State that `CONVEX_DEPLOYMENT` selects the development deployment and that `NEXT_PUBLIC_CONVEX_URL` must match it.

- [x] **Step 3: Document the operational live E2E sequence**

Reference the fail-fast preflight, the existing internal bootstrap, the requirement for already-provisioned Password identities, the explicit non-production confirmation, the dev/preview-only deployment guard, and the prohibition on undocumented Auth-table writes.

- [x] **Step 4: Run formatting and diff checks**

Run:

```bash
npm run format:check
git diff --check
```

Expected: both commands exit 0.

### Task 3: Execute and certify the available verification gates

**Files:**

- No production-file ownership; root-owned verification artifacts only when evidence is available.

**Interfaces:**

- Consumes: the updated repository, selected non-production Convex deployment, and ignored live E2E environment contract.
- Produces: fresh command evidence for static/unit/build checks, Convex codegen/typecheck, demo browser regression, live browser tests, and the remaining external/manual gates.

- [x] **Step 1: Confirm target and credentials without printing secrets**

Verify the CLI account/deployment and only report names/statuses. Refuse to seed or provision if the target is not a dev/preview deployment or the confirmation token is absent.

- [x] **Step 2: Run the complete local verification matrix**

Run `npm run verify`, `npm run test:e2e:demo -- --workers=1`, `npx convex ai-files status`, and `git diff --check`, reading exit codes and failure counts.

- [x] **Step 3: Run live E2E only when the complete ignored contract is present**

Run `npm run test:e2e:live`; otherwise report the exact missing variable names without fabricating evidence.

- [x] **Step 4: Perform the final read-only authorization and secret scan**

Review every public Convex function/route, search tracked files for secret-like values, and inspect the final diff. Leave manual device/public-URL results pending unless actually run on clean devices.

### Task 4: Independent review and root handoff

**Files:**

- Read-only review of the final diff and plan checklist.

**Interfaces:**

- Consumes: the final diff, test output, live-run status, and requirements in `docs/live-convex-integration-plan.md`.
- Produces: severity-ranked findings and a checklist-based completion or blocker report.

- [x] **Step 1: Dispatch a reviewer**

Review bootstrap identity uniqueness, public projection leakage, live/demo boundary, deployment safety, and test evidence.

- [x] **Step 2: Resolve material findings with TDD and fresh verification**

The root audit found and resolved two material cutover gaps: the live bootstrap was not forwarding the configured published bio, and the landing page exposed demo-profile links in live mode. Both fixes were covered by RED/GREEN regression runs and the final verification matrix.

The final authorization audit first kept the deferred Convex Storage helpers internal and added complete return
validators. Task 5 now replaces that temporary boundary with profile-scoped upload/attach/remove functions,
magic-byte validation, ownership mapping, published-only projection, and cleanup coverage.

Do not mark a plan item complete from an agent report or stale output.

### Task 5: Implement the owned Convex profile-image lifecycle

**Files:**

- Create: `convex/profileAccess.ts` (Convex rejects hyphenated module paths)
- Create: `convex/profileImages.ts` (Convex rejects hyphenated module paths)
- Create: `convex/profileProjection.ts` (Convex rejects hyphenated module paths)
- Create: `convex/integration/storage.test.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/validators.ts`
- Modify: `convex/storage.ts`
- Modify: `convex/profiles.ts`
- Modify: `convex/cards.ts`
- Modify: `convex/customers.ts`
- Delete: `convex/integration/storage-surface.typecheck.ts`

**Interfaces:**

- `profiles.draft` and `profiles.published` gain optional `imageStorageId: Id<"_storage">` fields; the existing `imageUrl` field remains readable only for legacy records and is never written by the new live save path.
- Add `profileImages` rows keyed by `storageId`, with `profileId`, `ownerId`, `contentType`, `size`, and `createdAt` so a storage ID cannot be reused by another profile.
- Public `api.storage.generateUploadUrl({ profileId })` returns `string` after server-side profile access verification.
- Public `api.storage.attachImage({ profileId, storageId })` returns `{ storageId, imageUrl }`, validates the actual stored Blob signature and size in an action, and atomically links the file to the authenticated profile draft.
- Public `api.storage.removeImage({ profileId })` returns `null`, clears only the draft image, and preserves the published image until a later publish.
- Public slug/card projections resolve only a mapped published storage reference with `ctx.storage.getUrl`; owner profile reads resolve draft and published URLs for preview.

- [x] **Step 1: Write the failing Convex storage regression tests**

Add `convex/integration/storage.test.ts` with `convex-test` coverage for these exact cases:

```ts
it("requires owned image uploads and keeps draft images private", async () => {
  const t = convexTest(schema, modules);
  const data = await seed(t);
  const owner = t.withIdentity(identity(data.ownerUserId));
  const other = t.withIdentity(identity(data.otherUserId));
  const storageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob([pngSignature()], { type: "image/png" })),
  );

  await expect(
    other.mutation(api.storage.generateUploadUrl, { profileId: data.ownerProfileId }),
  ).rejects.toThrow("Profile access denied.");
  await expect(
    other.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId,
    }),
  ).rejects.toThrow("Profile access denied.");

  await expect(
    owner.action(api.storage.attachImage, {
      profileId: data.ownerProfileId,
      storageId,
    }),
  ).resolves.toMatchObject({ storageId, imageUrl: expect.any(String) });
  await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.not.toMatchObject({
    imageUrl: expect.any(String),
  });
  await owner.mutation(api.profiles.publish, { profileId: data.ownerProfileId });
  await expect(t.query(api.profiles.publicBySlug, { slug: "owner" })).resolves.toMatchObject({
    imageUrl: expect.any(String),
  });
});
```

Also cover invalid signatures and files larger than `5 * 1024 * 1024` being rejected and deleted when
unassociated, cross-profile storage references being rejected by `saveDraft`, replacement cleanup keeping
the published file until publication, `removeImage` preserving published output, and approved-account
deletion removing the profile's mapped files. Use `t.run(...ctx.storage.store(new Blob(...)))` and assert
deleted files return `null` from `ctx.storage.getUrl`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run convex/integration/storage.test.ts
```

Expected: the new tests fail because `api.storage` has no public upload/finalize contract, profile content
has no storage reference, and no ownership mapping exists.

- [x] **Step 3: Implement the server-owned storage contract**

Add optional storage IDs to both profile snapshot validators and the schema, add indexed `profileImages`
ownership metadata, extract the existing `profileAccess` helper, and implement the public functions plus
internal inspection/commit functions. Because Convex rejects hyphenated module filenames, the helpers use
camelCase module names. Validate Blob bytes using JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`),
or WebP (`RIFF....WEBP`) signatures and reject sizes above 5 MB. Store the canonical detected MIME type and
never store signed URLs in profile data. Resolve URLs in a shared projection helper, delete only unreferenced
old files on replacement/publication, and clean all mapped files during approved account deletion.

- [x] **Step 4: Regenerate and run the backend regression checks**

Run:

```bash
npx convex codegen --typecheck enable
npx vitest run convex/integration/storage.test.ts convex/integration/auth-ownership.test.ts convex/integration/content-hardening.test.ts
npm run typecheck
```

Expected: generated bindings expose only the intended public storage functions, all focused tests pass, and
TypeScript exits 0. Evidence: Convex codegen/typecheck exited 0; focused backend storage/auth/content tests
passed (18 tests), the client image helper tests passed (5 tests), and the application typecheck exited 0.

### Task 6: Connect the live editor to owned image uploads

**Files:**

- Create: `src/lib/profile-image.ts`
- Create: `tests/profile-image.test.ts`
- Modify: `src/lib/domain/index.ts`
- Modify: `src/components/forms/ProfileEditor.tsx`
- Modify: `e2e/live.spec.ts`

**Interfaces:**

- `validateProfileImageFile(file)` returns a user-facing error string or `null` for JPG/PNG/WebP files no larger than 5 MB.
- `prepareProfileImage(file)` returns a resized JPEG `Blob` for the live upload request.
- Live `ProfileEditor` calls `generateUploadUrl`, POSTs the prepared Blob, calls `attachImage`, and updates its unsaved preview only after finalization succeeds; failed uploads leave the previous image intact.
- Demo mode continues to use its browser-local data URL path and does not call Convex storage.

- [x] **Step 1: Write the failing client validation tests**

Add tests for accepted MIME/size values and rejection messages for `image/gif`, `text/plain`, and a file of
`5 * 1024 * 1024 + 1` bytes. The tests must run against `validateProfileImageFile` before the helper exists.

- [x] **Step 2: Run the focused client test and verify RED**

Run:

```bash
npx vitest run tests/profile-image.test.ts
```

Expected: the helper import or assertions fail because the live upload validation seam does not exist.

- [x] **Step 3: Implement the live upload UI and preserve demo behavior**

Add the labeled live photo/logo picker, upload pending/error state, image preview, and remove action. Parse
the upload response as `unknown`, update local draft state only after `attachImage` returns a signed URL, and
strip resolved `imageUrl` values before draft persistence. Keep the existing demo editor's local resize/data
URL behavior unchanged.

- [x] **Step 4: Run client and demo browser checks**

Run the focused helper tests, `npm run verify`, and the serialized demo suite. The helper tests and
`npm run verify` are green.

- [x] **Step 5: Run the live image browser journey when the contract is present**

Extend the live first journey with `setInputFiles("#profile-image", "public/images/tapit-demo-mara-avatar.png")`;
verify a signed-out visitor has no new image before publish and sees the uploaded image after publish. The
four-test live browser matrix passed against the selected non-production deployment with this journey included.

### Task 7: Update image-storage documentation and certify the slice

**Files:**

- Modify: `docs/live-convex-integration-plan.md`
- Modify: `docs/live-e2e.md`
- Modify: `docs/plan.md`
- Modify: `docs/design-proof.md`

- [x] **Step 1: Replace the deferred-storage wording with the verified live contract**

Document storage-reference ownership, server signature/size validation, draft/publication privacy, cleanup,
the retained demo-mode local path, and any still-open responsive-variant or production-retention gate.

- [x] **Step 2: Run the complete available verification matrix**

Run `npm run verify`, `npm run test:e2e:demo -- --workers=1`, the guarded Convex development workflow, and
`npm run test:e2e:live` only when its complete ignored non-production contract is present. Recheck the public
function inventory, generated bindings, secret scan, and `git diff --check`; leave production/device gates
open unless their external evidence exists. The available matrix is green, including the four-test live E2E
run against the selected non-production deployment.

- [x] **Step 3: Report remaining external gates explicitly**

Leave the manual device checklist open until clean current iPhone/Android evidence exists, and identify exactly
what the user must provide or run for any remaining production or device gate.
