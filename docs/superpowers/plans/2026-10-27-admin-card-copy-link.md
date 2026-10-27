# Admin Card Copy Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or inline task-by-task execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins copy the selected card's `/c/<token>` URL using the current app origin, with accessible success and failure feedback in all card states and both runtime modes.

**Architecture:** Keep the action in the shared `CardDetail` component in `CardsManager.tsx`, which is used by local demo and Convex modes. Reuse `cardUrlFromToken(token)`, keep clipboard feedback in the detail panel, and key the detail component by token so feedback does not carry over when the selected card changes. Cover current-origin URL construction and clipboard outcomes in the existing card-manager unit suite.

**Tech Stack:** Next.js 16 client component, React state, existing `Button`/`Notice`/`Icon` UI components, Vitest, and Testing Library.

---

### Task 1: Add the shared card-link copy action

**Files:**

- Modify: `src/components/admin/CardsManager.tsx`
- Test: `tests/unit/cards-manager.test.tsx`

- [x] **Step 1: Read project guidance before editing**

If `node_modules` is missing, install the locked dependencies:

```bash
npm ci
```

Then read `CODING_STANDARDS.md` and the Next.js Client Components guide under `node_modules/next/dist/docs/`. `CardsManager.tsx` is already a client component and uses the existing browser-origin helper `cardUrlFromToken`.

- [x] **Step 2: Add tests for every card state and clipboard failure**

In `tests/unit/cards-manager.test.tsx`, add the first two tests inside `describe("live card URL mutations", ...)`. The file already has `configureCardQueries`, `render`, `screen`, `fireEvent`, `waitFor`, and Vitest imports.

```tsx
it.each(["registered", "claimable", "active", "inactive", "replaced"] as const)(
  "copies the current-origin URL for a %s card",
  async (status) => {
    const token = `card-${status}`;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    configureCardQueries([
      {
        _id: `cards:${token}`,
        _creationTime: 1,
        cardUrl: `https://stored-origin.test/c/${token}`,
        token,
        status,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        new URL(`/c/${token}`, window.location.origin).toString(),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Card link copied.");
  },
);

it.each(["denied", "unavailable"] as const)(
  "shows a manual-copy URL when clipboard access is %s",
  async (condition) => {
    const token = "existing-card";
    const url = new URL(`/c/${token}`, window.location.origin).toString();
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: condition === "denied" ? { writeText } : undefined,
    });
    configureCardQueries([
      {
        _id: `cards:${token}`,
        _creationTime: 1,
        cardUrl: `https://stored-origin.test/c/${token}`,
        token,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Clipboard access failed. Copy this URL manually: ${url}`,
    );
    expect(screen.getByRole("alert").querySelector("span")).toHaveClass("break-all");
  },
);
```

After the live-mode describe block, add a local-demo smoke test. The default demo fixture includes the active `mara-card-7f2q` card:

```tsx
describe("local-demo card links", () => {
  it("copies the current-origin URL from card details", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_DEMO_STORAGE", "local");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CardsManager />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        new URL("/c/mara-card-7f2q", window.location.origin).toString(),
      ),
    );
  });
});
```

- [x] **Step 3: Run the focused test and confirm it fails**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx
```

Expected: the test fails because the card details panel does not yet render a `Copy link` button.

- [x] **Step 4: Implement copy feedback in `CardDetail`**

In `src/components/admin/CardsManager.tsx`, keep the existing imports and helper. Add local feedback and the clipboard handler to `CardDetail`:

```tsx
const [copyMessage, setCopyMessage] = useState<{
  tone: "success" | "error";
  text: string;
  url?: string;
} | null>(null);

async function copyCardLink() {
  const url = cardUrlFromToken(token);
  try {
    await navigator.clipboard.writeText(url);
    setCopyMessage({ tone: "success", text: "Card link copied." });
  } catch {
    setCopyMessage({
      tone: "error",
      text: "Clipboard access failed. Copy this URL manually: ",
      url,
    });
  }
}
```

Render the action and feedback after the detail rows, using the existing design components:

```tsx
<Button onClick={() => void copyCardLink()} type="button" variant="secondary">
  <Icon name="copy" size={16} />
  Copy link
</Button>;
{
  copyMessage ? (
    <Notice tone={copyMessage.tone}>
      {copyMessage.text}
      {copyMessage.url ? <span className="break-all">{copyMessage.url}</span> : null}
    </Notice>
  ) : null;
}
```

Add `key={detailCard.token}` to both existing `<CardDetail>` call sites so selecting a different card clears the prior card's feedback. Keep the action in `CardDetail`, not in the registry row, so both runtime modes use the same implementation. The existing `Notice` gives success `role="status"` and failure `role="alert"`.

- [x] **Step 5: Run focused checks**

Run:

```bash
npm test -- tests/unit/cards-manager.test.tsx
npm run typecheck
npm run design:check
```

Expected: all card-manager tests pass, TypeScript reports no errors, and the design-rule check passes. The live-mode tests cover both clipboard outcomes, current-origin URL construction despite a stored different origin, all five card states, and accessible feedback. The local-demo test confirms the shared action copies a URL on the current origin in demo mode.

- [x] **Step 6: Commit the feature**

```bash
git add src/components/admin/CardsManager.tsx tests/unit/cards-manager.test.tsx
git commit -m "feat(admin): copy card public links"
```

### Task 2: Prove the admin copy action in the local demo

**Files:**

- Modify: `e2e/admin.spec.ts`
- Modify: `.agents/skills/verify-tapit/features/admin-cards.md`

- [x] **Step 1: Extend the existing admin card journey**

In `e2e/admin.spec.ts`, inside `administrator registers, assigns, replaces, deactivates, and audits cards`, after the Card registry heading is visible, grant clipboard permissions and verify copying the seeded active card URL:

```ts
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
const activeCard = page.locator("article").filter({ hasText: "mara-card-7f2q" }).first();
await activeCard.locator("summary").click();
await page.getByRole("button", { name: "Copy link", exact: true }).click();
await expect(page.getByRole("status")).toContainText("Card link copied.");
await expect
  .poll(() => page.evaluate(() => navigator.clipboard.readText()))
  .toBe(new URL("/c/mara-card-7f2q", page.url()).toString());
await activeCard.locator("summary").click();
```

- [x] **Step 2: Keep the local-demo journey notes accurate**

In `.agents/skills/verify-tapit/features/admin-cards.md`, add a short bullet documenting that this journey copies the active card URL, checks the confirmation, and verifies the clipboard contains the current-origin `/c/<token>` URL.

- [x] **Step 3: Run the journey through the verification helper**

From the repository root, run:

```bash
.agents/skills/verify-tapit/scripts/tapit-verify.sh prove "administrator registers, assigns, replaces, deactivates, and audits cards" issue-163-copy-card-link-rerun-2
```

Expected: the local-demo journey passes; the helper retains its JSON report and Playwright trace under `test-results/verify-tapit/issue-163-copy-card-link-rerun-2/`. If the helper reports that port 3001 is occupied, identify the listener and do not stop a process that is unrelated to this run.

- [x] **Step 4: Commit the local-demo proof**

```bash
git add e2e/admin.spec.ts .agents/skills/verify-tapit/features/admin-cards.md
git commit -m "test(admin): verify card link copying"
```
