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

  await page.goto("/app/links");
  await expect(page.getByRole("heading", { name: "Profile links" })).toBeVisible();
  const addLinkButton = page.getByRole("button", { name: "Add link" });
  await addLinkButton.focus();
  await addLinkButton.press("Enter");
  const labels = page.locator('input[id$="-label"]');
  const destinations = page.locator('input[id$="-destination"]');
  await expect(labels.last()).toBeVisible();
  await labels.last().fill("Contact me");
  await destinations.last().fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Link destination must be a valid HTTPS, mailto, or tel address.").last(),
  ).toBeVisible();

  await destinations.last().fill("https://contact.example.test");
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(
    page.getByText("The public profile now uses this order and enabled state."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft bio")).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact me" })).toBeVisible();
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
