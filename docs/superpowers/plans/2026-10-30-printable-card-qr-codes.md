# Printable Card QR Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators preview and download an on-demand, print-ready SVG QR for every registered card, encoding the exact permanent URL used by its NFC tag.

**Architecture:** Keep QR generation in the browser and derive every output from the saved `card.cardUrl` string. Put the QR control in the shared `CardRow` so both local demo and Convex-backed admin registries render it for all recorded card statuses; do not add database or storage fields.

**Tech Stack:** Next.js 16 client components, React 19, `qrcode` 1.5.4, Vitest, Playwright local-demo E2E.

---

## Included URL contract: issue #193

The user approved implementing the canonical card URL contract in this branch alongside #192. The production origin is `https://tapit-eosin.vercel.app`, recorded in the production cutover plan. Both local-demo and Convex registration/replacement resolve relative `/c/<token>` paths against that origin, reject noncanonical absolute URLs, preserve query strings, and copy the stored URL unchanged. Convex validates the absolute HTTPS origin and exact token path while storing the submitted URL as-is. New local-demo and hosted-demo fixtures use the canonical origin; existing relative local-demo records receive a guarded migration, while existing absolute records are not rewritten.

- Keep #190 setup routing and #196 lost-card routing in their own scopes. #192 exposes the saved permanent URL; QR controls remain available regardless of status.
- Read the current Next.js Client Components guide under `node_modules/next/dist/docs/` before editing client components, as required by `AGENTS.md`.

## File map

- `src/lib/qr/index.ts` — shared QR options for preview and SVG/PNG generation; currently uses a one-module margin.
- `src/components/qr/QrControls.tsx` — QR disclosure, lazy generation, URL validation, preview, retry, and SVG download; currently rewrites the URL and generates as soon as the component mounts.
- `src/components/admin/CardsManager.tsx` — shared `CardRow` plus separate demo/live data loops; QR is currently demo-only and active-only.
- `src/lib/card-url.ts` — canonical Production origin and URL normalization shared by the admin UI, demo fixtures, and QR validation.
- `src/lib/demo/store.ts` — migrate legacy relative local-demo card URLs through guarded persistence.
- `tests/unit/demo-storage-store.test.ts` — verify safe migration and preservation of existing absolute or malformed URLs.
- `convex/cards.ts` and `convex/demo.ts` — enforce canonical URLs and seed hosted-demo cards with the permanent origin.
- `tests/unit/card-url.test.ts` — exact canonical-origin, path, credential, and query validation.
- `tests/unit/qr-generator.test.ts` — new unit coverage for shared print-safe QR options.
- `tests/unit/qr-controls.test.tsx` — new component coverage for exact URL use, lazy generation, retry, invalid data, and download.
- `tests/unit/cards-manager.test.tsx` — extend URL-contract, mode, and card-status coverage for the shared row.
- `convex/integration/content-hardening.test.ts` and `convex/integration/remaining-operations.test.ts` — canonical URL boundary and query persistence coverage.
- `tests/unit/public-features.test.ts` — strengthen the existing SVG generation smoke test.
- `e2e/admin.spec.ts` — verify the admin download flow and retain the SVG as an E2E artifact.
- `docs/CHANGELOG.md` — add the user-visible admin QR feature.

## Failure modes to cover before implementation

- A QR silently gains `source=qr`, loses `?claim=1`, or uses a preview/development host instead of the stored permanent URL.
- The generator runs for every closed card row, or a non-active card has no QR control in one mode.
- An invalid or relative saved URL silently falls back to the current browser origin.
- A narrow or transparent SVG is hard to place or scan after printing; retries leave stale output downloadable.
- QR preview or download writes a Convex mutation or browser-local card data.

## Task 1: Pin print-safe QR generator settings

**Files:**

- Create: `tests/unit/qr-generator.test.ts`
- Modify: `src/lib/qr/index.ts`
- Modify: `tests/unit/public-features.test.ts`

