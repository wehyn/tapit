import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin } from "./support/demo-harness";

const DEMO_STATE_KEY = "tapit:demo-state:v1";
const DEMO_SESSION_KEY = "tapit:demo-session:v1";
const STORAGE_REMOVE_BLOCK_KEY = "tapit:e2e-storage-remove-block:v1";

async function createInvitation(page: Page, email: string): Promise<string> {
  await signInAsAdmin(page);
  await page.getByText("Invite an account by email").click();
  await page.getByLabel("Customer email").fill(email);
  await page.getByRole("button", { name: "Create and invite" }).click();

  const customerRecord = page.locator("article").filter({ hasText: email });
  await expect(customerRecord).toHaveCount(1);
  const setupLink = customerRecord.getByRole("link", { name: "Open setup link", exact: true });
  await expect(setupLink).toBeVisible();
  const href = await setupLink.getAttribute("href");
  if (!href) throw new Error("Expected the invited customer setup link.");

  await page.getByRole("button", { name: "Account menu for admin@tapit.local" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  return href;
}

async function readInvitation(page: Page, email: string) {
  return page.evaluate(
    ({ email, stateKey }) => {
      const raw = window.localStorage.getItem(stateKey);
      if (raw === null) throw new Error("Expected the invited customer state to be persisted.");
      const state = JSON.parse(raw) as {
        customers: Array<Record<string, unknown> & { email?: string; profileId?: string }>;
        profiles: Array<{ id: string; ownerId: string }>;
      };
      const customer = state.customers.find((candidate) => candidate.email === email);
      if (!customer) throw new Error("Expected the invited customer record.");
      const profile = state.profiles.find((candidate) => candidate.id === customer.profileId);
      if (!profile) throw new Error("Expected the invited customer's profile.");
      return { customer, profileOwnerId: profile.ownerId };
    },
    { email, stateKey: DEMO_STATE_KEY },
  );
}

async function blockStorageWrite(page: Page, key: string) {
  await page.evaluate((blockedKey) => {
    const testWindow = window as Window & {
      __tapitE2EOriginalSetItem?: typeof Storage.prototype.setItem;
    };
    const originalSetItem = Storage.prototype.setItem;
    testWindow.__tapitE2EOriginalSetItem = originalSetItem;
    Storage.prototype.setItem = function (storageKey, value) {
      if (storageKey === blockedKey) {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, storageKey, value);
    };
  }, key);
}

async function restoreStorageWrites(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __tapitE2EOriginalSetItem?: typeof Storage.prototype.setItem;
    };
    if (!testWindow.__tapitE2EOriginalSetItem) {
      throw new Error("Expected the original browser storage writer.");
    }
    Storage.prototype.setItem = testWindow.__tapitE2EOriginalSetItem;
    delete testWindow.__tapitE2EOriginalSetItem;
  });
}

async function blockStorageRemoval(page: Page, key: string) {
  await page.addInitScript((blockedKey) => {
    if (window.sessionStorage.getItem("tapit:e2e-storage-remove-block:v1") !== blockedKey) return;
    const testWindow = window as Window & {
      __tapitE2EOriginalRemoveItem?: typeof Storage.prototype.removeItem;
    };
    const originalRemoveItem = Storage.prototype.removeItem;
    testWindow.__tapitE2EOriginalRemoveItem = originalRemoveItem;
    Storage.prototype.removeItem = function (storageKey) {
      if (storageKey === blockedKey) {
        throw new DOMException("Storage access denied", "SecurityError");
      }
      return originalRemoveItem.call(this, storageKey);
    };
  }, key);
  await page.evaluate(
    ({ flagKey, blockedKey }) => window.sessionStorage.setItem(flagKey, blockedKey),
    { flagKey: STORAGE_REMOVE_BLOCK_KEY, blockedKey: key },
  );
  await page.reload();
}

async function restoreStorageRemovals(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __tapitE2EOriginalRemoveItem?: typeof Storage.prototype.removeItem;
    };
    if (!testWindow.__tapitE2EOriginalRemoveItem) {
      throw new Error("Expected the original browser storage remover.");
    }
    Storage.prototype.removeItem = testWindow.__tapitE2EOriginalRemoveItem;
    delete testWindow.__tapitE2EOriginalRemoveItem;
    window.sessionStorage.removeItem("tapit:e2e-storage-remove-block:v1");
  });
}

