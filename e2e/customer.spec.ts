import { randomBytes } from "node:crypto";

import sharp from "sharp";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  resetDemoHarness,
  setDemoMediaUploadControl,
  signInAsAdmin,
  signInAsCustomer,
} from "./support/demo-harness";

async function readSavedDemoBackground(page: Page): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected saved demo state.");
    const state = JSON.parse(raw) as {
      __tapitMediaDataUrls?: string[];
      profile?: { draft?: { media?: { background?: Record<string, unknown> } } };
      profiles?: Array<{ draft?: { media?: { background?: Record<string, unknown> } } }>;
    };
    const profile = state.profiles?.find((candidate) => candidate.draft?.media?.background);
    const background = profile?.draft?.media?.background ?? state.profile?.draft?.media?.background;
    if (!background) return undefined;
    const url = background.url;
    if (typeof url !== "string" || !url.startsWith("\u0001tapit-media:")) return background;
    const index = Number(url.slice("\u0001tapit-media:".length));
    return { ...background, url: state.__tapitMediaDataUrls?.[index] };
  });
}

async function selectWarmStudio(page: Page) {
  const preset = page.getByRole("radio", { name: "Warm Studio", exact: true });
  await preset.check();
  await expect(preset).toBeChecked();
}

async function openFineTune(page: Page) {
  const fineTune = page.getByText("Fine tune", { exact: true });
  const disclosure = page.locator("details").filter({ has: fineTune });
  if ((await disclosure.getAttribute("open")) === null) {
    await disclosure.locator("summary").click();
  }
  await expect(disclosure).toHaveAttribute("open", "");
}

async function prepareLegacyMaraProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Legacy profile migration test.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
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

test("signing out saves the registered profile draft first", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Saved when signing out.");
  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  const savedBio = await page.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem("tapit:demo-state:v1") ?? "{}");
    return state.profiles?.find((profile: { id: string }) => profile.id === "profile-mara")?.draft
      ?.bio;
  });
  expect(savedBio).toBe("Saved when signing out.");
});

test("desktop sidebar groups customer navigation and pins Account and Help", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const sidebar = page.getByTestId("workspace-sidebar");
  const navigation = sidebar.getByRole("navigation", { name: "Customer navigation" });
  await expect(
    navigation.getByRole("heading", { name: "Your profile", exact: true }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("heading", { name: "Share & grow", exact: true }),
  ).toBeVisible();
  for (const label of ["Profile", "Links", "Customize", "Card", "Analytics"]) {
    await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(sidebar.getByText(/^(Live|Draft)$/)).toHaveCount(0);
  const accountMenu = sidebar.getByRole("button", { name: "Account menu for mara@example.test" });
  await expect(accountMenu).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Account", exact: true })).toBeHidden();
  await accountMenu.click();
  await expect(sidebar.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Help", exact: true })).toHaveAttribute(
    "href",
    /^mailto:/,
  );
  await accountMenu.click();

  for (const [label, path] of [
    ["Links", /\/app\/links$/],
    ["Customize", /\/app\/customize$/],
    ["Card", /\/app\/card$/],
    ["Analytics", /\/app\/analytics$/],
    ["Profile", /\/app\/profile$/],
  ] as const) {
    await sidebar.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(path);
    await expect(sidebar.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await accountMenu.click();
  await sidebar.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
});

test("desktop sidebar links take keyboard focus and navigate", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const links = page.getByTestId("workspace-sidebar").getByRole("link", {
    name: "Links",
    exact: true,
  });
  await links.focus();
  await expect(links).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/app\/links$/);
  await expect(links).toHaveAttribute("aria-current", "page");
});

test("mobile workspace uses a four-tab bar and a More sheet instead of a drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const tabBar = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const label of ["Profile", "Links", "Stats"]) {
    await expect(tabBar.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  const more = tabBar.getByRole("button", { name: "More", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("workspace-sidebar")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveCount(0);

  await more.click();
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await expect(sheet).toBeVisible();
  for (const label of ["Customize", "Card", "Account"]) {
    await expect(sheet.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(sheet.getByRole("link", { name: "Help", exact: true })).toHaveAttribute(
    "href",
    /^mailto:/,
  );
  await expect(sheet.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

  await sheet.getByRole("link", { name: "Card", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/card$/);
  await expect(sheet).toHaveCount(0);
});

test("mobile More opens as a dialog, and Escape or Close returns focus to More", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const more = page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true });
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await more.click();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(more).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();

  await more.click();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toBeFocused();
});

test("customer can sign out from the More sheet on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("button", { name: "Sign out", exact: true })
    .click();

  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);
  expect(
    await page.evaluate(() => window.localStorage.getItem("tapit:demo-session:v1")),
  ).toBeNull();
});

test("the old build-card path permanently redirects to Card", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const redirect = await page.request.get("/app/account/build-card", { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);

  await page.goto("/app/account/build-card");
  await expect(page).toHaveURL(/\/app\/card$/);
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await expect(
    page.getByTestId("workspace-sidebar").getByRole("link", { name: "Card", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Card", { exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("profile setup card links open steps to Links and Customize", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Profile setup checklist test.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected saved demo state after sign-in.");
    const state = JSON.parse(raw);
    const customer = state.customers.find(
      (candidate: { email?: string }) => candidate.email === "mara@example.test",
    );
    const incomplete = (profile: { id?: string; draft?: object }) => {
      if (profile.id !== customer?.profileId || !profile.draft) return profile;
      const draft = { ...profile.draft } as {
        customization?: unknown;
        links: { enabled: boolean }[];
      };
      delete draft.customization;
      draft.links = draft.links.map((link, index) => ({ ...link, enabled: index === 0 }));
      return { ...profile, draft };
    };
    state.profiles = state.profiles.map(incomplete);
    state.profile = incomplete(state.profile);
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/app/profile");

  await expect(page.getByText("Finish your profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Profile setup progress" })).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  await expect(page.getByRole("link", { name: /Add a photo/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Add three links/ })).toHaveAttribute(
    "href",
    "/app/links",
  );
  await expect(page.getByRole("link", { name: /Choose a look/ })).toHaveAttribute(
    "href",
    "/app/customize",
  );
  await page.getByRole("link", { name: /Choose a look/ }).click();
  await expect(page).toHaveURL(/\/app\/customize$/);
});

test("a failed draft save keeps the customer signed in when they try to sign out", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Draft that could not be saved.");
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "tapit:demo-state:v1") {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Account menu for mara@example.test" }),
  ).toBeVisible();
  await expect(page.getByLabel("Bio or role")).toHaveValue("Draft that could not be saved.");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  const savedSession = await page.evaluate(() =>
    window.localStorage.getItem("tapit:demo-session:v1"),
  );
  expect(savedSession).toContain("mara@example.test");
});

test("sign out stays blocked while a link draft has a validation error", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const destination = page.getByLabel("Destination for LinkedIn");
  await destination.fill("not-a-url");
  await expect(
    page.getByText("Link destination must be a valid HTTPS, mailto, or tel address."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/links$/);
  await expect(destination).toHaveValue("not-a-url");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your draft could not be saved. You are still signed in." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account menu for mara@example.test" }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("tapit:demo-session:v1"))).toContain(
    "mara@example.test",
  );
});

test("sidebar navigation can save a repaired media draft or continue after repair", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  const description = page.getByLabel("Background image description");
  await description.fill("");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toBeVisible();

  const linksNavigation = page
    .getByRole("navigation", { name: "Customer navigation" })
    .getByRole("link", { name: "Links", exact: true });
  await linksNavigation.click();
  const saveAndContinue = page.getByRole("button", { name: "Save and continue to Links" });
  await expect(saveAndContinue).toBeVisible();
  await expect(page).toHaveURL(/\/app\/customize$/);

  await description.fill("Warm studio backdrop");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toContainText(
    "Visitors still see the last published version.",
  );
  await expect(saveAndContinue).toHaveCount(0);

  await description.fill("");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toBeVisible();
  await linksNavigation.click();
  await expect(saveAndContinue).toBeVisible();
  await description.fill("Warm studio backdrop");
  await saveAndContinue.click();

  await expect(page).toHaveURL(/\/app\/links$/);
  await expect(page.getByRole("button", { name: "Add link", exact: true })).toBeVisible();
});

test("slideshow validation blocks publish and navigation, then focuses the slideshow repair", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Slideshow" }).click();
  await page
    .getByLabel("Upload slideshow images")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  const description = page.getByLabel("Slideshow image 1 description");
  await description.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Expected the slideshow description input.");
    }
    element.maxLength = 200;
  });
  await description.fill("x".repeat(161));
  const validationMessage = "Slideshow image 1 description must be at most 160 characters.";
  const validationError = page.getByText(validationMessage, { exact: true });
  await expect(validationError).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();

  const publishButton = page.getByRole("button", { name: "Publish changes", exact: true });
  await expect(publishButton).toBeEnabled();
  await publishButton.click();
  const requirementsDialog = page.getByRole("dialog", { name: "Before you publish" });
  await expect(requirementsDialog).toBeVisible();
  await expect(requirementsDialog.getByText(validationMessage, { exact: true })).toBeVisible();
  const openCustomize = requirementsDialog.getByRole("link", { name: "Open Customize" });
  await expect(openCustomize).toHaveAttribute("href", "/app/customize?section=slideshow");
  await openCustomize.click();

  const slideshowTab = page.getByRole("tab", { name: "Slideshow" });
  const slideshowPanel = page.getByRole("tabpanel", { name: "Slideshow", exact: true });
  await expect(requirementsDialog).toBeHidden();
  await expect(page).toHaveURL(/\/app\/customize(?:\?section=slideshow)?$/);
  await expect(slideshowTab).toHaveAttribute("aria-selected", "true");
  await expect(slideshowPanel).toBeFocused();
  await expect(slideshowPanel.getByText(validationMessage, { exact: true })).toBeVisible();

  const linksNavigation = page
    .getByRole("navigation", { name: "Customer navigation" })
    .getByRole("link", { name: "Links", exact: true });
  await linksNavigation.click();
  const saveAndContinue = page.getByRole("button", { name: "Save and continue to Links" });
  await expect(saveAndContinue).toBeVisible();
  await expect(page).toHaveURL(/\/app\/customize(?:\?section=slideshow)?$/);
  await expect(slideshowTab).toHaveAttribute("aria-selected", "true");
  await expect(slideshowPanel).toBeFocused();
  await expect(slideshowPanel.getByText(validationMessage, { exact: true })).toBeVisible();

  await description.fill("Accessible slideshow detail");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(saveAndContinue).toHaveCount(0);
});

