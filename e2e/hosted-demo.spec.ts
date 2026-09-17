import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Hosted demo runs are intentionally opt-in and must identify a non-production
// Convex deployment. Local demo coverage remains in public-profile.spec.ts.
const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
const hostedDemoEnabled =
  process.env.TAPIT_HOSTED_DEMO_E2E === "true" &&
  deployment.length > 0 &&
  !/prod/i.test(deployment) &&
  Boolean(process.env.TAPIT_HOSTED_DEMO_ADMIN_EMAIL) &&
  Boolean(process.env.TAPIT_HOSTED_DEMO_ADMIN_PASSWORD);

test.skip(
  !hostedDemoEnabled,
  "Set TAPIT_HOSTED_DEMO_E2E=true with an explicitly named non-production Convex deployment and hosted admin credentials.",
);

const adminEmail = process.env.TAPIT_HOSTED_DEMO_ADMIN_EMAIL ?? "";
const adminPassword = process.env.TAPIT_HOSTED_DEMO_ADMIN_PASSWORD ?? "";

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password", { exact: true }).fill(adminPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
}

async function closeContext(context: BrowserContext) {
  await context.close();
}

test("hosted card claim publishes across two browser contexts", async ({ browser, page }) => {
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  const token = `hosted-e2e-${Date.now().toString(36)}`;
  const email = `hosted-${Date.now().toString(36)}@example.test`;
  const password = "hosted-demo-password";

  try {
    await signInAsAdmin(page);

    // Provision the customer and retain the one-time setup link displayed by
    // the admin UI; no Auth or application records are written from the test.
    await page.getByLabel("Customer email").fill(email);
    await page.getByLabel("Initial profile name").fill("Hosted E2E owner");
    await page.getByLabel("Profile slug").fill(token);
    await page.getByRole("button", { name: "Create and invite" }).click();
    await expect(page.getByText(/Customer account created for/)).toBeVisible();
    const setupText = await page.getByText(/One-time setup link:/).textContent();
    const setupPath = setupText?.match(/\/setup\/[^\s]+/)?.[0];
    expect(setupPath).toBeTruthy();

    await page.getByRole("link", { name: "Cards", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Card registry" })).toBeVisible();
    const cardUrl = `/c/${token}`;
    await page.getByLabel("Pre-encoded card URL").fill(cardUrl);
    await page.getByRole("button", { name: "Register card" }).click();
    await expect(page.getByRole("dialog", { name: "Confirm card attachment" })).toBeVisible();
    await page
      .getByRole("dialog", { name: "Confirm card attachment" })
      .getByRole("button", { name: "Confirm attachment" })
      .click();
    await expect(page.getByText(/is claimable and attached/)).toBeVisible();

    const card = page.locator("article").filter({ hasText: token }).first();
    await card.locator("summary").click();
    await card.getByRole("button", { name: "Generate claim code" }).click();
    const claimCode = (await card.locator("code").textContent())?.trim();
    expect(claimCode).toMatch(/^[A-Z0-9]{8}$/);

    // Signed-out access is deliberately generic and does not contain the
    // profile draft before authentication or claim completion.
    await customerPage.goto(cardUrl);
    await expect(
      customerPage.getByRole("heading", { name: "Are you the owner of this card?" }),
    ).toBeVisible();
    await expect(customerPage.getByText("Hosted E2E owner")).toHaveCount(0);
    await expect(customerPage).toHaveURL(new RegExp(`/c/${token}$`));

    await customerPage.goto(setupPath as string);
    await customerPage.getByLabel("Password", { exact: true }).fill(password);
    await customerPage.getByLabel("Confirm password").fill(password);
    await customerPage.getByRole("button", { name: "Set password" }).click();
    await expect(customerPage).toHaveURL(/\/app\/profile$/);

    await customerPage.goto(cardUrl);
    await expect(customerPage.getByLabel("Claim code")).toBeVisible();
    await customerPage.getByLabel("Claim code").fill("INVALID1");
    await customerPage.getByRole("button", { name: "Claim this card" }).click();
    await expect(
      customerPage.getByText("That code is invalid, expired, used, or unavailable."),
    ).toBeVisible();
    await customerPage.getByLabel("Claim code").fill(claimCode as string);
    await customerPage.getByRole("button", { name: "Claim this card" }).click();
    await expect(customerPage).toHaveURL(/\/app\/profile$/);
    await customerPage.getByRole("button", { name: "Publish" }).click();
    await expect(customerPage.getByText(/Profile published/)).toBeVisible();

    // The token is unchanged and the admin's reactive card view observes the
    // activation/publication performed by the other context.
    await page.goto(`/admin/cards`);
    await expect(
      page.locator("article").filter({ hasText: token }).getByText("active"),
    ).toBeVisible();
    await customerPage.goto(cardUrl);
    await expect(customerPage.getByRole("heading", { name: "Hosted E2E owner" })).toBeVisible();
    await expect(customerPage).toHaveURL(new RegExp(`/c/${token}$`));
  } finally {
    await closeContext(customerContext);
  }
});
