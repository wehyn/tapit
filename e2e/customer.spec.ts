import { expect, test, type Page } from "@playwright/test";

async function signInAsCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password").fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

test("customer build card stays inside the authenticated workspace", async ({ page }) => {
  await signInAsCustomer(page);

  await page.getByRole("link", { name: "Build card", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/account\/build-card$/);
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /Your Tapit profile navigation/ }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
});

test("customer sidebar stays grouped and usable across desktop and mobile", async ({ page }) => {
  await signInAsCustomer(page);
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();

  const desktopNavigation = page.getByRole("navigation", {
    name: "Your Tapit profile navigation",
  });
  await expect(desktopNavigation).toBeVisible();
  await expect(page.getByText("Customer workspace", { exact: true })).toHaveCount(0);
  await expect(desktopNavigation.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Personal" })).toBeVisible();
  for (const label of ["Profile", "Links", "Build card", "Analytics", "Account"]) {
    await expect(desktopNavigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(desktopNavigation.getByRole("link", { name: "Admin workspace" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cards", exact: true })).toHaveCount(0);
  const desktopAccountMenu = page.getByRole("button", {
    name: "Account menu for mara@example.test",
  });
  const signOutButton = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(desktopAccountMenu).toBeVisible();
  await expect(signOutButton).toHaveCount(0);
  await desktopAccountMenu.click();
  await expect(signOutButton).toBeVisible();
  const nextDevPortal = page.locator("nextjs-portal");
  if (await nextDevPortal.count()) {
    await nextDevPortal.evaluate((portal) => {
      (portal as HTMLElement).style.display = "none";
    });
  }
  await page.getByRole("group", { name: "Account options" }).screenshot({
    path: "test-results/customer-account-menu.png",
  });
  await page.keyboard.press("Escape");
  await expect(signOutButton).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/profile");
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  await expect(openNavigation).toHaveAttribute("aria-expanded", "false");
  await openNavigation.click();
  const drawerNavigation = page.getByRole("navigation", {
    name: "Your Tapit profile navigation",
  });
  await expect(drawerNavigation).toBeVisible();
  await expect(
    drawerNavigation.getByRole("link", { name: "Build card", exact: true }),
  ).toBeVisible();
  const mobileAccountMenu = page.getByRole("button", {
    name: "Account menu for mara@example.test",
  });
  await expect(mobileAccountMenu).toBeVisible();
  await mobileAccountMenu.click();
  await expect(signOutButton).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(signOutButton).toHaveCount(0);
  await expect(openNavigation).toBeFocused();
  await expect(openNavigation).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await openNavigation.click();
  await drawerNavigation.getByRole("link", { name: "Build card", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/account\/build-card$/);
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

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

  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Edit your details and see how your profile looks to others.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("These controls stay deliberately small so every theme remains readable.", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Bio or role").fill("A private draft bio");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByText("Brand systems for independent teams.")).toBeVisible();
  await expect(page.getByText("A private draft bio")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/links");
  await expect(page.getByRole("heading", { name: "Your links", exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Add and organize destinations such as Portfolio or TikTok. Use valid HTTPS links; email and phone actions can use mailto: or tel:.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "When enabled and published, active NFC and QR card visits are counted, then sent to your destination.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "phone" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "desktop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const linkedinIcon = page.locator("#linkedin-icon");
  await linkedinIcon.selectOption("mail");
  await expect(linkedinIcon).toHaveValue("mail");
  const desktopButton = page.getByRole("button", { name: "desktop" });
  await desktopButton.click();
  await expect(desktopButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "phone" }).click();
  await expect(page.getByRole("button", { name: "phone" })).toHaveAttribute("aria-pressed", "true");

  const addLinkButton = page.getByRole("button", { name: "Add link" });
  await addLinkButton.click();
  const editableLinks = page.locator('[aria-label="Editable profile links"]');
  const labels = editableLinks.locator('input[id$="-label"]');
  const destinations = editableLinks.locator('input[id$="-destination"]');
  await expect(labels.last()).toBeVisible();
  await labels.last().fill("Private note");
  await destinations.last().fill("https://contact.example.test");
  const privateNoteEnabled = page.getByRole("checkbox", { name: "Enable Private note" });
  await expect(privateNoteEnabled).toBeChecked();
  await privateNoteEnabled.uncheck({ force: true });
  await expect(privateNoteEnabled).not.toBeChecked();
  await page.locator('summary[aria-label="Actions for Private note"]').click();
  await expect(page.getByRole("button", { name: "Move up" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Move down" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect(labels.nth(3)).toHaveValue("Private note");

  await addLinkButton.click();
  const deleteMeLabel = labels.last();
  await deleteMeLabel.fill("Delete me");
  await page.locator('summary[aria-label="Actions for Delete me"]').click();
  await page
    .locator("details")
    .filter({ has: page.locator('summary[aria-label="Actions for Delete me"]') })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("textbox", { name: "Label for Delete me" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Links saved to draft.")).toBeVisible();
  await page.goto("/app/links");
  await expect(labels.nth(3)).toHaveValue("Private note");
  await expect(page.getByRole("textbox", { name: "Label for Private note" })).toHaveValue(
    "Private note",
  );
  await expect(page.getByRole("checkbox", { name: "Enable Private note" })).not.toBeChecked();
  await expect(page.locator("#linkedin-icon")).toHaveValue("mail");
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(
    page.getByText("The public profile now uses this order and enabled state."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft bio")).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);
});

test("customer can cancel or apply a square profile photo crop", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  const photo = page.getByRole("img", { name: "Mara Velasquez profile" }).first();
  const previousSource = await photo.getAttribute("src");
  const imageInput = page.getByLabel("Profile photo or logo");
  await imageInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  const cropDialog = page.getByRole("dialog", { name: "Adjust profile photo" });
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", previousSource ?? "");

  await imageInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await expect(page.getByRole("status", { name: "Photo applied" })).toBeVisible();

  await imageInput.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);
});

test("customer analytics and account controls stay scoped to the customer", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await expect(page.getByText("Profile views")).toBeVisible();
  for (const copy of [
    "Aggregate activity for your profile only. Tapit does not expose visitor identities or raw visit history.",
    "Each column is one aggregate time bucket. Views and clicks are shown together to make momentum easy to read.",
    "Aggregate totals for the selected range",
    "All profile entry paths",
    "Privacy-preserving estimate",
    "Destination selections",
    "Aggregate events by entry path. Historical rows without attribution appear as unknown.",
    "Aggregate events",
    "Clicks are grouped by the link label you chose. Disabled links remain visible here only when they have historical activity.",
  ]) {
    await expect(page.getByText(copy, { exact: true })).toHaveCount(0);
  }
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
