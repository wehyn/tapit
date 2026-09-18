import { expect, test } from "@playwright/test";

test("customer signup starts from the public login page", async ({ page }) => {
  await page.goto("/login?mode=signup");

  await expect(page.getByRole("heading", { name: /create your tapit profile/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New to Tapit? Create your profile" }),
  ).toBeVisible();
  await expect(page.getByLabel("Display name")).toHaveAttribute("id", "signup-name");
  await expect(page.getByLabel("Profile link")).toHaveAttribute("id", "signup-slug");
  await expect(page.getByLabel("Email")).toHaveAttribute("id", "signup-email");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "id",
    "signup-password",
  );
  await expect(page.getByLabel("Confirm password", { exact: true })).toHaveAttribute(
    "id",
    "signup-confirmation",
  );

  await page.getByLabel("Display name").fill("New Tapit Customer");
  await page.getByLabel("Profile link").fill("login");
  await page.getByLabel("Email").fill("new-tapit-customer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-signup");
  await page.getByLabel("Confirm password", { exact: true }).fill("tapit-signup");
  await page.getByRole("button", { name: "Create your profile", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "That profile slug is reserved." }),
  ).toBeVisible();

  await page.getByLabel("Profile link").fill("new-tapit-customer");
  await page.getByRole("button", { name: "Create your profile", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(
    page.getByText(
      "Your profile link is ready. Add a Portfolio, TikTok, or contact link, then publish it.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Add your first link" })).toHaveAttribute(
    "href",
    "/app/links",
  );
  await expect(page.getByRole("link", { name: "/new-tapit-customer" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(
    "new-tapit-customer@example.test",
  );

  await page.getByLabel("Bio or role").fill("A new customer bio");
  await page.getByRole("link", { name: "Links", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile links" })).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Bio or role")).toHaveValue("A new customer bio");
  await page.getByLabel("Bio or role").fill("A new customer bio with an explicit save");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Draft saved. Visitors still see the last published version."),
  ).toBeVisible();
  await page.goto("/new-tapit-customer");
  await expect(
    page.getByRole("heading", { name: /Profile not found|This profile is currently unavailable/ }),
  ).toBeVisible();
  await expect(page.getByText("A new customer bio")).toHaveCount(0);

  await page.goto("/app/links");
  await page.getByRole("button", { name: "Add link" }).click();
  await page.getByRole("button", { name: "Add link" }).click();
  const editableLinks = page.locator('[aria-label="Editable profile links"]');
  const labels = editableLinks.locator('input[id$="-label"]');
  const destinations = editableLinks.locator('input[id$="-destination"]');
  await labels.nth(0).fill("Portfolio");
  await destinations.nth(0).fill("https://portfolio.example.test");
  await labels.nth(1).fill("TikTok");
  await destinations.nth(1).fill("https://www.tiktok.com/@new-customer");
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await page.getByRole("link", { name: "Links", exact: true }).click();
  await expect(labels.nth(0)).toHaveValue("Portfolio");
  await expect(destinations.nth(1)).toHaveValue("https://www.tiktok.com/@new-customer");
  await page.getByRole("button", { name: "Add link" }).click();
  await labels.nth(2).fill("Newsletter");
  await destinations.nth(2).fill("https://newsletter.example.test");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Links saved to draft. Visitors still see the last published order."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add link" }).click();
  const lastLabel = labels.last();
  const lastDestination = destinations.last();
  await lastLabel.fill("Unsafe");
  await lastDestination.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Link destination must be a valid HTTPS, mailto, or tel address."),
  ).toBeVisible();
  await page.locator("details").last().locator("summary").click();
  await page.getByRole("button", { name: "Delete" }).last().click();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText("Links published. The public profile now uses this order and enabled state."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/new-tapit-customer");
  await expect(page.getByRole("heading", { name: "New Tapit Customer" })).toBeVisible();
  await expect(page.getByText("A new customer bio")).toBeVisible();
  await expect(page.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
    "href",
    "https://portfolio.example.test",
  );
  await expect(page.getByRole("link", { name: "TikTok" })).toHaveAttribute(
    "href",
    "https://www.tiktok.com/@new-customer",
  );
  await expect(page.getByText("Unsafe")).toHaveCount(0);
});
