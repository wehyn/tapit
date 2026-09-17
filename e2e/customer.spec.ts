import { expect, test, type Page } from "@playwright/test";

async function signInAsCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

test("one-time setup leads to a guarded customer workspace without Cards", async ({ page }) => {
  await page.goto("/setup/demo-setup-token");
  await expect(page.getByRole("heading", { name: "Choose a password" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("new-demo-password");
  await page.getByLabel("Confirm password").fill("new-demo-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Links" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cards" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("new-demo-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
});

test("customer drafts stay private until link and profile publication", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/app/profile",
  );
  await page.goto("/app/profile");
  await page.getByLabel("Bio or role").fill("A private draft bio");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByText("Brand systems for independent teams.")).toBeVisible();
  await expect(page.getByText("A private draft bio")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/links");
  await expect(page.getByRole("heading", { name: "Your links" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "phone" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "desktop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const addLinkButton = page.getByRole("button", { name: "Add link" });
  await addLinkButton.click();
  const labels = page.locator('input[id$="-label"]');
  const destinations = page.locator('input[id$="-destination"]');
  await expect(labels.last()).toBeVisible();
  await labels.last().fill("Private note");
  await destinations.last().fill("https://contact.example.test");
  const privateNoteEnabled = page.getByRole("checkbox", { name: "Enable Private note" });
  await expect(privateNoteEnabled).toBeChecked();
  await privateNoteEnabled.uncheck({ force: true });
  await expect(privateNoteEnabled).not.toBeChecked();
  await page.locator('summary[aria-label="Actions for Private note"]').click();
  await expect(page.getByRole("button", { name: "Move up" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Move down" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Links saved to draft.")).toBeVisible();
  await page.goto("/app/links");
  await expect(labels.last()).toHaveValue("Private note");
  await expect(page.getByRole("checkbox", { name: "Enable Private note" })).not.toBeChecked();
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(
    page.getByText("The public profile now uses this order and enabled state."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft bio")).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);
});

test("customer analytics and account controls stay scoped to the customer", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await expect(page.getByText("Profile views")).toBeVisible();
  await page.getByLabel("Time range").selectOption("7d");
  await expect(page.getByLabel("Time range")).toHaveValue("7d");

  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByRole("dialog", { name: "Request account deletion?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});