- [ ] **Step 1: Add a failing test for the generator options.** Mock `qrcode` and assert both generator methods receive the input string unchanged. The SVG call must use `type: "svg"`, error correction `M`, `margin: 4`, width `512`, and opaque black/white colors; the PNG call uses the same options except `type`.

```ts
import { beforeEach, expect, it, vi } from "vitest";

const qrcode = vi.hoisted(() => ({
  toString: vi.fn(async () => "<svg />"),
  toDataURL: vi.fn(async () => "data:image/png;base64,preview"),
}));

vi.mock("qrcode", () => ({ default: qrcode }));

import { generateQrPng, generateQrSvg } from "@/lib/qr";

beforeEach(() => vi.clearAllMocks());

it("uses print-safe SVG settings without changing the payload", async () => {
  const url = "https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1";
  await generateQrSvg(url);

  expect(qrcode.toString).toHaveBeenCalledWith(url, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 512,
    color: { dark: "#000000ff", light: "#ffffffff" },
    type: "svg",
  });
});

it("uses the same print-safe settings for PNG preview", async () => {
  const url = "https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1";
  await generateQrPng(url);

  expect(qrcode.toDataURL).toHaveBeenCalledWith(url, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 512,
    color: { dark: "#000000ff", light: "#ffffffff" },
  });
});
```

- [ ] **Step 2: Run the new and existing QR unit tests and confirm the new expectation fails.**

Run: `npm run test -- tests/unit/qr-generator.test.ts tests/unit/public-features.test.ts`

Expected: the new assertion fails because the current shared options use `margin: 1` and do not explicitly set colors.

- [ ] **Step 3: Set shared generator options.** Keep the same options for SVG and PNG so both outputs encode the same QR matrix.

```ts
import QRCode from "qrcode";

const options = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  width: 512,
  color: { dark: "#000000ff", light: "#ffffffff" },
};

export function generateQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { ...options, type: "svg" });
}

export function generateQrPng(value: string): Promise<string> {
  return QRCode.toDataURL(value, options);
}
```

- [ ] **Step 4: Assert deterministic SVG output.** Extend the existing test in `tests/unit/public-features.test.ts` to call `generateQrSvg(url)` twice and assert both outputs are valid SVG with a `viewBox` and are byte-for-byte equal.

```ts
const [first, second] = await Promise.all([generateQrSvg(url), generateQrSvg(url)]);
expect(first).toContain("<svg");
expect(first).toContain("viewBox");
expect(second).toBe(first);
```

- [ ] **Step 5: Run the focused tests and commit.**

Run: `npm run test -- tests/unit/qr-generator.test.ts tests/unit/public-features.test.ts`

Expected: both files pass.

```bash
git add src/lib/qr/index.ts tests/unit/qr-generator.test.ts tests/unit/public-features.test.ts
git commit -m "feat: set print-safe card QR output"
```

## Task 2: Generate the exact saved URL only when QR controls open

**Files:**

- Create: `tests/unit/qr-controls.test.tsx`
- Modify: `src/components/qr/QrControls.tsx`

- [ ] **Step 1: Write component tests before changing `QrControls`.** Mock `generateQrSvg` and `generateQrPng`. Cover these cases:
  - No generator runs before the QR disclosure is opened.
  - Opening it passes the exact saved URL, including `?claim=1`, to both generators.
  - A relative or malformed URL displays an error and never calls a generator with the browser origin.
  - A generator failure displays an error; **Retry QR generation** calls the generators again.
  - SVG download stays disabled while generation is pending and uses `<token>.svg` after success.

Use this canonical test input and assert it is passed without normalization:

```ts
const cardUrl = "https://tapit-eosin.vercel.app/c/card-29y887jo?claim=1";
expect(generateQrSvg).toHaveBeenCalledWith(cardUrl);
expect(generateQrPng).toHaveBeenCalledWith(cardUrl);
```

- [ ] **Step 2: Run the new component test and confirm it fails.**

Run: `npm run test -- tests/unit/qr-controls.test.tsx`

Expected: current code calls the generators with a `source=qr` URL and starts work on mount.

