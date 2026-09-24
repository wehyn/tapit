import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

async function prepareLegacyMaraProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Legacy profile migration test.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected the demo state to be persisted before legacy setup.");
    const state = JSON.parse(raw);
    const customer = state.customers.find(
      (candidate: { email?: string }) => candidate.email === "mara@example.test",
    );
    const stripCustomization = (profile: {
      id?: string;
      draft?: object;
      published?: object | null;
    }) => {
      if (profile.id !== customer?.profileId) return profile;
      const draft = { ...profile.draft } as { customization?: unknown };
      delete draft.customization;
      const next = { ...profile, draft } as typeof profile & { published?: object | null };
      if (profile.published) {
        const published = { ...profile.published } as { customization?: unknown };
        delete published.customization;
        next.published = published;
      }
      return next;
    };
    state.profiles = state.profiles.map(stripCustomization);
    state.profile = stripCustomization(state.profile);
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await signInAsCustomer(page);
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

  const desktopNavigation = page.getByRole("navigation", {
    name: "Your Tapit profile navigation",
  });
  await expect(desktopNavigation).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Personal" })).toBeVisible();
  for (const label of ["Profile", "Links", "Build card", "Analytics", "Account"]) {
    await expect(desktopNavigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Cards", exact: true })).toHaveCount(0);

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
  await page.keyboard.press("Escape");
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

test("customer customization drafts stay private until the profile is published", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page.goto("/app/profile");
  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("radio", { name: "Editorial" }).check();
  await page.getByRole("combobox", { name: "Featured link" }).selectOption("booking");
  await page.getByRole("radio", { name: "About", exact: true }).check();
  await page.getByLabel("About copy").fill("A private draft introduction.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft introduction.")).toHaveCount(0);
  const bookingLink = page.getByRole("link", { name: "Book a conversation" });
  await expect(bookingLink).toBeVisible();
  await expect(bookingLink).not.toHaveAttribute("data-featured", "true");

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  const aboutDisclosure = page.locator("summary").filter({ hasText: "About" });
  await expect(aboutDisclosure).toHaveAttribute("aria-expanded", "false");
  await aboutDisclosure.focus();
  await expect(aboutDisclosure).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(aboutDisclosure).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("A private draft introduction.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a conversation" })).toHaveAttribute(
    "data-featured",
    "true",
  );
});

test("legacy profiles opt into Warm Studio before the new presentation is published", async ({
  page,
}) => {
  await prepareLegacyMaraProfile(page);

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("navigation", { name: "Contact actions" })).toHaveCount(0);

  await page.goto("/app/profile");
  await expect(page.getByRole("button", { name: "Use Warm Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Use Warm Studio" }).click();
  await expect(page.getByRole("radio", { name: "Warm Studio", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("navigation", { name: "Contact actions" })).toBeVisible();
  await expect(page.locator("main")).toHaveClass(/bg-\[#fbf6ef\]/);
});

test("customer can configure bounded profile media and publish it", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");

  await page.getByRole("button", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Background image description").fill("Warm studio backdrop");
  await page.getByLabel("Hero height: 320px").fill("420");
  await page.getByLabel("Crop horizontal position: 50%").fill("30");
  await page.getByLabel("Crop vertical position: 50%").fill("65");

  const slideshowInput = page.getByLabel("Upload slideshow images");
  await slideshowInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Slideshow image 1 description").fill("Studio detail one");
  await slideshowInput.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByLabel("Slideshow image 2 description").fill("Studio detail two");
  await expect(page.getByText("2 of 10 images")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("region", { name: "Profile hero" })).toHaveCount(0);

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Profile slideshow" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Studio detail one" })).toBeVisible();
    await expect(page.locator("main")).toHaveClass(/bg-\[#fbf6ef\]/);
  }
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
  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/jpeg;base64,/);

  await imageInput.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);
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
