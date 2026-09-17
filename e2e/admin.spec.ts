import { expect, test, type Page } from "@playwright/test";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
}

async function signInAsCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

test("administrator can create and inspect a customer invitation", async ({ page }) => {
  await signInAsAdmin(page);
  await expect(page.getByRole("link", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cards", exact: true })).toBeVisible();
  await page.getByLabel("Customer email").fill("new-person@example.test");
  await page.getByRole("button", { name: "Create and invite" }).click();
  await expect(
    page.getByText("Customer account created for new-person@example.test."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /\/setup\/demo-/ })).toBeVisible();

  await page.getByLabel("Customer email").fill("new-person@example.test");
  await page.getByRole("button", { name: "Create and invite" }).click();
  await expect(page.getByText("That customer email is already registered.")).toBeVisible();
});

test("a new customer setup flow receives its own empty profile", async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByLabel("Customer email").fill("separate-owner@example.test");
  await page.getByRole("button", { name: "Create and invite" }).click();
  const setupLink = page.getByRole("link", { name: /\/setup\/demo-/ });
  await expect(setupLink).toBeVisible();
  await page.goto((await setupLink.getAttribute("href")) || "/setup/invalid");
  await page.getByLabel("Password", { exact: true }).fill("new-owner-password");
  await page.getByLabel("Confirm password").fill("new-owner-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByLabel("Name")).toHaveValue("");
  await expect(page.getByLabel("Stable profile slug")).toHaveValue(/separate-owner/);
  await expect(page.getByText("Mara Velasquez")).toHaveCount(0);
});

test("administrator registers, assigns, replaces, deactivates, and audits cards", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Cards", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Card registry" })).toBeVisible();

  await page.getByLabel("Pre-encoded card URL").fill("/c/malformed/path");
  await page.getByRole("button", { name: "Register card" }).click();
  await expect(page.getByText("Enter a card URL with a /c/<unique-token> path.")).toBeVisible();

  await page.getByLabel("Pre-encoded card URL").fill("/c/mara-card-7f2q");
  await page.getByRole("button", { name: "Register card" }).click();
  await expect(page.getByText("That card URL is already registered.")).toBeVisible();

  await page.getByLabel("Pre-encoded card URL").fill("/c/new-card-abc");
  await page.getByRole("button", { name: "Register card" }).click();
  await expect(
    page.getByText("Card new-card-abc registered and ready for assignment."),
  ).toBeVisible();
  const newCard = page.locator("article").filter({ hasText: "new-card-abc" }).first();
  await expect(page.getByRole("dialog", { name: "Confirm card attachment" })).toBeVisible();
  await page
    .getByRole("dialog", { name: "Confirm card attachment" })
    .getByRole("button", { name: "Attach card" })
    .click();
  await expect(page.getByRole("dialog", { name: "Confirm card attachment" })).toBeHidden();
  await newCard.locator("summary").click();
  await expect(newCard.getByText(/Mara Velasquez \(new-card-abc\)/)).toBeVisible();
  await expect(
    page.getByText(
      "Card new-card-abc is claimable and assigned to Mara Velasquez. It must be activated with a claim code.",
    ),
  ).toBeVisible();
  await expect(newCard.getByRole("button", { name: "Generate claim code" })).toBeVisible();

  const originalCard = page.locator("article").filter({ hasText: "mara-card-7f2q" }).first();
  await originalCard.locator("summary").click();
  await originalCard.getByRole("button", { name: "Replace card" }).click();
  await page.getByLabel("New pre-encoded card URL").fill("/c/replacement-card-xyz");
  await page.getByRole("button", { name: "Review replacement" }).click();
  await expect(page.getByRole("dialog", { name: "Replace this card?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Replace card" }).click();
  await expect(page.getByText("Card mara-card-7f2q was replaced.")).toBeVisible();

  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "This card is inactive" })).toBeVisible();
  await page.goto("/c/replacement-card-xyz");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();

  await page.goto("/admin/audit-log");
  await expect(page.getByText("Card replaced")).toBeVisible();
  await expect(page.getByText("Card registered")).toBeVisible();
});

test("administrator moderation hides a profile and can restore it", async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Profiles" }).click();
  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("dialog", { name: "Suspend this profile?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Suspend profile" }).click();
  await expect(page.getByText("Profile status changed to suspended.")).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();

  await page.goto("/admin/profiles");
  await page.getByRole("button", { name: "Restore profile" }).click();
  await expect(page.getByText("Profile status changed to published.")).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
});

test("administrator approves a customer deletion request", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);

  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Profiles" }).click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText(
      "Your customer account is inactive or pending deletion. Contact support before publishing.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Customers" }).click();
  const customer = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await customer.getByRole("button", { name: "Approve deletion" }).click();
  await expect(page.getByRole("dialog", { name: "Approve account deletion?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Approve deletion" }).click();
  await expect(
    page.getByText(
      "Deletion approved. The account is closed and its profile and cards remain unavailable.",
    ),
  ).toBeVisible();
  await expect(customer.getByText("deleted", { exact: true })).toBeVisible();
  await page.goto("/admin/audit-log");
  await expect(page.getByText("account · deletion approved")).toBeVisible();
});