- [ ] **Step 3: Validate the saved URL without rewriting it.** Reuse `cardTokenFromUrl` from `src/lib/card-url.ts`; it accepts only an absolute HTTPS URL on the canonical origin with an exact `/c/<token>` path. Pass the original `cardUrl` string to the QR generator. Do not read `window.location.origin`, add `source=qr`, or remove query parameters.

```ts
const token = cardTokenFromUrl(cardUrl);
```

- [ ] **Step 4: Defer generation until the QR disclosure opens.** Use a collapsed `<details>` disclosure for the QR controls and start the existing async generation effect only after its `onToggle` reports `open`. Keep the cancellation guard so collapsing or switching cards cannot apply a stale result. Declare the state referenced by the effect:

```ts
const [isOpen, setIsOpen] = useState(false);
const [retryCount, setRetryCount] = useState(0);
const [svg, setSvg] = useState("");
const [png, setPng] = useState("");
const [error, setError] = useState("");
const [isLoading, setIsLoading] = useState(false);
const token = cardTokenFromPermanentUrl(cardUrl);
```

```ts
useEffect(() => {
  if (!isOpen || token === null) {
    setSvg("");
    setPng("");
    setIsLoading(false);
    return;
  }
  let cancelled = false;
  setSvg("");
  setPng("");
  setError("");
  setIsLoading(true);
  Promise.all([generateQrSvg(cardUrl), generateQrPng(cardUrl)])
    .then(([nextSvg, nextPng]) => {
      if (!cancelled) {
        setSvg(nextSvg);
        setPng(nextPng);
        setError("");
      }
    })
    .catch(() => {
      if (!cancelled) setError("QR output could not be generated.");
    })
    .finally(() => {
      if (!cancelled) setIsLoading(false);
    });
  return () => {
    cancelled = true;
  };
}, [cardUrl, isOpen, retryCount, token]);
```

- [ ] **Step 5: Add retry and preserve accessible preview/download behavior.** When the URL is invalid, show an error without calling the generator. On generation failure, show the existing error notice and a **Retry QR generation** button that increments `retryCount`. Keep the existing accessible image alt text and disable download while `isLoading` or until `svg` is ready. Name the SVG from the validated card token, not an untrusted label. Do not add any card mutation or file upload. Keep the download transient in the browser:

```ts
function downloadSvg() {
  if (!svg || isLoading) return;
  const anchor = document.createElement("a");
  anchor.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  anchor.download = `${token}.svg`;
  anchor.click();
}
```

Insert these error branches into the existing markup before the image and download controls:

```tsx
{
  isOpen && token === null ? (
    <Notice tone="error">This card has no valid permanent URL for QR generation.</Notice>
  ) : null;
}
{
  error ? (
    <div>
      <Notice tone="error">{error}</Notice>
      <Button onClick={() => setRetryCount((count) => count + 1)} type="button" variant="secondary">
        Retry QR generation
      </Button>
    </div>
  ) : null;
}
```

Re-run the component tests.

Run: `npm run test -- tests/unit/qr-controls.test.tsx`

Expected: all exact-URL, lazy-generation, error/retry, and download assertions pass.

```bash
git add src/components/qr/QrControls.tsx tests/unit/qr-controls.test.tsx
git commit -m "feat: generate card QR from permanent URL"
```

## Task 3: Show QR controls for every registered card in both modes

**Files:**

- Modify: `src/components/admin/CardsManager.tsx`
- Modify: `tests/unit/cards-manager.test.tsx`

- [ ] **Step 1: Add failing manager tests.** Import `within`, mock the two QR generator functions, and for each current status (`registered`, `claimable`, `active`, `inactive`, `replaced`) render a live card with an absolute permanent URL, expand its card row and QR disclosure, and assert the SVG generator receives that exact URL. Add demo assertions for the active, claimable, and inactive fixture cards. In live mode, assert the QR action invokes no card mutation; in local demo, snapshot `localStorage` after hydration and assert it is unchanged after QR generation.