test("profile navigation recovery mounts and focuses the slideshow repair", async ({ page }) => {
  await openSlideshowEditor(page);
  await page
    .getByLabel("Upload slideshow images")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await page.getByLabel("Slideshow image 1 description").fill("Accessible slideshow detail");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  await page.goto("/app/profile");
  await page.evaluate(() => {
    const isRecord = (value: unknown): value is Record<string, unknown> =>
      value !== null && typeof value === "object" && !Array.isArray(value);
    const invalidateDraft = (profile: unknown) => {
      if (!isRecord(profile) || !isRecord(profile.draft) || !isRecord(profile.draft.media)) {
        throw new Error("Expected a saved slideshow draft.");
      }
      const slides = profile.draft.media.slideshow;
      if (!Array.isArray(slides) || !isRecord(slides[0])) {
        throw new Error("Expected a saved slideshow image.");
      }
      slides[0].altText = "x".repeat(161);
    };
    const savedState = window.localStorage.getItem("tapit:demo-state:v1");
    if (savedState === null) throw new Error("Expected saved demo state.");
    const state: unknown = JSON.parse(savedState);
    if (!isRecord(state) || !isRecord(state.profile) || !Array.isArray(state.profiles)) {
      throw new Error("Expected a saved demo profile.");
    }
    const profileId = state.profile.id;
    invalidateDraft(state.profile);
    for (const profile of state.profiles) {
      if (isRecord(profile) && profile.id === profileId) invalidateDraft(profile);
    }
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();

  const linksNavigation = page
    .getByRole("navigation", { name: "Customer navigation" })
    .getByRole("link", { name: "Links", exact: true });
  await linksNavigation.click();
  await expect(page.getByRole("button", { name: "Save and continue to Links" })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/profile$/);

  const slideshowTab = page.getByRole("tab", { name: "Slideshow" });
  const slideshowPanel = page.getByRole("tabpanel", { name: "Slideshow", exact: true });
  await expect(slideshowTab).toHaveAttribute("aria-selected", "true");
  await expect(slideshowPanel).toBeFocused();
  await expect(
    slideshowPanel.getByText("Slideshow image 1 description must be at most 160 characters.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("editor actions stay beside the preview on desktop and fit on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 899 });
  await signInAsCustomer(page);

  for (const route of ["/app/profile", "/app/links"]) {
    await page.setViewportSize({ width: 1280, height: 899 });
    await page.goto(route);
    let editorControl: Locator;
    if (route === "/app/profile") {
      await page.getByLabel("Bio or role").fill("Layout preview draft");
      editorControl = page.getByLabel("Name");
      const nameBox = await page.getByLabel("Name").boundingBox();
      const bioBox = await page.getByLabel("Bio or role").boundingBox();
      expect(nameBox).not.toBeNull();
      expect(bioBox).not.toBeNull();
      expect(bioBox!.height).toBeLessThanOrEqual(nameBox!.height * 2);
    } else {
      await page.getByRole("textbox", { name: "Label for Portfolio" }).fill("Layout preview draft");
      editorControl = page.getByRole("textbox", { name: "Label for Layout preview draft" });
    }
    const preview = page.getByRole("heading", { name: "Preview", exact: true });
    const save = page.getByRole("button", { name: "Save draft", exact: true });
    const publish = page.getByRole("button", {
      name: /^(?:Publish(?: changes)?|Published)$/,
    });
    await expect(preview).toBeVisible();
    await expect(save).toBeVisible();
    await expect(publish).toBeVisible();

    if (route === "/app/profile") {
      const profileUrl = page
        .locator("#workspace-preview")
        .getByRole("link", { name: "/mara-velasquez", exact: true });
      const urlTextCenter = await profileUrl.evaluate((anchor) => {
        const range = document.createRange();
        range.selectNodeContents(anchor);
        const bounds = range.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      });
      const urlIcon = profileUrl.locator("xpath=../..").locator("svg").first();
      const urlIconBounds = await urlIcon.boundingBox();
      expect(urlIconBounds).not.toBeNull();
      expect(
        Math.abs(urlTextCenter - (urlIconBounds!.y + urlIconBounds!.height / 2)),
      ).toBeLessThanOrEqual(2);
    }

    const previewFrame = page.locator("#workspace-preview");
    const previewBox = await previewFrame.boundingBox();
    const editorBox = await editorControl.boundingBox();
    const saveBox = await save.boundingBox();
    const publishBox = await publish.boundingBox();
    expect(previewBox).not.toBeNull();
    expect(editorBox).not.toBeNull();
    expect(previewBox!.x).toBeGreaterThan(editorBox!.x + editorBox!.width);
    expect(
      previewBox!.y < editorBox!.y + editorBox!.height &&
        previewBox!.y + previewBox!.height > editorBox!.y,
    ).toBe(true);
    expect(saveBox).not.toBeNull();
    expect(publishBox).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1280,
    );

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 700 });
      await expect(preview).toBeHidden();
      const previewSwitch = page.getByRole("button", { name: "Preview", exact: true });
      await expect(previewSwitch).toBeVisible();
      await previewSwitch.click();
      await expect(preview).toBeVisible();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(save).toBeInViewport();
      await expect(publish).toBeInViewport();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    }
  }
});

test("customer workspace switches between editing and preview on mobile without losing drafts", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  for (const route of ["/app/profile", "/app/customize", "/app/links"] as const) {
    await page.goto(route);
    if (route === "/app/profile") {
      await page.getByLabel("Bio or role").fill("Draft survives preview switching");
    } else if (route === "/app/customize") {
      await openFineTune(page);
      await page.getByRole("radio", { name: "Coral", exact: true }).check();
    } else {
      await page.getByRole("textbox", { name: "Label for Portfolio" }).fill("Portfolio draft");
    }

    await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeVisible();
    if (route === "/app/profile")
      await page.screenshot({ path: "test-results/customer-workbench-preview-390.png" });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    if (route === "/app/profile")
      await expect(page.getByLabel("Bio or role")).toHaveValue("Draft survives preview switching");
    else if (route === "/app/customize")
      await expect(page.getByRole("radio", { name: "Coral", exact: true })).toBeChecked();
    else if (route === "/app/links")
      await expect(page.getByRole("textbox", { name: "Label for Portfolio draft" })).toHaveValue(
        "Portfolio draft",
      );
    await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.reload();
    if (route === "/app/profile")
      await expect(page.getByLabel("Bio or role")).toHaveValue("Draft survives preview switching");
    else if (route === "/app/customize") {
      await openFineTune(page);
      await expect(page.getByRole("radio", { name: "Coral", exact: true })).toBeChecked();
    } else if (route === "/app/links")
      await expect(page.getByRole("textbox", { name: "Label for Portfolio draft" })).toHaveValue(
        "Portfolio draft",
      );
  }
});

test("profile preview can be reached from the editor switch on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  await page.goto("/app/profile");

  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeHidden();
  const previewSwitch = page.getByRole("button", { name: "Preview", exact: true });
  await expect(previewSwitch).toBeVisible();
  await previewSwitch.click();
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/profile");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({
    path: "test-results/ui-redesign/customer-profile-web-preview-shortcut.png",
  });
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeInViewport();
  await page.screenshot({ path: "test-results/ui-redesign/customer-profile-web-preview.png" });
});

test("profile draft actions only appear when a draft needs action", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  for (const route of ["/app/profile", "/app/customize"] as const) {
    await page.goto(route);

    const actions = page.getByRole("region", { name: "Draft actions", exact: true });
    await expect(actions).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);

    if (route === "/app/profile") {
      await page.getByLabel("Bio or role").fill("Draft action bar test");
    } else {
      await selectWarmStudio(page);
      await openFineTune(page);
      await page.getByRole("radio", { name: "Coral", exact: true }).check();
    }

    await expect(actions).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
    ).toBeVisible();
  }
});