async function fillAndSubmitSetup(page: Page) {
  await page.getByLabel("Password", { exact: true }).fill("retry-password-123");
  await page.getByLabel("Confirm password").fill("retry-password-123");
  await page.getByRole("button", { name: "Set password", exact: true }).click();
}

test("session storage failure keeps an invitation available for a successful retry", async ({
  page,
}) => {
  await resetDemoHarness(page);
  const email = "session-retry@example.test";
  const setupPath = await createInvitation(page, email);
  await page.goto(setupPath);
  const before = await readInvitation(page, email);
  expect(before.customer.status).toBe("invited");
  expect(before.customer.setupToken).toBeTruthy();
  expect(before.profileOwnerId).toBe(before.customer.id);

  await blockStorageWrite(page, DEMO_SESSION_KEY);
  await fillAndSubmitSetup(page);

  await expect(page.getByText("The setup service is unavailable. Try again.")).toBeVisible();
  await expect(page).toHaveURL(/\/setup\/demo-/);
  expect(await readInvitation(page, email)).toEqual(before);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), DEMO_SESSION_KEY),
  ).toBeNull();

  await restoreStorageWrites(page);
  await page.getByRole("button", { name: "Set password", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);

  const session = await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, DEMO_SESSION_KEY);
  expect(session).toEqual({ email, role: "customer" });
  const afterSuccess = await readInvitation(page, email);
  expect(afterSuccess.customer.id).toBe(before.customer.id);
  expect(afterSuccess.customer.profileId).toBe(before.customer.profileId);
  expect(afterSuccess.customer.status).toBe("active");
  expect(afterSuccess.customer.setupToken).toBeUndefined();
  expect(afterSuccess.customer.passwordHash).toBeTruthy();
  expect(afterSuccess.profileOwnerId).toBe(before.customer.id);
});

test("account-state storage failure clears the session created for setup", async ({ page }) => {
  await resetDemoHarness(page);
  const email = "state-failure@example.test";
  const setupPath = await createInvitation(page, email);
  await page.goto(setupPath);
  const before = await readInvitation(page, email);

  await blockStorageWrite(page, DEMO_STATE_KEY);
  await fillAndSubmitSetup(page);

  await expect(page.getByText("The setup service is unavailable. Try again.")).toBeVisible();
  expect(await readInvitation(page, email)).toEqual(before);
  expect(
    await page.evaluate((key) => window.localStorage.getItem(key), DEMO_SESSION_KEY),
  ).toBeNull();

  await page.goto("/app/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprofile$/);
});

test("failed session cleanup keeps the invitation private and retryable", async ({ page }) => {
  await resetDemoHarness(page);
  const email = "failed-cleanup@example.test";
  const setupPath = await createInvitation(page, email);
  await page.goto(setupPath);
  const before = await readInvitation(page, email);

  await blockStorageRemoval(page, DEMO_SESSION_KEY);
  await blockStorageWrite(page, DEMO_STATE_KEY);
  await fillAndSubmitSetup(page);

  expect(await readInvitation(page, email)).toEqual(before);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DEMO_SESSION_KEY)).toEqual(
    JSON.stringify({ email, role: "customer" }),
  );
  await expect(
    page.getByText(
      "We couldn't finish setup or clear the saved session. Restore browser storage access, then retry this invitation.",
    ),
  ).toBeVisible();

  await restoreStorageWrites(page);
  await page.goto("/app/profile");
  await expect(page.getByText("Could not clear the saved demo session. Try again.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  expect(await readInvitation(page, email)).toEqual(before);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), DEMO_SESSION_KEY)).toEqual(
    JSON.stringify({ email, role: "customer" }),
  );

  await restoreStorageRemovals(page);
  await page.goto(setupPath);
  await fillAndSubmitSetup(page);
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();

  const afterSuccess = await readInvitation(page, email);
  expect(afterSuccess.customer.status).toBe("active");
  expect(afterSuccess.customer.setupToken).toBeUndefined();
  expect(afterSuccess.customer.passwordHash).toBeTruthy();
  expect(afterSuccess.profileOwnerId).toBe(before.customer.id);
});