```tsx
const qrGenerators = vi.hoisted(() => ({
  generateQrSvg: vi.fn(async () => "<svg />"),
  generateQrPng: vi.fn(async () => "data:image/png;base64,preview"),
}));

vi.mock("@/lib/qr", () => qrGenerators);

import { generateQrSvg } from "@/lib/qr";

it.each(["registered", "claimable", "active", "inactive", "replaced"] as const)(
  "shows the permanent QR control for a %s live card",
  async (status) => {
    const token = `card-${status}`;
    configureCardQueries([
      {
        _id: `cards:${token}`,
        _creationTime: 1,
        cardUrl: `https://tapit-eosin.vercel.app/c/${token}?claim=1`,
        token,
        status,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    render(<CardsManager />);

    const row = screen.getByText(`/c/${token}`).closest("details");
    expect(row).not.toBeNull();
    fireEvent.click(row!.querySelector("summary")!);
    fireEvent.click(within(row!).getByText("QR fallback"));
    await waitFor(() =>
      expect(generateQrSvg).toHaveBeenCalledWith(
        `https://tapit-eosin.vercel.app/c/${token}?claim=1`,
      ),
    );
    expect(mutationHandlers.register).not.toHaveBeenCalled();
    expect(mutationHandlers.replace).not.toHaveBeenCalled();
  },
);
```

- [ ] **Step 2: Run the focused manager test and confirm non-active statuses and live mode fail.**

Run: `npm run test -- tests/unit/cards-manager.test.tsx`

Expected: only the current active local-demo card can reach the existing QR controls.

- [ ] **Step 3: Put the control in the shared row.** Add `cardUrl: string` to the existing `CardRow` argument destructuring and inline prop type. Pass `card.cardUrl` from both `DemoCardsManager` and `LiveCardsManager`. After `{children}` inside the existing row details, add the control and remove the demo loop's `status === "active"` conditional:

```tsx
function CardRow({
  cardUrl,
  children,
  onOpen,
  profileLabel,
  selected,
  status,
  token,
}: {
  cardUrl: string;
  children: ReactNode;
  onOpen: () => void;
  profileLabel: string;
  selected: boolean;
  status: string;
  token: string;
}) {
  return (
    <article
      className={`min-w-0 rounded-control ${selected ? "bg-tapit-accent-soft" : "bg-tapit-soft-surface"}`}
    >
      <details
        className="group"
        onToggle={(event) => {
          if (event.currentTarget.open) onOpen();
        }}
      >
        <summary
          className={`grid ${cardRowColumns} min-h-14 cursor-pointer list-none items-center gap-4 rounded-control px-4 text-sm hover:bg-tapit-accent-soft [&::-webkit-details-marker]:hidden`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-control bg-tapit-surface text-tapit-accent-strong shadow-card">
              <Icon name="card" size={16} />
            </span>
            <span className="min-w-0 truncate font-semibold text-tapit-ink">/c/{token}</span>
          </span>
          <span>
            <StatusChip status={status} />
          </span>
          <span className="min-w-0 truncate text-tapit-muted">{profileLabel}</span>
          <span className="grid place-items-center text-tapit-muted">
            <Icon className="group-open:hidden" name="caretDown" size={16} />
            <Icon className="hidden group-open:block" name="caretUp" size={16} />
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-sm text-tapit-muted">
            {profileLabel} ({token})
          </p>
          {children}
          <QrControls cardUrl={cardUrl} label={token} />
        </div>
      </details>
    </article>
  );
}
```

Also add `cardUrl={card.cardUrl}` to the `CardRow` call in each mode and delete the existing demo-only `<QrControls>` block.

Do not add a status allowlist, so future statuses such as `lost` remain printable.

- [ ] **Step 4: Run manager tests and commit.**

Run: `npm run test -- tests/unit/cards-manager.test.tsx`

Expected: every test row exposes the same QR disclosure in local demo and mocked Convex mode; existing copy-link behavior remains unchanged.

```bash
git add src/components/admin/CardsManager.tsx tests/unit/cards-manager.test.tsx
git commit -m "feat: expose card QR controls in admin registry"
```

## Task 4: Verify the browser download and document the feature

**Files:**

- Modify: `e2e/admin.spec.ts`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: Add a deterministic local-demo E2E case for a card before attachment.** Import `readFile` from `node:fs/promises` and change the test callback to `async ({ page }, testInfo)`. Sign in as the seeded admin and register `https://tapit-eosin.vercel.app/c/e2e-card-qr?claim=1`. Cancel the immediate **Confirm card attachment** dialog so the new record stays unassigned. Expand its `/admin/cards` row and QR disclosure, verify the displayed URL is exactly the registered URL, and download the SVG. Assert the filename and SVG root, save the download under `testInfo.outputPath(download.suggestedFilename())`, and attach that file to the test result so the E2E run retains a repeatable print artifact. Snapshot local storage after registration and assert that opening/downloading the QR does not change it.

```ts
const cardUrl = "https://tapit-eosin.vercel.app/c/e2e-card-qr?claim=1";
await signInAsAdmin(page);
await page.getByRole("link", { name: "Cards", exact: true }).click();
await page.getByLabel("Pre-encoded card URL").fill(cardUrl);
await page.getByRole("button", { name: "Register card" }).click();
await page
  .getByRole("dialog", { name: "Confirm card attachment" })
  .getByRole("button", { name: "Cancel" })
  .click();
const row = page.locator("article").filter({ hasText: "e2e-card-qr" }).first();
await row.locator("summary").click();
const savedDemoState = await page.evaluate(() => JSON.stringify(localStorage));
await row.getByText("QR fallback", { exact: true }).click();
await expect(row.getByText(`Encodes ${cardUrl}`, { exact: true })).toBeVisible();
const downloadPromise = page.waitForEvent("download");
await row.getByRole("button", { name: "Download SVG" }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toBe("e2e-card-qr.svg");
const filePath = testInfo.outputPath(download.suggestedFilename());
await download.saveAs(filePath);
await testInfo.attach("card-qr-svg", { path: filePath, contentType: "image/svg+xml" });
const svg = await readFile(filePath, "utf8");
expect(svg).toContain("<svg");
expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(savedDemoState);
```

- [ ] **Step 2: Run the local-demo browser suite with the new card QR case.**

Run: `npm run test:e2e:demo`

Expected: the QR preview appears after opening its disclosure, the download is named `<token>.svg`, and the test report includes the generated SVG artifact. This is local-demo evidence only; do not point E2E or provisioning at Production.

- [ ] **Step 3: Add the user-facing changelog entry.** Add this entry at the top of `docs/CHANGELOG.md`:

```md
## 2026-10-30 — Printable card QR codes

- Administrators can preview and download a print-ready SVG QR for each registered card, including before attachment. Each QR uses the card's permanent NFC URL and is generated on demand without storing an image.
```

- [ ] **Step 4: Run final verification.** The E2E suite runs in Step 2; finish with the required repository checks.

Run:

```bash
npm run verify
```

Expected: `verify` passes design checks, formatting, lint, typecheck, the full unit/Convex test suites, and build. Focused Vitest commands from Tasks 1–3 and the local-demo E2E run from Step 2 pass. Use the repository `verify-tapit` workflow before reporting the web-facing behavior complete.

```bash
git add e2e/admin.spec.ts docs/CHANGELOG.md
git commit -m "test: verify printable card QR download"
```

## Coverage self-review

- The #193 URL-contract section covers the canonical production host and full saved URL; Task 2 preserves the saved URL and query without `source=qr` or a one-time code.
- Task 1 covers deterministic SVG output, the four-module quiet zone, and opaque black/white colors. Task 2 covers exact payload generation, lazy preview/download, invalid URLs, and retry.
- Task 3 covers all registered records, both admin modes, and status-agnostic future support without persistence or backend changes.
- Task 4 covers the browser download artifact, local-demo execution, and changelog. Exact URL attribution remains as specified: under current analytics, missing `source` is counted as `nfc`.