test("customize keeps the private draft preview clear of the fixed action toolbar", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  const overlaps = (
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number },
  ) =>
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;

  for (const viewport of [
    { width: 1467, height: 899 },
    { width: 1280, height: 899 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/customize");
    await selectWarmStudio(page);
    await openFineTune(page);
    await page.getByRole("radio", { name: "Coral", exact: true }).check();

    const previewHeading = page.getByRole("heading", { name: "Preview", exact: true });
    if (viewport.width < 1280) {
      await expect(previewHeading).toBeHidden();
      await expect(page.getByRole("button", { name: "Preview", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Preview", exact: true }).click();
    }
    await expect(previewHeading).toBeVisible();
    await expect(
      page.getByText("Only you can see this draft until you publish it.", { exact: true }),
    ).toBeVisible();

    const actions = page.getByRole("region", { name: "Draft actions", exact: true });
    const saveContact = page
      .locator("#workspace-preview")
      .getByRole("button", { name: "Save contact", exact: true });
    const copyUrl = page.getByRole("button", { name: "Copy URL", exact: true });
    await expect(
      page.locator("#workspace-preview").getByRole("link", { name: "/mara-velasquez" }),
    ).toHaveAttribute("target", "_blank");
    if (viewport.width < 1280) {
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.screenshot({ path: "test-results/tapit-customize-preview-mobile-top.png" });
      await expect(actions).toBeHidden();
      await saveContact.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await expect(saveContact).toBeInViewport();
      await copyUrl.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await expect(copyUrl).toBeInViewport();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(actions).toBeVisible();
    } else {
      await expect(actions).toBeVisible();
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.screenshot({ path: "test-results/tapit-customize-preview-desktop-top.png" });
      await saveContact.evaluate((element) => element.scrollIntoView({ block: "center" }));

      const actionBox = await actions.boundingBox();
      const saveContactBox = await saveContact.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(saveContactBox).not.toBeNull();
      expect(overlaps(saveContactBox!, actionBox!)).toBe(false);

      await copyUrl.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const copyUrlBox = await copyUrl.boundingBox();
      const updatedActionBox = await actions.boundingBox();
      expect(copyUrlBox).not.toBeNull();
      expect(updatedActionBox).not.toBeNull();
      expect(
        overlaps(copyUrlBox!, updatedActionBox!),
        `URL control overlapped the draft bar at ${viewport.width}px: ${JSON.stringify({ copyUrlBox, updatedActionBox })}`,
      ).toBe(false);
    }

    if (viewport.width >= 1280) {
      await expect(copyUrl).toBeVisible();
      await page.screenshot({ path: "test-results/tapit-customize-preview-desktop-actions.png" });
    } else {
      await page.screenshot({ path: "test-results/tapit-customize-preview-mobile-actions.png" });
    }
  }
});

test("customize does not offer a published-profile link before first publication", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Saved before first publication.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.", { exact: false })).toBeVisible();
  await page.evaluate(() => {
    const serialized = window.localStorage.getItem("tapit:demo-state:v1");
    if (!serialized) throw new Error("The local demo state should be available after sign-in.");
    const state = JSON.parse(serialized);
    const customer = state.customers.find(
      (candidate: { email?: string }) => candidate.email === "mara@example.test",
    );
    const unpublish = (profile: { id?: string; status?: string; published?: unknown }) =>
      profile.id === customer?.profileId
        ? { ...profile, status: "unpublished", published: null }
        : profile;
    state.profiles = state.profiles.map(unpublish);
    if (state.profile) state.profile = unpublish(state.profile);
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/app/customize");

  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy URL", exact: true })).toHaveCount(0);
});

test("customer card page stays inside the authenticated workspace", async ({ page }) => {
  await signInAsCustomer(page);

  await page
    .getByTestId("workspace-sidebar")
    .getByRole("link", { name: "Card", exact: true })
    .click();

  await expect(page).toHaveURL(/\/app\/card$/);
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Customer navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
});

test("customer analytics groups events into fixed selected-range periods", async ({ page }) => {
  await resetDemoHarness(page);
  await page.clock.install({ time: new Date("2026-05-20T12:00:00Z") });
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Analytics fixture setup");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected demo state after sign-in.");
    const state = JSON.parse(raw);
    state.analytics = [
      {
        profileId: "profile-mara",
        bucketStart: Date.UTC(2026, 4, 19),
        views: 2,
        uniqueViews: 2,
        clicks: 1,
        linkClicks: { portfolio: 1 },
      },
      {
        profileId: "profile-mara",
        bucketStart: Date.UTC(2026, 4, 6),
        views: 3,
        uniqueViews: 2,
        clicks: 2,
        linkClicks: { portfolio: 2 },
      },
      {
        profileId: "profile-mara",
        bucketStart: Date.UTC(2026, 3, 21),
        views: 5,
        uniqueViews: 4,
        clicks: 1,
        linkClicks: { portfolio: 1 },
      },
      {
        profileId: "profile-mara",
        bucketStart: Date.UTC(2026, 0, 19),
        views: 7,
        uniqueViews: 5,
        clicks: 3,
        linkClicks: { portfolio: 3 },
      },
    ];
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/app/analytics");

  const trend = page.getByLabel("Aggregate engagement trend");
  await page.getByLabel("Time range").selectOption("7d");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("2");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("1");
  expect.soft(await trend.getByText("0", { exact: true }).count()).toBe(6);
  for (const day of [14, 15, 16, 17, 18, 19, 20])
    expect.soft(await trend.innerText()).toContain(`May ${day}`);
  await page.getByLabel("Time range").selectOption("30d");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("10");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("4");
  expect.soft(await trend.getByText("0", { exact: true }).count()).toBe(2);
  expect.soft(await trend.innerText()).toContain("Apr 20");
  expect.soft(await trend.innerText()).toContain("May 18");
  await page.getByLabel("Time range").selectOption("90d");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("10");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("4");
  expect.soft(await trend.getByText("0", { exact: true }).count()).toBe(11);
  expect.soft(await trend.innerText()).toContain("Feb 19");
  expect.soft(await trend.innerText()).toContain("May 20");
  await page.getByLabel("Time range").selectOption("lifetime");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("17");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("7");
  expect.soft(await trend.getByText("0", { exact: true }).count()).toBe(2);
  expect.soft(await trend.innerText()).toContain("Jan");
  expect.soft(await trend.innerText()).toContain("May");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("17");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("7");
});

test("customization category tabs and fine-tuning controls stay clear on mobile", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await expect(page.getByRole("radio", { name: "Warm Studio", exact: true })).toBeVisible();
  const fineTune = page.getByText("Fine tune", { exact: true });
  await expect(fineTune).toBeVisible();
  const fineTuneDisclosure = page.locator("details").filter({ has: fineTune });
  await expect(fineTuneDisclosure).not.toHaveAttribute("open", "");
  await fineTuneDisclosure.locator("summary").click();
  await expect(fineTuneDisclosure).toHaveAttribute("open", "");
  await expect(page.getByRole("radio", { name: "Coral", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Editorial", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Outlined", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Identity" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Media" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Layout" })).toBeVisible();
  await page.getByRole("tab", { name: "Identity" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Media" })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("standalone card builder keeps its public shell and opens the order form", async ({
  page,
}) => {
  await signInAsCustomer(page);
  await page.goto("/build-card");

  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Customer navigation/ })).toHaveCount(0);
  const heading = page.getByRole("heading", { name: "Bring your card to life" });
  await expect(heading).toBeVisible();
  await expect
    .poll(() => heading.evaluate((element) => getComputedStyle(element).fontFamily))
    .toMatch(/system-ui|sans-serif|Arial/i);

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }

  await page
    .getByLabel("Upload your design")
    .setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  const preview = page.getByRole("dialog", { name: "Looks good?" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("img", { name: "Preview of transparent-logo.png" })).toBeVisible();
  await preview.getByRole("button", { name: "Continue to order" }).click();
  await expect(page).toHaveURL(/\/app\/card\/order-card$/);
  await expect(page.getByRole("heading", { name: "Order your card" })).toBeVisible();
});

test("active-card QR downloads remain available without page overflow", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/cards");

  await page.locator("details").filter({ hasText: "mara-card-7f2q" }).locator("summary").click();
  const qrTitle = page.getByText("QR fallback", { exact: true }).first();
  await expect(qrTitle).toBeVisible();
  const qrPanel = qrTitle.locator("xpath=..");
  await expect
    .poll(() => qrPanel.evaluate((panel) => getComputedStyle(panel).backgroundColor))
    .toBe("rgb(240, 243, 249)");
  const png = page.getByRole("link", { name: "Download PNG" }).first();
  await expect(qrPanel).toContainText("/c/mara-card-7f2q?source=qr");
  await expect(png).toHaveAttribute("href", /^data:image\/png;base64,/);
  await expect(png).toHaveAttribute("download", /\.png$/);
  await expect(page.getByRole("button", { name: "Download SVG" }).first()).toBeEnabled();
  await expect
    .poll(() => png.evaluate((anchor) => getComputedStyle(anchor).borderTopLeftRadius))
    .toBe("12px");
  await expect(page.getByRole("img", { name: /QR code for/ }).first()).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await png.scrollIntoViewIfNeeded();
    await expect(png).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
});

test("customer workspace navigation uses Soft Precision surfaces and stays grouped across viewports", async ({
  page,
}) => {
  await signInAsCustomer(page);
  for (const heading of ["Basics", "Contact", "Profile link"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "About or Services", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  const island = page.getByTestId("workspace-sidebar");
  await expect
    .poll(() => island.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(255, 255, 255)");
  const desktopBox = await island.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.width).toBe(248);
  await page.setViewportSize({ width: 1117, height: 900 });
  const sidebarBox = await island.boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(sidebarBox!.x + sidebarBox!.width).toBeLessThan(1117);
  const sidebarProfile = island.getByRole("link", { name: "Profile", exact: true });
  await expect(sidebarProfile).toBeVisible();
  await sidebarProfile.focus();
  await expect(sidebarProfile).toBeFocused();

  const desktopNavigation = island.getByRole("navigation", { name: "Customer navigation" });
  await expect(desktopNavigation).toBeVisible();
  await expect(page.getByText("Customer workspace", { exact: true })).toHaveCount(0);
  await expect(
    desktopNavigation.getByRole("heading", { name: "Your profile", exact: true }),
  ).toBeVisible();
  await expect(
    desktopNavigation.getByRole("heading", { name: "Share & grow", exact: true }),
  ).toBeVisible();
  for (const label of ["Profile", "Links", "Customize", "Card", "Analytics"]) {
    await expect(desktopNavigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await island.getByRole("button", { name: /^Account menu for / }).click();
  await expect(island.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await expect(island.getByRole("link", { name: "Help", exact: true })).toBeVisible();
  await island.getByRole("button", { name: /^Account menu for / }).click();
  await expect(
    desktopNavigation.getByRole("link", { name: "Profile", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(island.getByRole("group", { name: "Workspace" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Cards", exact: true })).toHaveCount(0);
  const desktopAccountMenu = page.getByRole("button", {
    name: "Account menu for mara@example.test",
  });
  const signOutButton = page.getByRole("button", { name: "Sign out", exact: true });
  await expect(desktopAccountMenu).toBeVisible();
  await expect(signOutButton).toHaveCount(0);
  const nextDevPortal = page.locator("nextjs-portal");
  if (await nextDevPortal.count()) {
    await nextDevPortal.evaluate((portal) => {
      (portal as HTMLElement).style.display = "none";
    });
  }
  await desktopAccountMenu.click();
  await expect(signOutButton).toBeVisible();
  await page.screenshot({
    path: "test-results/customer-account-menu.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(signOutButton).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/profile");
  const mobileHeader = page.locator("header").first();
  await expect(mobileHeader).toBeVisible();
  expect(
    await mobileHeader.evaluate((element) => {
      const styles = window.getComputedStyle(element);
      return { position: styles.position, top: styles.top };
    }),
  ).toMatchObject({ position: "static" });
  const moreButton = page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "More", exact: true });
  const moreSheet = page.getByRole("dialog", { name: "More", exact: true });
  await expect(moreButton).toHaveAttribute("aria-expanded", "false");
  await moreButton.click();
  await expect(moreSheet).toBeVisible();
  await expect(moreSheet.getByRole("link", { name: "Card", exact: true })).toBeVisible();
  await expect(moreSheet.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await expect(moreSheet).toHaveCount(0);
  await expect(moreButton).toBeFocused();
  await expect(moreButton).toHaveAttribute("aria-expanded", "false");

  await moreButton.click();
  await moreSheet.getByRole("link", { name: "Card", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/card$/);
  await expect(moreButton).toHaveAttribute("aria-expanded", "false");

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Basics", exact: true })).toBeVisible();
  await expect(moreButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const moreBox = await moreButton.boundingBox();
  expect(moreBox).not.toBeNull();
  expect(moreBox!.height).toBeGreaterThanOrEqual(44);
  await moreButton.click();
  await expect(moreSheet).toBeVisible();
  const sheetBox = await moreSheet.boundingBox();
  expect(sheetBox).not.toBeNull();
  expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await expect(moreButton).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 900 });
  const wideProfileLink = page
    .getByRole("navigation", { name: "Customer navigation" })
    .getByRole("link", { name: "Profile", exact: true });
  await expect(wideProfileLink).toHaveAttribute("aria-current", "page");
});

test("refreshed profile editor and preview preserve draft controls", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInAsCustomer(page);
  for (const heading of ["Basics", "Contact", "Profile link"]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "About or Services", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("link", { name: "Customize", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Soft Precision (Paper)" })).toBeChecked();
  await expect(page.getByTestId("profile-preview-device")).toBeVisible();
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Basics", exact: true })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/system-ui|sans-serif|Arial/i);
  await expect(page.getByLabel("Website", { exact: true })).toBeVisible();
  await expect(page.getByText("Public URL", { exact: true })).toHaveCount(0);
  const frame = page.getByTestId("profile-preview-frame");
  const previewDevice = page.getByTestId("profile-preview-device");
  await expect(previewDevice).toBeVisible();
  await expect(frame).toHaveCSS("max-width", "390px");
  await expect(page.getByRole("button", { name: "desktop", exact: true })).toHaveCount(0);
  await expect(previewDevice).toBeVisible();
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/mara-velasquez");
  await expect(page.getByLabel("Stable profile slug")).toBeDisabled();
  await page.getByLabel("Name", { exact: true }).fill("Mara Studio");
  await page.getByLabel("Bio or role").fill("Brand design for independent teams");
  await page.getByLabel("Email", { exact: true }).fill("studio@example.test");
  await page.getByLabel("Phone", { exact: true }).fill("+63 917 555 0184");
  await expect(frame).toContainText("Mara Studio");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText("Draft saved. Visitors still see the last published version.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({
    path: "test-results/customer-workbench-1280.png",
    fullPage: true,
  });
  for (const width of [1117, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    if (width === 390) {
      await page.screenshot({ path: "test-results/customer-workbench-390.png", fullPage: true });
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
});

test("profile URL copies through the fallback when clipboard access fails", async ({ page }) => {
  await signInAsCustomer(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("Clipboard unavailable")),
    });
    document.execCommand = () => true;
  });
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied" })).toHaveCount(1);
});

test("one-time setup leads to a guarded customer workspace without Cards", async ({ page }) => {
  await page.goto("/setup/demo-setup-token");
  await expect(page.getByRole("heading", { name: "Choose a password" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("new-demo-password");
  await page.getByLabel("Confirm password").fill("new-demo-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
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

test("profile editors show their page title without redundant subtitles", async ({ page }) => {
  await signInAsCustomer(page);

  for (const [route, title, subtitle] of [
    ["/app/profile", "Your profile", "Edit your details and see how your profile looks to others."],
    ["/app/customize", "Customize your profile", "Tune the look and feel of your public profile."],
  ] as const) {
    await page.goto(route);
    const heading = page.getByRole("main").getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    await expect(page.getByText(subtitle, { exact: true })).toHaveCount(0);
  }
});

test("Profile keeps essentials visible and secondary About content collapsed", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Bio or role")).toBeVisible();
  const about = page.getByRole("button", { name: "About or Services", exact: true });
  await expect.soft(about).toHaveAttribute("aria-expanded", "false");
  await expect
    .soft(page.getByText(/Email, phone, and website are managed in Identity/))
    .toHaveCount(0);
  if ((await about.getAttribute("aria-expanded")) === "true") await about.click();
  await about.click();
  await expect(page.getByRole("button", { name: "Add About or Services section" })).toBeVisible();
});

async function addGuidedLink(page: Page, label: string, destination: string) {
  await page.getByRole("button", { name: "Add link", exact: true }).first().click();
  await page.getByRole("button", { name: "Website or link" }).click();
  await page.getByLabel("Label", { exact: true }).fill(label);
  await page.getByLabel("Web address").fill(destination);
  await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
}

test("the link table contains its add action", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  const addLink = linkTable.getByRole("button", { name: "Add link", exact: true });
  await expect(addLink).toBeVisible();
  const originalCount = await linkTable.locator("article").count();
  await addLink.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Website or link" }).click();
  await page.getByLabel("Label", { exact: true }).fill("New site");
  await page.getByLabel("Web address").fill("https://new-site.example.test");
  await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
  await expect(linkTable.locator("article")).toHaveCount(originalCount + 1);
});

test("the Links draft action is hidden while clean and appears after an edit", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Label for Portfolio" }).fill("Portfolio work");
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Label for Portfolio work" })).toHaveValue(
    "Portfolio work",
  );
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toHaveCount(0);
});

for (const navigation of [
  { name: "desktop logo", width: 1440, target: "sidebar" },
  { name: "mobile logo", width: 390, target: "header" },
  { name: "breadcrumb", width: 1440, target: "breadcrumb" },
] as const) {
  test(`saving unsaved link edits before navigation from the ${navigation.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: navigation.width, height: 900 });
    await resetDemoHarness(page);
    await signInAsCustomer(page);
    await page.goto("/app/links");
    await page
      .getByRole("textbox", { name: "Label for Portfolio" })
      .fill(`${navigation.name} draft`);

    const destination =
      navigation.target === "sidebar"
        ? page.getByTestId("workspace-sidebar").getByRole("link", { name: "Tapit home" })
        : navigation.target === "header"
          ? page.locator("header").getByRole("link", { name: "Tapit home" })
          : page
              .getByRole("navigation", { name: "Breadcrumb" })
              .getByRole("link", { name: "Workspace" });
    await destination.click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await page.goto("/app/links");
    await expect(
      page.getByRole("textbox", { name: `Label for ${navigation.name} draft` }),
    ).toHaveValue(`${navigation.name} draft`);
  });
}

test("guided link creation adds email and phone without scheme typing", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");
  const rows = page.locator('[aria-label="Editable profile links"] article');
  await expect(rows.first()).toBeVisible();
  const initialCount = await rows.count();
  await page.getByRole("button", { name: "Add link", exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(rows).toHaveCount(initialCount);

  await page.getByRole("button", { name: "Add link", exact: true }).first().click();
  await page.getByRole("button", { name: "Email address" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Work email");
  await page.getByLabel("Email address", { exact: true }).fill("hello@example.com");
  await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
  await expect(rows.last().locator('input[id$="-destination"]')).toHaveValue("hello@example.com");
  const emailDestination = page.getByRole("textbox", { name: "Destination for Work email" });
  await emailDestination.fill("");
  await emailDestination.fill("updated@example.com");

  await page.getByRole("button", { name: "Add link", exact: true }).first().click();
  await page.getByRole("button", { name: "Phone number" }).click();
  await page.getByLabel("Label", { exact: true }).fill("Call me");
  await page.getByLabel("Phone number", { exact: true }).fill("+1 555 123 4567");
  await page.getByRole("dialog").getByRole("button", { name: "Add link" }).click();
  await expect(rows.last().locator('input[id$="-destination"]')).toHaveValue("+1 555 123 4567");
  const phoneDestination = page.getByRole("textbox", { name: "Destination for Call me" });
  await phoneDestination.fill("");
  await phoneDestination.fill("+15551234567");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Destination for Work email" })).toHaveValue(
    "updated@example.com",
  );
  await expect(page.getByRole("textbox", { name: "Destination for Call me" })).toHaveValue(
    "+15551234567",
  );
  await page.screenshot({
    path: "test-results/tapit-contact-destination-editing.png",
    fullPage: true,
  });
});

test("the last link action menu stays visible above the draft bar", async ({ page }) => {
  await page.setViewportSize({ width: 1467, height: 899 });
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  await addGuidedLink(page, "Last link", "https://last-link.example.test");
  const lastRow = linkTable.locator("article").last();
  await lastRow.locator("summary").click();

  const saveButton = page.getByRole("button", { name: "Save draft", exact: true });
  const saveBox = await saveButton.boundingBox();
  expect(saveBox).not.toBeNull();
  for (const action of ["Move up", "Move down", "Delete"]) {
    const button = lastRow.getByRole("button", { name: action, exact: true });
    await expect(button).toBeVisible();
    await expect(button).toBeInViewport({ ratio: 1 });
    const actionBox = await button.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(saveBox!.y);
  }
});

test("link drag handles reorder destinations", async ({ page }) => {
  await page.setViewportSize({ width: 1467, height: 1200 });
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  const portfolioRow = linkTable
    .locator("article")
    .filter({ has: page.getByRole("textbox", { name: "Label for Portfolio" }) });
  const emailRow = linkTable
    .locator("article")
    .filter({ has: page.getByRole("textbox", { name: "Label for Email" }) });
  const dragHandle = portfolioRow.getByRole("button", { name: "Reorder Portfolio" });
  await expect(dragHandle).toBeVisible();
  await dragHandle.dragTo(emailRow, { targetPosition: { x: 40, y: 64 } });

  const labels = await linkTable
    .locator('input[id$="-label"]')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  expect(labels).toEqual(["LinkedIn", "Book a conversation", "Email", "Portfolio"]);
});

test("Portfolio link can use a new preset icon through publication", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const portfolioIcon = page.getByRole("button", { name: /Preset icon for Portfolio/ });
  await portfolioIcon.click();
  await expect(
    page.getByRole("listbox", { name: "Preset icon for Portfolio" }).getByRole("option"),
  ).toHaveCount(13);
  await page.getByRole("option", { name: "Portfolio / briefcase" }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.goto("/app/links");
  await expect(
    page.getByRole("button", { name: "Preset icon for Portfolio: Portfolio / briefcase" }),
  ).toBeVisible();

  const publishChanges = page.getByRole("button", { name: "Publish changes", exact: true });
  await expect(publishChanges).toBeVisible();
  await publishChanges.click();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("link", { name: "Portfolio" })).toHaveAttribute(
    "data-icon",
    "briefcase",
  );
});

test("link rows shift while the drag is still held", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1467, height: 1200 });
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  const handle = linkTable.getByRole("button", { name: "Reorder LinkedIn" });
  const portfolio = linkTable
    .locator("article")
    .filter({ has: page.getByRole("textbox", { name: "Label for Portfolio" }) });
  const handleBox = await handle.boundingBox();
  const portfolioBox = await portfolio.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(portfolioBox).not.toBeNull();

  const startX = handleBox!.x + handleBox!.width / 2;
  const startY = handleBox!.y + handleBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 12, { steps: 4 });
  await page.mouse.move(portfolioBox!.x + 45, portfolioBox!.y + portfolioBox!.height * 0.75, {
    steps: 8,
  });
  await page.waitForTimeout(250);
  await page.mouse.move(portfolioBox!.x + 46, portfolioBox!.y + portfolioBox!.height * 0.75 + 1);

  const labels = () =>
    linkTable
      .locator('input[id$="-label"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  await expect.poll(labels).toEqual(["Portfolio", "LinkedIn", "Book a conversation", "Email"]);
  const artifact = testInfo.outputPath("links-mid-drag.png");
  await page.screenshot({ path: artifact });
  await testInfo.attach("links-mid-drag", { path: artifact, contentType: "image/png" });
  await page.mouse.up();
  await expect.poll(labels).toEqual(["Portfolio", "LinkedIn", "Book a conversation", "Email"]);
});

test("customer drafts stay private until link and profile publication", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/");
  await expect(
    page.locator("header").getByRole("link", { name: "Go to your profile", exact: true }),
  ).toHaveAttribute("href", "/app/profile");
  await page.goto("/app/profile");
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
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Profile links", exact: true })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/system-ui|sans-serif|Arial/i);
  await expect(page.getByRole("heading", { name: "Your links", exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Add and organize destinations such as Portfolio or TikTok. Use valid HTTPS links; email and phone actions can use mailto: or tel:.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeHidden();
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish changes", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("region", { name: "Live profile preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "phone" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "desktop" })).toHaveCount(0);
  await expect(page.getByTestId("profile-preview-device")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const linkedinIcon = page.getByRole("button", { name: /Preset icon for LinkedIn/ });
  await linkedinIcon.click();
  await page
    .getByRole("listbox", { name: "Preset icon for LinkedIn" })
    .getByRole("option", { name: "Email", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Preset icon for LinkedIn: Email" })).toBeVisible();

  await addGuidedLink(page, "Private note", "https://contact.example.test");
  const editableLinks = page.locator('[aria-label="Editable profile links"]');
  const labels = editableLinks.locator('input[id$="-label"]');
  const destinations = editableLinks.locator('input[id$="-destination"]');
  await expect(labels.last()).toBeVisible();
  await labels.last().fill("Private note");
  await destinations.last().fill("https://contact.example.test");
  const privateNoteEnabled = page.getByRole("checkbox", { name: "Enable Private note" });
  await expect(privateNoteEnabled).toBeChecked();
  await privateNoteEnabled.locator("xpath=..").click();
  await expect(privateNoteEnabled).not.toBeChecked();
  await page.locator('summary[aria-label="Actions for Private note"]').click();
  await expect(page.getByRole("button", { name: "Move up" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Move down" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await page.getByRole("button", { name: "Move up" }).click();
  await expect(labels.nth(3)).toHaveValue("Private note");

  await addGuidedLink(page, "Delete me", "https://delete-me.example.test");
  await page.locator('summary[aria-label="Actions for Delete me"]').click();
  await page
    .locator("details")
    .filter({ has: page.locator('summary[aria-label="Actions for Delete me"]') })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("textbox", { name: "Label for Delete me" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Links saved to draft.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Draft actions", exact: true })).toHaveCount(0);
  await page.goto("/app/links");
  await expect(labels.nth(3)).toHaveValue("Private note");
  await expect(page.getByRole("textbox", { name: "Label for Private note" })).toHaveValue(
    "Private note",
  );
  await expect(page.getByRole("checkbox", { name: "Enable Private note" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Preset icon for LinkedIn: Email" })).toBeVisible();
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes", exact: true }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft bio")).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);
});

test("customer can switch profile presets while preserving customization and media", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");

  const softPrecision = page.getByRole("radio", { name: "Soft Precision (Paper)" });
  const moss = page.getByRole("radio", { name: "Moss" });
  const night = page.getByRole("radio", { name: "Night" });
  const warmStudio = page.getByRole("radio", { name: "Warm Studio" });
  const previewCanvas = page.getByTestId("profile-preview-frame").locator("xpath=..");
  await expect(softPrecision).toBeVisible();
  await expect(moss).toBeVisible();
  await expect(night).toBeVisible();
  await expect(warmStudio).toBeVisible();
  await expect(softPrecision).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(244, 246, 250)");

  await warmStudio.check();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(251, 246, 239)");
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Background image description").fill("Warm studio backdrop");
  await page.getByRole("tab", { name: "Overview" }).click();
  await openFineTune(page);
  await page.getByRole("radio", { name: "Editorial" }).check();

  await softPrecision.click();
  await expect(softPrecision).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(244, 246, 250)");
  await expect(
    page
      .getByTestId("profile-preview-frame")
      .getByRole("region", { name: "Profile hero" })
      .getByRole("heading", { name: "Mara Velasquez" }),
  ).toBeVisible();
  await openFineTune(page);
  await expect(page.getByRole("radio", { name: "Editorial" })).toBeChecked();
  await page.getByRole("tab", { name: "Media" }).click();
  await expect(page.getByLabel("Background image description")).toHaveValue("Warm studio backdrop");
  await page.getByRole("tab", { name: "Overview" }).click();

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toHaveClass(/text-2xl/);
  await page.goto("/app/customize");
  await warmStudio.check();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(251, 246, 239)");
  await page.getByRole("tab", { name: "Media" }).click();
  await expect(page.getByLabel("Background image description")).toHaveValue("Warm studio backdrop");

  await page.getByRole("tab", { name: "Overview" }).click();
  await moss.click();
  await expect(moss).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(232, 241, 235)");
  await expect(
    page
      .getByTestId("profile-preview-frame")
      .getByRole("region", { name: "Profile hero" })
      .getByRole("heading", { name: "Mara Velasquez" }),
  ).toBeVisible();
  await night.check();
  await expect(night).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(23, 33, 31)");
  await expect(
    page
      .getByTestId("profile-preview-frame")
      .getByRole("region", { name: "Profile hero" })
      .getByRole("heading", { name: "Mara Velasquez" }),
  ).toBeVisible();
  await softPrecision.check();
  await expect(softPrecision).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(244, 246, 250)");
});

test("bio line breaks remain visible in preview and published profile", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");

  const bio = page.getByLabel("Bio or role");
  await bio.fill("First line");
  await bio.press("Enter");
  await bio.pressSequentially("Second line");
  await expect(bio).toHaveValue("First line\nSecond line");

  const previewBio = page.getByTestId("profile-preview-frame").locator("p.whitespace-pre-line");
  await expect(previewBio).toHaveCSS("white-space", "pre-line");
  expect(await previewBio.textContent()).toBe("First line\nSecond line");

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");

  const publicBio = page.locator("main p.whitespace-pre-line");
  await expect(publicBio).toHaveCSS("white-space", "pre-line");
  expect(await publicBio.textContent()).toBe("First line\nSecond line");
});

test("customer can customize, save, and publish a custom profile palette", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.setViewportSize({ width: 1467, height: 1200 });
  await page.goto("/app/customize");

  const custom = page.getByRole("radio", { name: "Custom" });
  await expect(custom).toBeVisible();
  await custom.check();
  await openFineTune(page);
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toHaveCount(0);

  const background = page.getByRole("textbox", { name: "Page background hex" });
  const surface = page.getByRole("textbox", { name: "Profile surface hex" });
  const ink = page.getByRole("textbox", { name: "Profile text hex" });
  const accent = page.getByRole("textbox", { name: "Profile accent hex" });
  await background.fill("#fef2e8");
  await surface.fill("#fffdf9");
  await ink.fill("#2c2420");
  await accent.fill("#3f6de8");
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toBeVisible();
  await accent.fill("#1d4ed8");
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toHaveCount(0);

  const previewCanvas = page.getByTestId("profile-preview-frame").locator("xpath=..");
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(254, 242, 232)");
  const previewLink = page.getByTestId("profile-preview-device").getByRole("link", {
    name: "LinkedIn",
  });
  await expect(previewLink).toHaveCSS("color", "rgb(29, 78, 216)");
  await expect(previewLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await previewLink.hover();
  await expect
    .poll(() => previewLink.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toMatch(/^(?:rgb\(|color\(srgb)/);
  const hoverContrast = await previewLink.evaluate((element) => {
    const parseColor = (color: string) => {
      const channels = color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      if (channels?.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
      const normalizedChannels = color.startsWith("color(srgb")
        ? channels
        : channels.map((channel) => channel / 255);
      return normalizedChannels;
    };
    const luminance = (color: string) => {
      const linear = parseColor(color).map((normalized) =>
        normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const foregroundColor = getComputedStyle(element).color;
    const backgroundColor = getComputedStyle(element).backgroundColor;
    const foreground = luminance(foregroundColor);
    const background = luminance(backgroundColor);
    return {
      ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      foregroundColor,
      backgroundColor,
      accentSoft: getComputedStyle(element.closest(".tapit-profile-entry")!).getPropertyValue(
        "--tapit-accent-soft",
      ),
    };
  });
  expect(
    hoverContrast.ratio,
    `${hoverContrast.foregroundColor} on ${hoverContrast.backgroundColor} (soft ${hoverContrast.accentSoft})`,
  ).toBeGreaterThanOrEqual(4.5);
  await accent.fill("#8d3b2f");
  await page.mouse.move(0, 0);
  await expect(previewLink).toHaveCSS("color", "rgb(141, 59, 47)");
  await expect(previewLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.screenshot({
    path: "test-results/soft-precision-site/custom-preset-desktop.png",
    fullPage: false,
  });

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.goto("/app/customize");
  await openFineTune(page);
  await expect(custom).toBeChecked();
  await expect(background).toHaveValue("#fef2e8");
  await expect(accent).toHaveValue("#8d3b2f");

  const publishChanges = page.getByRole("button", { name: "Publish changes" });
  await accent.fill("#ffffff");
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Media" }).click();
  await publishChanges.click();
  const requirementsDialog = page.getByRole("dialog", { name: "Before you publish" });
  await expect(requirementsDialog).toBeVisible();
  await expect(
    requirementsDialog.getByText(
      "The custom profile accent color does not meet contrast requirements.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toHaveCount(0);
  const openCustomize = requirementsDialog.getByRole("link", { name: "Open Customize" });
  const maybeLater = requirementsDialog.getByRole("button", { name: "Maybe later" });
  await expect(openCustomize).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(maybeLater).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(openCustomize).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(requirementsDialog).toBeHidden();
  await expect(publishChanges).toBeFocused();

  await publishChanges.click();
  await expect(requirementsDialog).toBeVisible();
  await requirementsDialog.getByRole("link", { name: "Open Customize" }).click();
  await expect(page).toHaveURL(/\/app\/customize\?section=overview$/);
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.getByRole("radio", { name: "Moss" }).check();
  await expect(publishChanges).toBeEnabled();
  await page.getByRole("radio", { name: "Custom" }).check();
  await openFineTune(page);
  await expect(background).toHaveValue("#fef2e8");
  await expect(accent).toHaveValue("#ffffff");
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toBeVisible();
  await accent.fill("#8d3b2f");
  await expect(
    page.getByText("The custom profile accent color does not meet contrast requirements."),
  ).toHaveCount(0);

  const saveDraft = page.getByRole("button", { name: "Save draft", exact: true });
  await expect(saveDraft).toBeEnabled();
  await saveDraft.click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await publishChanges.click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.locator(".tapit-profile-entry")).toHaveCSS(
    "background-color",
    "rgb(254, 242, 232)",
  );
  const publicLink = page.getByRole("link", { name: "LinkedIn" });
  await expect(publicLink).toHaveCSS("color", "rgb(141, 59, 47)");
  await expect(publicLink).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("customer customization drafts stay private until the profile is published", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page.goto("/app/customize");
  const warmStudio = page.getByRole("radio", { name: "Warm Studio" });
  await warmStudio.locator("xpath=..").click();
  await expect(warmStudio).toBeChecked();
  await openFineTune(page);
  const editorial = page.getByRole("radio", { name: "Editorial" });
  await editorial.locator("xpath=..").click();
  await expect(editorial).toBeChecked();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "About or Services", exact: true }).click();
  const about = page.getByRole("radio", { name: "About", exact: true });
  await about.locator("xpath=..").click();
  await expect(about).toBeChecked();
  await page.getByLabel("About copy").fill("A private draft introduction.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByText("A private draft introduction.")).toHaveCount(0);
  const bookingLink = page.getByRole("link", { name: "Book a conversation" });
  await expect(bookingLink).toBeVisible();

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
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", {
      name: "Email",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a conversation" })).toBeVisible();
});

test("preset theme changes stay private until the saved draft is published", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");

  await page.getByRole("radio", { name: "Moss", exact: true }).check();
  await page.goto("/mara-velasquez");
  await expect(page.locator(".tapit-profile-entry")).toHaveCSS(
    "background-color",
    "rgb(244, 246, 250)",
  );

  await page.goto("/app/customize");
  await page.getByRole("radio", { name: "Moss", exact: true }).check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByText("Draft saved. Visitors still see the last published version."),
  ).toBeVisible();

  for (const route of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(route);
    await expect(page.locator(".tapit-profile-entry")).toHaveCSS(
      "background-color",
      "rgb(244, 246, 250)",
    );
  }

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  for (const route of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(route);
    await expect(page.locator(".tapit-profile-entry")).toHaveCSS(
      "background-color",
      "rgb(232, 241, 235)",
    );
  }
});

test("legacy profiles can choose Warm Studio before the new presentation is published", async ({
  page,
}) => {
  await prepareLegacyMaraProfile(page);

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("navigation", { name: "Contact actions" })).toBeVisible();

  await page.goto("/app/customize");
  const warmStudio = page.getByRole("radio", { name: "Warm Studio", exact: true });
  await expect(warmStudio).toBeVisible();
  await warmStudio.check();
  await expect(page.getByRole("radio", { name: "Warm Studio", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("navigation", { name: "Contact actions" })).toBeVisible();
  await expect(page.locator("main")).toHaveCSS("background-color", "rgb(251, 246, 239)");
});

test("customer can configure bounded profile media and publish an edge-to-edge portrait hero", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);

  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Background image description").fill("Warm studio backdrop");
  await page.getByLabel("Hero height: 320px").fill("420");
  await page.getByLabel("Crop horizontal position: 50%").fill("30");
  await page.getByLabel("Crop vertical position: 50%").fill("65");

  await page.getByRole("tab", { name: "Slideshow" }).click();
  const slideshowInput = page.getByLabel("Upload slideshow images");
  await slideshowInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Slideshow image 1 description").fill("Studio detail one");
  await slideshowInput.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await page.getByLabel("Slideshow image 2 description").fill("Studio detail two");
  await expect(page.getByText("2 of 10 images")).toBeVisible();

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  const storedMedia = await readSavedDemoBackground(page);
  expect(storedMedia).toBeTruthy();
  expect(storedMedia).not.toHaveProperty("previewUrl");
  expect(typeof storedMedia?.url).toBe("string");
  expect((storedMedia?.url as string).startsWith("data:image/")).toBe(true);
  expect((storedMedia?.url as string).length).toBeLessThan(100_000);

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  await expect(page.getByText("Warm studio backdrop", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Studio detail one" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Studio detail two" })).toHaveCount(0);

  await page.goto("/app/customize");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/links");
  const previewHero = page
    .getByTestId("profile-preview-device")
    .getByRole("region", { name: "Profile hero" });
  const previewHeroContent = previewHero.locator(":scope > div.relative.z-10");
  const previewHeroContentPadding = await previewHeroContent.evaluate(
    (element) => getComputedStyle(element).paddingTop,
  );
  await page.goto("/mara-velasquez");
  const profileHero = page.getByRole("region", { name: "Profile hero" });
  const profileHeroContent = profileHero.locator(":scope > div.relative.z-10");
  await expect(profileHero).toBeVisible();
  await expect(profileHeroContent).toHaveCSS("padding-top", previewHeroContentPadding);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    const hero = page.getByRole("region", { name: "Profile hero" });
    const heroBackground = hero.locator(':scope > div[aria-hidden="true"]').first();
    const panel = page.locator("main > div > section").first();
    const portrait = page.getByRole("img", { name: "Mara Velasquez profile" });

    await expect(hero).toBeVisible();
    await expect(portrait).toBeVisible();
    const [backgroundBox, panelBox, portraitBox] = await Promise.all([
      heroBackground.boundingBox(),
      panel.boundingBox(),
      portrait.boundingBox(),
    ]);
    const identityBackdropColors = await Promise.all(
      [
        hero.getByRole("heading", { name: "Mara Velasquez" }).locator("span"),
        hero.locator("p span"),
      ].map((text) => text.evaluate((element) => getComputedStyle(element).backgroundColor)),
    );
    const identityForegroundColors = await Promise.all(
      [
        hero.getByRole("heading", { name: "Mara Velasquez" }).locator("span"),
        hero.locator("p span"),
      ].map((text) => text.evaluate((element) => getComputedStyle(element).color)),
    );
    expect(backgroundBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(portraitBox).not.toBeNull();
    if (path === "/c/mara-card-7f2q") {
      expect(identityForegroundColors).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
      expect(identityBackdropColors).toEqual(["rgb(38, 49, 44)", "rgb(38, 49, 44)"]);
    } else {
      expect(identityBackdropColors).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
    }
    expect(Math.abs(backgroundBox!.x - panelBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(backgroundBox!.y - panelBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(backgroundBox!.width - panelBox!.width)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        backgroundBox!.y + backgroundBox!.height - (portraitBox!.y + portraitBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await expect(page.getByRole("region", { name: "Profile slideshow" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Studio detail one" })).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("background-color", "rgb(251, 246, 239)");

    if (path === "/mara-velasquez") {
      await page.screenshot({
        path: "test-results/tapit-public-profile-background-mobile.png",
        fullPage: true,
      });
      await page.evaluate(() => {
        const raw = window.localStorage.getItem("tapit:demo-state:v1");
        if (!raw) throw new Error("Expected the published profile before contrast setup.");
        const state = JSON.parse(raw);
        const white = { kind: "custom", hex: "#ffffff" };
        const applyWhiteIdentity = (profile: {
          id?: string;
          draft: Record<string, unknown>;
          published?: Record<string, unknown> | null;
        }) => {
          if (profile.id !== "profile-mara") return profile;
          const customize = (content: Record<string, unknown>) => ({
            ...content,
            customization: {
              ...(content.customization as Record<string, unknown>),
              identityColors: { name: white, bio: white },
            },
          });
          return {
            ...profile,
            draft: customize(profile.draft),
            published: profile.published ? customize(profile.published) : null,
          };
        };
        state.profile = applyWhiteIdentity(state.profile);
        state.profiles = state.profiles.map(applyWhiteIdentity);
        window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
      });
      await page.reload();
    }
  }
});

test("customer can remove a saved background from the media header", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Background image description").fill("Studio backdrop");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByText("Studio backdrop", { exact: true })).toHaveCount(1);

  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Media" }).click();
  const backgroundSection = page
    .getByRole("heading", { name: "Background image" })
    .locator("..")
    .locator("..");
  await expect(backgroundSection.getByRole("button", { name: "Remove background" })).toBeVisible();
  await backgroundSection.getByRole("button", { name: "Remove background" }).click();
  await expect(page.getByRole("button", { name: "Upload background", exact: true })).toBeVisible();
  await expect(
    page.getByTestId("profile-preview-device").getByRole("region", { name: "Profile hero" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();

  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByText("Studio backdrop", { exact: true })).toHaveCount(0);
});

test("slideshow saves without descriptions and its arrows navigate in preview and public", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Slideshow" }).click();
  const upload = page.getByLabel("Upload slideshow images");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(page.getByText("1 of 10 images")).toBeVisible();
  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(page.getByText("2 of 10 images")).toBeVisible();
  await page.getByRole("textbox", { name: "Slideshow image 1 description" }).fill("");
  await page.getByRole("textbox", { name: "Slideshow image 2 description" }).fill("");

  const preview = page.getByTestId("profile-preview-device").getByRole("region", {
    name: "Profile slideshow",
  });
  await expect(preview.getByRole("img", { name: "Slideshow image 1" })).toBeVisible();
  await preview.hover();
  await preview.getByRole("button", { name: "Next image" }).click();
  await expect(preview.getByRole("img", { name: "Slideshow image 2" })).toBeVisible();
  await preview.getByRole("button", { name: "Previous image" }).click();
  await expect(preview.getByRole("img", { name: "Slideshow image 1" })).toBeVisible();

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");
  const publicSlideshow = page.getByRole("region", { name: "Profile slideshow" });
  await expect(publicSlideshow.getByRole("button", { name: "Pause slideshow" })).toHaveCount(0);
  await expect(publicSlideshow.getByRole("img", { name: "Slideshow image 1" })).toBeVisible();
  await publicSlideshow.hover();
  await publicSlideshow.getByRole("button", { name: "Next image" }).click();
  const selectedImage = publicSlideshow.getByRole("img", { name: "Slideshow image 2" });
  await expect(selectedImage).toBeVisible();
  const selectedSrc = await selectedImage.getAttribute("src");
  await page.setViewportSize({ width: 390, height: 844 });
  await publicSlideshow.hover();
  const viewImage = publicSlideshow.getByRole("button", { name: "View image" });
  await expect(viewImage).toBeVisible();
  await viewImage.click();

  const fullImageView = page.getByRole("dialog");
  const fullImage = fullImageView.getByRole("img", { name: "Slideshow image 2" });
  await expect(fullImage).toBeVisible();
  await expect(fullImage).toHaveAttribute("src", selectedSrc!);
  await expect(fullImage).toHaveCSS("object-fit", "contain");
  await expect(fullImageView.getByRole("button", { name: "Close full image" })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(4_200);
  await expect(fullImage).toHaveAttribute("src", selectedSrc!);

  await page.keyboard.press("Escape");
  await expect(fullImageView).not.toBeVisible();
  await expect(viewImage).toBeFocused();
  await expect(selectedImage).toHaveAttribute("src", selectedSrc!);
  await viewImage.click();
  await fullImageView.getByRole("button", { name: "Close full image" }).click();
  await expect(fullImageView).not.toBeVisible();
  await expect(viewImage).toBeFocused();
});

async function openSlideshowEditor(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Slideshow" }).click();
}

test("slideshow preview shows queued and unsaved slides without losing editor state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSlideshowEditor(page);
  await setDemoMediaUploadControl(page, { delayMs: 1200 });

  const upload = page.getByLabel("Upload slideshow images");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(page.getByText("Uploading", { exact: true })).toBeVisible();
  const previewButton = page.getByRole("button", { name: "Preview slideshow" });
  await expect(previewButton).toBeEnabled();
  await previewButton.click();

  let dialog = page.getByRole("dialog", { name: "Mobile slideshow preview" });
  await expect(dialog).toBeVisible();
  let slideshow = dialog.getByRole("region", { name: "Profile slideshow" });
  await expect(slideshow.getByRole("img", { name: "opaque-landscape.png" })).toBeVisible();
  const backgroundScrollY = await page.evaluate(() => window.scrollY);
  await page.mouse.move(1, 1);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(backgroundScrollY);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "opaque-landscape.png",
  );
  await expect(page.getByText("Uploading", { exact: true })).toHaveCount(0, { timeout: 10_000 });

  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(page.getByLabel("Slideshow image 2 description")).toHaveValue(
    "transparent-logo.png",
  );
  await page.getByLabel("Autoplay slideshow while visible").uncheck();
  await page.getByRole("button", { name: "Move slideshow image 2 up" }).click();
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "transparent-logo.png",
  );

  await previewButton.click();
  dialog = page.getByRole("dialog", { name: "Mobile slideshow preview" });
  await expect(dialog).toBeVisible();
  slideshow = dialog.getByRole("region", { name: "Profile slideshow" });
  await expect(slideshow.getByRole("img", { name: "transparent-logo.png" })).toBeVisible();
  await slideshow.getByRole("button", { name: "Next image" }).click();
  await expect(slideshow.getByRole("img", { name: "opaque-landscape.png" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "transparent-logo.png",
  );

  await previewButton.click();
  dialog = page.getByRole("dialog", { name: "Mobile slideshow preview" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Return to editor" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "transparent-logo.png",
  );
});

test("a single published slideshow image opens in full view", async ({ page }) => {
  await openSlideshowEditor(page);
  await page
    .getByLabel("Upload slideshow images")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");

  const publicSlideshow = page.getByRole("region", { name: "Profile slideshow" });
  const viewImage = publicSlideshow.getByRole("button", { name: "View image" });
  await expect(viewImage).toBeVisible();
  await viewImage.click();
  await expect(
    page.getByRole("dialog").getByRole("img", { name: "opaque-landscape.png" }),
  ).toBeVisible();
});

test("small, tall, and wide published slideshow images fit the full image dialog", async ({
  page,
}) => {
  await openSlideshowEditor(page);
  const upload = page.getByLabel("Upload slideshow images");
  for (const image of [
    { name: "Tall portrait", width: 160, height: 1800 },
    { name: "Wide panorama", width: 1800, height: 160 },
    { name: "Small landscape", width: 268, height: 151 },
  ]) {
    await upload.setInputFiles({
      name: `${image.name}.png`,
      mimeType: "image/png",
      buffer: await sharp({
        create: {
          width: image.width,
          height: image.height,
          channels: 3,
          background: "#a84431",
        },
      })
        .png()
        .toBuffer(),
    });
  }
  await page.getByRole("textbox", { name: "Slideshow image 1 description" }).fill("Tall portrait");
  await page.getByRole("textbox", { name: "Slideshow image 2 description" }).fill("Wide panorama");
  await page
    .getByRole("textbox", { name: "Slideshow image 3 description" })
    .fill("Small landscape");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");

  const publicSlideshow = page.getByRole("region", { name: "Profile slideshow" });
  const fullImageView = page.getByRole("dialog", { name: "Full slideshow image" });
  for (const { rootFontSize, ...viewport } of [
    { width: 390, height: 844, rootFontSize: 16 },
    { width: 1280, height: 720, rootFontSize: 16 },
    { width: 390, height: 844, rootFontSize: 32 },
    { width: 390, height: 844, rootFontSize: 12 },
    { width: 320, height: 720, rootFontSize: 32 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, rootFontSize);
    for (const [index, name] of ["Tall portrait", "Wide panorama", "Small landscape"].entries()) {
      await publicSlideshow.getByRole("button", { name: `Image ${index + 1} of 3` }).click();
      const slide = publicSlideshow.getByRole("img", { name });
      const slideSrc = await slide.getAttribute("src");
      await publicSlideshow.getByRole("button", { name: "View image" }).click();
      const image = fullImageView.getByRole("img", { name });
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute("src", slideSrc!);
      if (viewport.width === 320) {
        expect(
          await fullImageView
            .getByRole("button", { name: "Close full image" })
            .evaluate((button) => button.getBoundingClientRect().height),
        ).toBeGreaterThan(2.75 * rootFontSize);
      }
      const getLayout = () =>
        image.evaluate((element: HTMLImageElement) => {
          const dialog = element.closest("dialog")!;
          const imageBounds = element.getBoundingClientRect();
          const dialogBounds = dialog.getBoundingClientRect();
          const scale = Math.min(
            imageBounds.width / element.naturalWidth,
            imageBounds.height / element.naturalHeight,
          );
          return {
            loaded: element.naturalWidth > 0,
            noCrop: getComputedStyle(element).objectFit === "contain",
            naturalWidth: element.naturalWidth,
            renderedWidth: element.naturalWidth * scale,
            withinDialog:
              imageBounds.left >= dialogBounds.left &&
              imageBounds.right <= dialogBounds.right &&
              imageBounds.top >= dialogBounds.top &&
              imageBounds.bottom <= dialogBounds.bottom,
            withinViewport:
              dialogBounds.left >= 0 &&
              dialogBounds.right <= window.innerWidth &&
              dialogBounds.top >= 0 &&
              dialogBounds.bottom <= window.innerHeight,
            centered:
              Math.abs((dialogBounds.left + dialogBounds.right) / 2 - window.innerWidth / 2) < 1 &&
              Math.abs((dialogBounds.top + dialogBounds.bottom) / 2 - window.innerHeight / 2) < 1,
            noDialogScroll:
              dialog.scrollHeight <= dialog.clientHeight &&
              dialog.scrollWidth <= dialog.clientWidth,
          };
        });
      await expect.poll(getLayout).toMatchObject({
        loaded: true,
        noCrop: true,
        withinDialog: true,
        withinViewport: true,
        centered: true,
        noDialogScroll: true,
      });
      if (name === "Small landscape" && viewport.width === 1280 && rootFontSize === 16) {
        const layout = await getLayout();
        expect(layout.renderedWidth).toBeGreaterThan(layout.naturalWidth);
      }
      await fullImageView.getByRole("button", { name: "Close full image" }).click();
    }
  }
});

test("slideshow upload queue waits for the active upload and preserves selection order", async ({
  page,
}) => {
  await openSlideshowEditor(page);
  await setDemoMediaUploadControl(page, { delayMs: 1200 });
  const upload = page.getByLabel("Upload slideshow images");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(page.getByText("Uploading", { exact: true })).toBeVisible();
  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();

  await expect(page.getByText("2 of 10 images")).toBeVisible();
  await expect(page.getByLabel("Slideshow image 1 description")).toBeVisible();
  await expect(page.getByText("Uploading", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Uploading", { exact: true })).toHaveCount(0);
  await expect(page.getByText("2 of 10 images")).toBeVisible();
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveCount(1);
  await expect(page.getByLabel("Slideshow image 2 description")).toHaveCount(1);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "opaque-landscape.png",
  );
  await expect(page.getByLabel("Slideshow image 2 description")).toHaveValue(
    "transparent-logo.png",
  );
  await expect(page.getByRole("button", { name: "Retry upload" })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /media upload failed/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
});

test("slideshow upload queue pauses on failure and retries before later selections", async ({
  page,
}) => {
  await openSlideshowEditor(page);
  await setDemoMediaUploadControl(page, { delayMs: 1200, fail: true });
  const upload = page.getByLabel("Upload slideshow images");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");

  await expect(
    page.getByRole("alert").filter({ hasText: "The media upload failed. Try again." }),
  ).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await page.getByLabel("Autoplay slideshow while visible").uncheck();
  const previewButton = page.getByRole("button", { name: "Preview slideshow" });
  await previewButton.click();
  const previewDialog = page.getByRole("dialog", { name: "Mobile slideshow preview" });
  const slideshowPreview = previewDialog.getByRole("region", { name: "Profile slideshow" });
  await expect(slideshowPreview.getByRole("img", { name: "transparent-logo.png" })).toHaveAttribute(
    "alt",
    "transparent-logo.png",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Remove failed slideshow image.*opaque-landscape\.png/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
  ).toBeDisabled();
  await expect(page.getByText("2 of 10 images")).toBeVisible();

  await setDemoMediaUploadControl(page, { delayMs: 1200, fail: false });
  await page.getByRole("button", { name: "Retry upload" }).click();
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "opaque-landscape.png",
  );
  await expect(page.getByLabel("Slideshow image 2 description")).toHaveValue(
    "transparent-logo.png",
  );
  await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Uploading", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveCount(1);
  await expect(page.getByLabel("Slideshow image 2 description")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry upload" })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /media upload failed/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
});

test("slideshow upload errors are announced on the labelled slideshow panel", async ({ page }) => {
  await openSlideshowEditor(page);
  await setDemoMediaUploadControl(page, { fail: true });
  await page
    .getByLabel("Upload slideshow images")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(
    page.getByRole("alert").filter({ hasText: "The media upload failed. Try again." }),
  ).toBeVisible();

  const slideshowTab = page.getByRole("tab", { name: "Slideshow" });
  const mediaTab = page.getByRole("tab", { name: "Media" });
  await expect(slideshowTab).toHaveAccessibleDescription("Needs attention");

  const slideshowPanel = page.getByRole("tabpanel", { name: "Slideshow" });
  await expect(slideshowPanel).toBeVisible();
  const slideshowTabId = await slideshowTab.getAttribute("id");
  if (!slideshowTabId) throw new Error("The Slideshow tab is missing its accessible id.");
  await expect(slideshowTab).toHaveAttribute(
    "aria-controls",
    (await slideshowPanel.getAttribute("id")) ?? "",
  );
  await expect(slideshowPanel).toHaveAttribute("aria-labelledby", slideshowTabId);

  await mediaTab.click();
  await expect(mediaTab).not.toHaveAccessibleDescription(/Needs attention/);
  const mediaPanel = page.getByRole("tabpanel", { name: "Media" });
  await expect(mediaPanel).toBeVisible();
  const mediaTabId = await mediaTab.getAttribute("id");
  if (!mediaTabId) throw new Error("The Media tab is missing its accessible id.");
  await expect(mediaPanel).toHaveAttribute("aria-labelledby", mediaTabId);
});

test("slideshow upload queue resumes after removing a failed item", async ({ page }) => {
  await openSlideshowEditor(page);
  await page.getByLabel("Autoplay slideshow while visible").uncheck();
  await setDemoMediaUploadControl(page, { delayMs: 1200, fail: true });
  const upload = page.getByLabel("Upload slideshow images");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await expect(
    page.getByRole("alert").filter({ hasText: "The media upload failed. Try again." }),
  ).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true })).toBeVisible();
  const pendingSlideshow = page
    .getByTestId("profile-preview-device")
    .getByRole("region", { name: "Profile slideshow" });
  await expect(pendingSlideshow.getByRole("button", { name: "Next image" })).toHaveCount(0);
  await expect(pendingSlideshow.getByRole("img")).toHaveAttribute("alt", "transparent-logo.png");

  await setDemoMediaUploadControl(page, { fail: false });
  await page
    .getByRole("button", { name: /Remove failed slideshow image.*opaque-landscape\.png/ })
    .click();
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "transparent-logo.png",
  );
  await expect(page.getByText("Waiting", { exact: true })).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Uploading", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry upload" })).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /media upload failed/i })).toHaveCount(0);
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
});

test("slideshow image ordering works by buttons and pointer with accessible mobile controls", async ({
  page,
}) => {
  await openSlideshowEditor(page);
  const upload = page.getByLabel("Upload slideshow images");
  for (let index = 0; index < 3; index += 1) {
    const fixture = index === 1 ? "transparent-logo.png" : "opaque-landscape.png";
    await upload.setInputFiles(`tests/fixtures/profile-images/${fixture}`);
    await expect(page.getByLabel(`Slideshow image ${index + 1} description`)).toBeVisible();
  }
  await expect(page.getByLabel("Slideshow image 3 description")).toBeVisible();

  const orderList = page.getByRole("list", { name: "Uploaded slideshow image order" });
  await expect(orderList.getByRole("listitem")).toHaveCount(3);
  for (let index = 1; index <= 3; index += 1) {
    await expect(page.getByText(`Image ${index} of 3`, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Reorder slideshow image ${index}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Move slideshow image ${index} up` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Move slideshow image ${index} down` }),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Move slideshow image 1 up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move slideshow image 3 down" })).toBeDisabled();

  const preview = page.getByTestId("profile-preview-device").getByRole("region", {
    name: "Profile slideshow",
  });
  await page.getByRole("button", { name: "Move slideshow image 2 up" }).click();
  await expect(page.getByRole("status").filter({ hasText: /moved to position 1/i })).toBeVisible();
  await expect(page.getByLabel("Slideshow image 1 description")).toHaveValue(
    "transparent-logo.png",
  );
  await expect(preview.getByRole("img", { name: "transparent-logo.png" })).toBeVisible();

  const firstHandle = page.getByRole("button", { name: "Reorder slideshow image 1" });
  const thirdRow = orderList.getByRole("listitem").filter({
    has: page.getByLabel("Slideshow image 3 description"),
  });
  await page.setViewportSize({ width: 1280, height: 1400 });
  const handleBox = await firstHandle.boundingBox();
  const rowBox = await thirdRow.boundingBox();
  expect(handleBox).not.toBeNull();
  expect(rowBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(rowBox!.x + rowBox!.width / 2, rowBox!.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("status").filter({ hasText: /moved to position 3 of 3/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Slideshow image 3 description")).toHaveValue(
    "transparent-logo.png",
  );
  await preview.hover();
  await preview.getByRole("button", { name: "Image 3 of 3" }).click();
  await expect(preview.getByRole("img", { name: "transparent-logo.png" })).toBeVisible();

  const beforeSettingsDrag = await Promise.all(
    [1, 2, 3].map((index) => page.getByLabel(`Slideshow image ${index} description`).inputValue()),
  );
  await page.getByLabel("Slideshow image 1 description").dragTo(thirdRow);
  const afterSettingsDrag = await Promise.all(
    [1, 2, 3].map((index) => page.getByLabel(`Slideshow image ${index} description`).inputValue()),
  );
  expect(afterSettingsDrag).toEqual(beforeSettingsDrag);

  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const moveDown = page.getByRole("button", { name: "Move slideshow image 1 down" });
  await moveDown.focus();
  await expect(moveDown).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /moved to position 2/i })).toBeVisible();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Move slideshow image 2 down");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const mobileMoveDown = page.getByRole("button", { name: "Move slideshow image 1 down" });
  await mobileMoveDown.focus();
  await expect(mobileMoveDown).toBeFocused();
  await page.setViewportSize({ width: 320, height: 1600 });
  await orderList
    .getByRole("listitem")
    .first()
    .screenshot({ path: "test-results/tapit-slideshow-order-mobile.png" });
});

test("slideshow upload queue counts failed and queued items toward the ten image limit", async ({
  page,
}) => {
  await openSlideshowEditor(page);
  const upload = page.getByLabel("Upload slideshow images");
  for (let index = 0; index < 8; index += 1) {
    await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
    await expect(page.getByText(`${index + 1} of 10 images`)).toBeVisible();
  }

  await setDemoMediaUploadControl(page, { delayMs: 1500, fail: true });
  await upload.setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  await upload.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await expect(
    page.getByRole("alert").filter({ hasText: "The media upload failed. Try again." }),
  ).toBeVisible();
  await expect(page.getByText("Waiting", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("10 of 10 images")).toBeVisible();
  await expect(upload).toBeDisabled();
  await expect(
    page.getByText(/maximum of 10 images|10 image limit|remove an image/i),
  ).toBeVisible();
});

test("ten distinct demo slideshow images fit local storage and keep public controls usable on mobile", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Slideshow" }).click();

  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(async (slideIndex) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Upload slideshow images"]',
      );
      if (!input) throw new Error("Expected slideshow input.");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Expected canvas support.");
      for (let row = 0; row < 48; row += 1) {
        for (let column = 0; column < 64; column += 1) {
          context.fillStyle = `hsl(${(row * 13 + column * 19 + slideIndex * 37) % 360} 65% 55%)`;
          context.fillRect(column * 10, row * 10, 10, 10);
        }
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("Could not create slide."))),
          "image/png",
        );
      });
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], `slide-${slideIndex + 1}.png`, { type: "image/png" }));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, index);
    await expect(page.getByText(`${index + 1} of 10 images`)).toBeVisible();
  }

  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  const savedLength = await page.evaluate(
    () => window.localStorage.getItem("tapit:demo-state:v1")?.length ?? 0,
  );
  expect(savedLength).toBeLessThan(2_000_000);
  await page.reload();
  await page.getByRole("tab", { name: "Slideshow" }).click();
  await expect(page.getByText("10 of 10 images")).toBeVisible();

  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");
  const slideshow = page.getByRole("region", { name: "Profile slideshow" });
  await slideshow.scrollIntoViewIfNeeded();
  await slideshow.hover();
  const picker = slideshow.getByRole("group", { name: "Choose slideshow image" });
  const controls = picker.locator("..");

  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");
  const pickerBox = await picker.boundingBox();
  const slideshowBox = await slideshow.boundingBox();
  expect(pickerBox).not.toBeNull();
  expect(slideshowBox).not.toBeNull();
  expect(
    Math.abs(pickerBox!.x + pickerBox!.width / 2 - (slideshowBox!.x + slideshowBox!.width / 2)),
  ).toBeLessThanOrEqual(1);
  expect(pickerBox!.width).toBeLessThan(slideshowBox!.width);

  await expect(controls).toHaveCSS("opacity", "0", { timeout: 5_000 });
  await expect(controls).toHaveCSS("pointer-events", "none");
  for (let tabIndex = 0; tabIndex < 60; tabIndex += 1) {
    const focusIsInSlideshow = await slideshow.evaluate((root) =>
      root.contains(document.activeElement),
    );
    if (focusIsInSlideshow) break;
    await page.keyboard.press("Tab");
  }
  await expect(slideshow.getByRole("button", { name: "Previous image" })).toBeFocused();
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");

  await expect(slideshow.getByRole("button", { name: "Pause slideshow" })).toHaveCount(0);
  await expect(slideshow.getByRole("button", { name: "Play slideshow" })).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await slideshow.scrollIntoViewIfNeeded();
  await expect(page.getByRole("status")).toContainText(
    "Your reduced-motion preference disables autoplay.",
  );
  await expect(controls).toHaveCSS("opacity", "1");
  await page.waitForTimeout(3_100);
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Slideshow" }).click();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByLabel("Autoplay slideshow while visible").uncheck();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await page.goto("/mara-velasquez");
  await slideshow.scrollIntoViewIfNeeded();
  await expect(slideshow.getByRole("button", { name: "Pause slideshow" })).toHaveCount(0);
  await expect(controls).toHaveCSS("opacity", "1");
  await page.waitForTimeout(3_100);
  await expect(controls).toHaveCSS("opacity", "1");
  await expect(controls).toHaveCSS("pointer-events", "auto");
});

test("customize mobile profile preview keeps its hero full-width and identity free of backplates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1689, height: 857 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  await page.getByLabel("Background image description").fill("Profile preview backdrop");
  await page.getByRole("tab", { name: "Overview" }).click();

  const profileSurface = page.getByTestId("profile-preview-device");
  const hero = profileSurface.getByRole("region", { name: "Profile hero" });
  await expect(hero).toBeVisible();
  const heroBackground = hero.locator(':scope > div[aria-hidden="true"]').first();
  const [heroBounds, screenBounds] = await Promise.all([
    heroBackground.boundingBox(),
    profileSurface.boundingBox(),
  ]);
  expect(heroBounds).not.toBeNull();
  expect(screenBounds).not.toBeNull();
  expect(Math.abs(heroBounds!.x - screenBounds!.x)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(screenBounds!.x + screenBounds!.width - (heroBounds!.x + heroBounds!.width)),
  ).toBeLessThanOrEqual(2);
  const identityText = [
    profileSurface.getByRole("heading", { name: "Mara Velasquez" }).locator("span"),
    profileSurface.locator("p span").filter({ hasText: "Brand systems for independent teams." }),
  ];
  for (const text of identityText) {
    await expect(text).toBeVisible();
    await expect(text).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(text).toHaveCSS("padding-left", "0px");
    await expect(text).toHaveCSS("padding-right", "0px");
    await expect(text).toHaveCSS("box-shadow", "none");
  }
});

test("customize preview uses a neutral web viewport for short and long profiles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1415, height: 857 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");

  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("public/images/tapit-hero-atmosphere.png");
  await page.getByLabel("Background image description").fill("Atmospheric Tapit profile cover.");
  await page.getByLabel(/^Hero height:/).fill("234");
  await page.getByRole("tab", { name: "Overview" }).click();

  const frame = page.getByTestId("profile-preview-frame");
  const previewCanvas = frame.locator("xpath=..");
  const viewport = page.getByRole("group", { name: "Mobile web profile preview" });
  const profileSurface = page.getByTestId("profile-preview-device");
  await expect(viewport).toBeVisible();
  await expect(page.getByText("Powered by Tapit")).toHaveCount(0);
  await expect(page.getByText("tapit.app/mara-velasquez", { exact: true })).toBeVisible();
  await expect(page.getByText("9:41", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/tapit-customize-preview-1415x857.png" });
  await viewport.screenshot({ path: "test-results/tapit-customize-neutral-web-preview.png" });

  const viewportHeightToWidth = await viewport.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.height / bounds.width;
  });
  expect(viewportHeightToWidth).toBeCloseTo(19.5 / 9, 1);

  const shortProfileScreen = await profileSurface.evaluate((screen) => ({
    clientHeight: screen.clientHeight,
    overflowY: getComputedStyle(screen).overflowY,
    scrollHeight: screen.scrollHeight,
  }));
  expect(shortProfileScreen.overflowY).toBe("auto");
  expect(shortProfileScreen.scrollHeight).toBeGreaterThan(shortProfileScreen.clientHeight);
  await viewport.screenshot({
    path: "test-results/tapit-customize-neutral-web-preview-footer.png",
  });

  const overflowY = await previewCanvas.evaluate((canvas) => getComputedStyle(canvas).overflowY);
  expect(overflowY).toBe("hidden");

  const [canvasBox, viewportBox] = await Promise.all([
    previewCanvas.boundingBox(),
    viewport.boundingBox(),
  ]);
  expect(canvasBox).not.toBeNull();
  expect(viewportBox).not.toBeNull();
  expect(viewportBox!.y).toBeGreaterThanOrEqual(canvasBox!.y);
  expect(viewportBox!.y + viewportBox!.height).toBeLessThanOrEqual(
    canvasBox!.y + canvasBox!.height + 1,
  );

  const fitScale = await viewport.evaluate((element) => {
    const match = (element as HTMLElement).style.transform.match(/scale\(([^)]+)\)/);
    return match ? Number(match[1]) : 1;
  });
  expect(fitScale).toBeGreaterThanOrEqual(0.58);

  await page.goto("/app/profile");
  await page.getByLabel("Bio or role").fill("Long-content preview setup.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText(/Draft saved\./)).toBeVisible();
  await page.goto("/app/customize");

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected the demo profile before long-content setup.");
    const state = JSON.parse(raw);
    const extendProfile = (profile: { id?: string; draft?: Record<string, unknown> }) => {
      if (profile.id !== "profile-mara" || !profile.draft) return profile;
      const existingLinks = Array.isArray(profile.draft.links) ? profile.draft.links : [];
      const longLinks = Array.from({ length: 18 }, (_, index) => ({
        id: `long-preview-${index + 1}`,
        label: `Extended profile connection ${index + 1}`,
        destination: `https://example.test/connection/${index + 1}`,
        enabled: true,
        icon: "globe",
      }));
      return {
        ...profile,
        draft: {
          ...profile.draft,
          bio: "A longer introduction for testing a complete profile preview. ".repeat(18),
          links: [...existingLinks, ...longLinks],
        },
      };
    };
    state.profile = extendProfile(state.profile);
    state.profiles = state.profiles.map(extendProfile);
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();

  const expandedViewport = page.getByRole("group", { name: "Mobile web profile preview" });
  const expandedCanvas = page.getByTestId("profile-preview-frame").locator("xpath=..");
  const expandedScreen = page.getByTestId("profile-preview-device");
  const lastLink = page.getByRole("link", { name: "Extended profile connection 18" });
  await lastLink.scrollIntoViewIfNeeded();
  await expect(lastLink).toBeVisible();
  const [expandedCanvasBox, expandedViewportBox] = await Promise.all([
    expandedCanvas.boundingBox(),
    expandedViewport.boundingBox(),
  ]);
  expect(expandedCanvasBox).not.toBeNull();
  expect(expandedViewportBox).not.toBeNull();
  expect(expandedViewportBox!.y).toBeGreaterThanOrEqual(expandedCanvasBox!.y);
  expect(expandedViewportBox!.y + expandedViewportBox!.height).toBeLessThanOrEqual(
    expandedCanvasBox!.y + expandedCanvasBox!.height + 1,
  );
  expect(expandedViewportBox!.height / expandedViewportBox!.width).toBeCloseTo(19.5 / 9, 1);
  const longProfileScreen = await expandedScreen.evaluate((screen) => ({
    clientHeight: screen.clientHeight,
    overflowY: getComputedStyle(screen).overflowY,
    scrollHeight: screen.scrollHeight,
    scrollTop: screen.scrollTop,
  }));
  expect(longProfileScreen.overflowY).toBe("auto");
  expect(longProfileScreen.scrollHeight).toBeGreaterThan(longProfileScreen.clientHeight);
  expect(longProfileScreen.scrollTop).toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/tapit-customize-long-profile-preview.png",
    fullPage: true,
  });
});

test("high-entropy demo media is reduced below the storage limit", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();

  await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Upload background image"]',
    );
    if (!input) throw new Error("Expected the background image input.");
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Expected canvas support.");
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 17;
    for (let index = 0; index < pixels.data.length; index += 4) {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      pixels.data[index] = seed & 0xff;
      pixels.data[index + 1] = (seed >>> 8) & 0xff;
      pixels.data[index + 2] = (seed >>> 16) & 0xff;
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (nextBlob) =>
          nextBlob ? resolve(nextBlob) : reject(new Error("Could not create test media.")),
        "image/jpeg",
        0.82,
      );
    });
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "high-entropy.jpg", { type: "image/jpeg" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await page.getByLabel("Background image description").fill("High entropy backdrop");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  const storedMedia = await readSavedDemoBackground(page);
  expect(storedMedia).toBeTruthy();
  expect(storedMedia).not.toHaveProperty("previewUrl");
  expect((storedMedia?.url as string).startsWith("data:image/")).toBe(true);
  expect((storedMedia?.url as string).length).toBeLessThan(100_000);
});

test("background descriptions default to the filename and remain required for saving", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  const backgroundDescription = page.getByLabel("Background image description");
  await expect(backgroundDescription).toHaveValue("opaque-landscape.png");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();

  await backgroundDescription.fill("");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  const publishButton = page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ });
  await publishButton.click();
  const requirementsDialog = page.getByRole("dialog", { name: "Before you publish" });
  await expect(requirementsDialog).toBeVisible();
  await expect(
    requirementsDialog.getByText("A background image needs an accessible description."),
  ).toBeVisible();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toHaveCount(0);
  await requirementsDialog.getByRole("button", { name: "Maybe later" }).click();

  await backgroundDescription.fill("Warm studio backdrop");
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
});

test("pending media uploads keep profile actions guarded", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await setDemoMediaUploadControl(page, { delayMs: 5000 });
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
  ).toBeDisabled();
  const pendingHero = page.getByRole("region", { name: "Profile hero" });
  await expect(pendingHero).toBeVisible();
  await expect(pendingHero.locator("div.absolute").first()).toHaveCSS("background-image", /blob:/);
  await page.screenshot({ path: "test-results/profile-media-upload-pending.png", fullPage: true });
});

test("failed media uploads can be retried without losing the local hero preview", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await setDemoMediaUploadControl(page, { fail: true });
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  const failedHero = page.getByRole("region", { name: "Profile hero" });
  await expect(failedHero).toBeVisible();
  await expect(failedHero.locator("div.absolute").first()).toHaveCSS("background-image", /blob:/);
  await expect(
    page.getByRole("alert").filter({ hasText: "The media upload failed. Try again." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry upload", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
  ).toBeDisabled();
  await page.screenshot({ path: "test-results/profile-media-upload-failed.png", fullPage: true });

  await setDemoMediaUploadControl(page, { fail: false });
  await page.getByRole("button", { name: "Retry upload", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await page.getByLabel("Background image description").fill("Warm studio backdrop");
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry upload", exact: true })).toHaveCount(0);
});

test("compact contact actions keep labels accessible and publish their selected shape", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await selectWarmStudio(page);
  await page.getByRole("tab", { name: "Layout" }).click();

  const previewContacts = page
    .getByTestId("profile-preview-frame")
    .getByRole("navigation", { name: "Contact actions" });
  const contactLabels = ["Email", "Phone", "Website"];
  await expect(page.getByRole("radio", { name: "Icon + label", exact: true })).toBeChecked();
  for (const label of contactLabels) {
    await expect(previewContacts.getByRole("link", { name: label, exact: true })).toContainText(
      label,
    );
  }

  await page.getByRole("radio", { name: "Icons · circles", exact: true }).check();
  for (const label of contactLabels) {
    const link = previewContacts.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveText("");
    await expect(link).toHaveClass(/rounded-full/);
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes", exact: true }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  const publicContacts = page.getByRole("navigation", { name: "Contact actions" });
  for (const label of contactLabels) {
    const link = publicContacts.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAccessibleName(label);
    await expect(link).toHaveText("");
    await expect(link).toHaveClass(/rounded-full/);
  }

  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("radio", { name: "Icons · soft squares", exact: true }).check();
  for (const label of contactLabels) {
    const link = previewContacts.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveText("");
    await expect(link).toHaveClass(/rounded-control/);
  }
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.screenshot({ path: "test-results/compact-contact-preview.png", fullPage: true });

  await page.goto("/mara-velasquez");
  for (const label of contactLabels) {
    const link = publicContacts.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveText("");
    await expect(link).toHaveClass(/rounded-full/);
  }
  await page.goto("/app/customize");
  await page.getByRole("button", { name: "Publish changes", exact: true }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(publicContacts.getByRole("link", { name: "Email", exact: true })).toHaveClass(
    /rounded-control/,
  );
});

test("customer can cancel or apply a square profile photo crop", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  const photo = page.getByRole("img", { name: "Mara Velasquez profile" }).first();
  const previousSource = await photo.getAttribute("src");
  const imageInput = page.getByLabel("Profile photo or logo");
  await imageInput.setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");
  const cropDialog = page.getByRole("dialog", { name: "Adjust profile photo" });
  await expect(cropDialog).toBeVisible();
  const cropDialogBox = await cropDialog.boundingBox();
  expect(cropDialogBox).not.toBeNull();
  expect(cropDialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(cropDialogBox!.x + cropDialogBox!.width).toBeLessThanOrEqual(320);
  await expect(cropDialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
  await expect(cropDialog.getByRole("button", { name: "Apply", exact: true })).toBeInViewport();
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
  await expect
    .poll(() =>
      cropDialog
        .getByRole("heading", { name: "Adjust profile photo" })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/system-ui|sans-serif|Arial/i);
  await cropDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);
});

test("customer can crop a profile photo source larger than 5 MB", async ({ page }) => {
  const source = await sharp(randomBytes(1600 * 1600 * 3), {
    raw: { width: 1600, height: 1600, channels: 3 },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  expect(source.byteLength).toBeGreaterThan(5 * 1024 * 1024);
  expect(source.byteLength).toBeLessThanOrEqual(20 * 1024 * 1024);

  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/profile");
  const photo = page.getByRole("img", { name: "Mara Velasquez profile" }).first();
  const imageInput = page.getByLabel("Profile photo or logo");
  await imageInput.setInputFiles({
    name: "large-profile-source.png",
    mimeType: "image/png",
    buffer: source,
  });

  const cropDialog = page.getByRole("dialog", { name: "Adjust profile photo" });
  await expect(cropDialog).toBeVisible();
  await cropDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("status", { name: "Photo applied" })).toBeVisible();
  await expect(photo).toHaveAttribute("src", /^data:image\/jpeg;base64,.+/);
});

test("customer analytics and account controls stay scoped to the customer", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await expect.soft(page.locator("main h1")).toHaveCount(1);
  const rangeBox = await page.getByLabel("Time range").boundingBox();
  const metricsBox = await page.getByText("Profile views", { exact: true }).boundingBox();
  const trendBox = await page.getByRole("heading", { name: "Engagement trend" }).boundingBox();
  expect(rangeBox).not.toBeNull();
  expect(metricsBox).not.toBeNull();
  expect(trendBox).not.toBeNull();
  expect.soft(rangeBox!.y).toBeLessThan(metricsBox!.y);
  expect.soft(metricsBox!.y).toBeLessThan(trendBox!.y);
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Profile analytics" })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/system-ui|sans-serif|Arial/i);
  await expect(page.getByText("Profile views", { exact: true })).toBeVisible();
  await expect
    .soft(page.getByRole("heading", { name: "Views and clicks by source" }))
    .toBeVisible();
  await expect.soft(page.getByText(/Sources include profile views and link clicks/)).toBeVisible();
  await expect
    .soft(page.getByText(/Unknown \/ legacy.*without recorded attribution/i))
    .toBeVisible();
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
  await expect(page.getByText("Unknown / legacy", { exact: true }).locator("..")).toContainText(
    "27",
  );
  await expect(
    page.getByText("Profile views", { exact: true }).locator("..").getByText("18", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unique views", { exact: true }).locator("..").getByText("11", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Link clicks", { exact: true }).locator("..").getByText("9", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Account menu for / }).click();
  await page.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Delete account" })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/system-ui|sans-serif|Arial/i);
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByRole("dialog", { name: "Request account deletion?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});

test("a stale sign-in tab routes an account deletion request to recovery", async ({
  page,
  context,
}) => {
  await resetDemoHarness(page);

  const secondTab = await context.newPage();
  await signInAsCustomer(secondTab);
  await secondTab.goto("/app/account");
  await secondTab.getByRole("button", { name: "Request deletion" }).click();
  await secondTab.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(secondTab).toHaveURL(/\/login\?reason=account-inactive$/);

  await expect(page).toHaveURL(/\/login(?:\?reason=account-inactive)?$/);
  if (new URL(page.url()).searchParams.get("reason") !== "account-inactive") {
    await page.getByLabel("Email").fill("mara@example.test");
    await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }

  await expect(page).toHaveURL(/\/login\?reason=account-inactive$/);
  await expect(page.getByText(/Your account is inactive\./)).toBeVisible();
});

test("Account support and deletion copy explain the current outcomes", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/account");
  const support = page.getByRole("heading", { name: "Support" }).locator("..");
  await expect.soft(support).not.toContainText(/local build|generic/i);
  await expect(support.getByRole("link", { name: "Contact support", exact: true })).toBeVisible();
  const supportCopy = await support.innerText();
  expect.soft(supportCopy.match(/[.!?](?:\s|$)/g) ?? []).toHaveLength(1);
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByRole("dialog", { name: "Request account deletion?" })).toContainText(
    /profile.*unavailable.*active or registered cards.*deactivated immediately.*administrator.*review.*permanent removal/i,
  );
});

test("Account does not offer support when its destination is missing", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Persist setup before support fixture.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected demo state after saving the setup draft.");
    const state = JSON.parse(raw);
    state.supportUrl = "";
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/app/account");
  await expect(page.getByRole("link", { name: "Contact support", exact: true })).toHaveCount(0);
  await expect(page.getByText(/help is available/i)).toHaveCount(0);
});

test("customer analytics keeps zero totals and privacy context for an empty range", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Analytics fixture setup");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected demo state after sign-in.");
    const state = JSON.parse(raw);
    state.analytics = [];
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/app/analytics");
  await expect(page.getByText("Profile views", { exact: true }).locator("..")).toContainText("0");
  await expect(page.getByText("Link clicks", { exact: true }).locator("..")).toContainText("0");
  await expect(page.getByText(/No activity in this range yet/)).toBeVisible();
  await expect(page.getByText(/without identifying the people who viewed it/)).toBeVisible();
});

test("customer can continue from card design to the order form", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/app/card");
  await expect(page.getByText(/continue to the order form/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Build your own with Canva" })).toHaveAttribute(
    "href",
    "https://canva.link/tapit-templates",
  );
  await expect(page.getByLabel("Upload your design")).toBeAttached();
  await page
    .getByLabel("Upload your design")
    .setInputFiles("tests/fixtures/profile-images/transparent-logo.png");
  const preview = page.getByRole("dialog", { name: "Looks good?" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Continue to order" }).click();
  await expect(page).toHaveURL(/\/app\/card\/order-card$/);
  await expect(page.getByRole("heading", { name: "Order your card" })).toBeVisible();
});

test("customer can unpublish from Account", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page.goto("/app/account");
  await expect(page.getByRole("heading", { name: "Publication", exact: true })).toBeVisible();
  const publicProfile = page.getByRole("switch", { name: "Public profile", exact: true });
  await expect(publicProfile).toBeChecked();
  await publicProfile.click();
  await expect(publicProfile).toHaveCount(0);
  await expect(
    page.getByText("Profile unpublished. Visitors now see the unavailable page.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Basics", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Public profile", exact: true })).toHaveCount(0);
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});

test("customer utility workspaces fit phone, tablet, and desktop widths", async ({ page }) => {
  await signInAsCustomer(page);

  for (const route of ["/app/analytics", "/app/account", "/app/card", "/build-card"] as const) {
    await page.goto(route);
    if (route === "/app/card") {
      await expect
        .poll(() =>
          page
            .getByRole("heading", { name: "Bring your card to life" })
            .evaluate((heading) => getComputedStyle(heading).fontFamily),
        )
        .toMatch(/system-ui|sans-serif|Arial/i);
    }
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("main").first()).toBeVisible();
      if (route === "/app/analytics" && (width === 390 || width === 1280)) {
        await page.screenshot({ path: `test-results/customer-analytics-${width}.png` });
      }
      if (route === "/app/card" && (width === 390 || width === 1280)) {
        await page.screenshot({ path: `test-results/customer-build-card-${width}.png` });
      }
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scrollWidth > width) {
        const overflowingElements = await page.evaluate(() => {
          const viewportWidth = window.innerWidth;
          return Array.from(document.body.querySelectorAll<HTMLElement>("*"))
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return {
                tag: element.tagName,
                className: String(element.className).slice(0, 120),
                text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
                left: Math.round(bounds.left),
                right: Math.round(bounds.right),
                width: Math.round(bounds.width),
                clientWidth: element.clientWidth,
                scrollWidth: element.scrollWidth,
                overflow: Math.max(
                  Math.round(bounds.right - viewportWidth),
                  element.scrollWidth - element.clientWidth,
                ),
              };
            })
            .filter((element) => element.overflow > 0)
            .sort((left, right) => right.overflow - left.overflow)
            .slice(0, 30);
        });
        console.log(`Horizontal overflow on ${route} at ${width}px`, overflowingElements);
      }
      expect(scrollWidth).toBeLessThanOrEqual(width);
    }
  }
});
