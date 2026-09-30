import { expect, test, type Page } from "@playwright/test";

import {
  resetDemoHarness,
  setDemoMediaUploadControl,
  signInAsAdmin,
  signInAsCustomer,
} from "./support/demo-harness";

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

test("editor actions stay beside the preview on desktop and fit on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1467, height: 899 });
  await signInAsCustomer(page);

  for (const route of ["/app/profile", "/app/links"]) {
    await page.goto(route);
    if (route === "/app/profile") {
      await page.getByLabel("Bio or role").fill("Layout preview draft");
      const nameBox = await page.getByLabel("Name").boundingBox();
      const bioBox = await page.getByLabel("Bio or role").boundingBox();
      expect(nameBox).not.toBeNull();
      expect(bioBox).not.toBeNull();
      expect(bioBox!.height).toBeLessThanOrEqual(nameBox!.height * 2);
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
      const profileUrl = page.getByRole("link", { name: "/mara-velasquez", exact: true });
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

    const previewBox = await preview.boundingBox();
    const saveBox = await save.boundingBox();
    const publishBox = await publish.boundingBox();
    expect(previewBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(publishBox).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      1467,
    );

    await page.setViewportSize({ width: 390, height: 700 });
    await expect(save).toBeInViewport();
    await expect(publish).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({
      path: `test-results/${route === "/app/profile" ? "profile" : "links"}-actions-mobile.png`,
      fullPage: false,
    });
    await page.setViewportSize({ width: 1467, height: 899 });
  }
});

test("profile preview can be reached from the editor header on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAsCustomer(page);
  await page.goto("/app/profile");

  const previewShortcut = page.getByRole("link", { name: "View preview", exact: true });
  await expect(previewShortcut).toBeVisible();
  await previewShortcut.click();
  await expect(page).toHaveURL(/#workspace-preview$/);
  await expect(page.getByRole("heading", { name: "Preview", exact: true })).toBeInViewport();

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/app/profile");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const webPreviewShortcut = page.getByRole("link", { name: "View preview", exact: true });
  await page.screenshot({
    path: "test-results/ui-redesign/customer-profile-web-preview-shortcut.png",
  });
  await webPreviewShortcut.click();
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
      await page.getByRole("radio", { name: "Coral" }).check();
    }

    await expect(actions).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
    ).toBeVisible();
  }
});

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

test("standalone card builder keeps its public shell and upload preview usable", async ({
  page,
}) => {
  await signInAsCustomer(page);
  await page.goto("/build-card");

  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Your Tapit profile navigation/ })).toHaveCount(
    0,
  );
  const heading = page.getByRole("heading", { name: "Bring your card to life" });
  await expect(heading).toBeVisible();
  await expect
    .poll(() => heading.evaluate((element) => getComputedStyle(element).fontFamily))
    .toMatch(/^Georgia/i);

  for (const width of [390, 1280]) {
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
  await preview.getByRole("button", { name: /Order a card now/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Ordering is coming soon" }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "Choose another design" }).click();
  await expect(preview).toHaveCount(0);
});

test("active-card QR downloads keep the warm surface and remain available", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/admin/cards");

  await page.locator("details").filter({ hasText: "mara-card-7f2q" }).locator("summary").click();
  const qrTitle = page.getByText("QR fallback", { exact: true }).first();
  await expect(qrTitle).toBeVisible();
  const qrPanel = qrTitle.locator("xpath=..");
  await expect
    .poll(() => qrPanel.evaluate((panel) => getComputedStyle(panel).backgroundColor))
    .toBe("rgb(240, 237, 229)");
  const png = page.getByRole("link", { name: "Download PNG" }).first();
  await expect(qrPanel).toContainText("/c/mara-card-7f2q?source=qr");
  await expect(png).toHaveAttribute("href", /^data:image\/png;base64,/);
  await expect(png).toHaveAttribute("download", /\.png$/);
  await expect(page.getByRole("button", { name: "Download SVG" }).first()).toBeEnabled();
  await expect
    .poll(() => png.evaluate((anchor) => getComputedStyle(anchor).borderTopLeftRadius))
    .toBe("18px");
  await expect(page.getByRole("img", { name: /QR code for/ }).first()).toBeVisible();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await png.scrollIntoViewIfNeeded();
    await expect(png).toBeInViewport();
    const panelBox = await qrPanel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(width);
  }
});

test("customer sidebar uses the Warm Editorial surface and stays grouped across desktop and mobile", async ({
  page,
}) => {
  await signInAsCustomer(page);
  await expect(page.getByRole("heading", { name: "Profile identity" })).toBeVisible();
  const island = page.getByTestId("workspace-sidebar");
  await expect
    .poll(() => island.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(240, 237, 229)");
  const desktopBox = await island.boundingBox();
  expect(desktopBox).not.toBeNull();
  expect(desktopBox!.x).toBe(0);
  expect(desktopBox!.y).toBe(0);
  await page.setViewportSize({ width: 1117, height: 900 });
  const railBox = await island.boundingBox();
  expect(railBox).not.toBeNull();
  expect(railBox!.x + railBox!.width).toBeLessThan(1117);
  const railProfile = island.getByRole("link", { name: "Profile", exact: true });
  await expect(railProfile).toBeVisible();
  await railProfile.focus();
  await expect(railProfile).toBeFocused();

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
  ).toEqual({ position: "sticky", top: "0px" });
  await page.evaluate(() => window.scrollTo(0, 500));
  expect((await mobileHeader.boundingBox())?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
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
  await expect(mobileAccountMenu).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(signOutButton).toHaveCount(0);
  await expect(drawerNavigation).toBeVisible();
  await expect(mobileAccountMenu).toBeFocused();
  await expect(openNavigation).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(drawerNavigation).toBeHidden();
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

test("refreshed profile editor and preview preserve draft controls", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInAsCustomer(page);
  for (const heading of [
    "Profile identity",
    "Contact and links",
    "About or Services",
    "Publication",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Profile identity", exact: true })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/^Georgia/i);
  await expect(page.getByLabel("Website", { exact: true })).toBeVisible();
  await expect(page.getByText("Public URL", { exact: true })).toBeVisible();
  const frame = page.getByTestId("profile-preview-frame");
  const previewDevice = page.getByTestId("profile-preview-device");
  await expect(previewDevice).toBeVisible();
  const phoneWidth = (await frame.boundingBox())!.width;
  await page.getByRole("button", { name: "desktop", exact: true }).click();
  await expect(page.getByRole("button", { name: "desktop", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(phoneWidth);
  await expect(previewDevice).toBeHidden();
  await page.getByRole("button", { name: "phone", exact: true }).click();
  await expect(previewDevice).toBeVisible();
  await expect(page.getByRole("link", { name: "Open profile" })).toBeVisible();
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile URL copied." })).toBeVisible();
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
    path: "test-results/ui-redesign/profile-editor-desktop.png",
    fullPage: true,
  });
  for (const width of [1117, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  expect(
    (await page.getByRole("link", { name: "/mara-velasquez" }).boundingBox())!.width,
  ).toBeGreaterThan(100);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/ui-redesign/profile-editor-mobile.png",
    fullPage: true,
  });
});

test("profile URL remains available when clipboard access fails", async ({ page }) => {
  await signInAsCustomer(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("Clipboard unavailable")),
    });
  });
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Could not copy automatically" }),
  ).toContainText(`${new URL(page.url()).origin}/mara-velasquez`);
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

test("profile editors remove redundant visible titles and subtitles", async ({ page }) => {
  await signInAsCustomer(page);

  for (const [route, title, subtitle] of [
    ["/app/profile", "Your profile", "Edit your details and see how your profile looks to others."],
    ["/app/customize", "Customize your profile", "Tune the look and feel of your public profile."],
  ] as const) {
    await page.goto(route);
    const heading = page.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeAttached();
    const headingBox = await heading.boundingBox();
    expect(headingBox).not.toBeNull();
    expect(headingBox!.width).toBeLessThanOrEqual(1);
    expect(headingBox!.height).toBeLessThanOrEqual(1);
    await expect(page.getByText(subtitle, { exact: true })).toHaveCount(0);
  }
});

test("the link table contains its add action", async ({ page }) => {
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  const addLink = linkTable.getByRole("button", { name: "Add link", exact: true });
  await expect(addLink).toBeVisible();
  const originalCount = await linkTable.locator("article").count();
  await addLink.click();
  await expect(linkTable.locator("article")).toHaveCount(originalCount + 1);
});

test("the last link action menu stays visible above the draft bar", async ({ page }) => {
  await page.setViewportSize({ width: 1467, height: 899 });
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const linkTable = page.locator('[aria-label="Editable profile links"]');
  await page.getByRole("button", { name: "Add link", exact: true }).click();
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
  await page.setViewportSize({ width: 1467, height: 899 });
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

test("link rows shift while the drag is still held", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1467, height: 899 });
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
  await expect(page.getByRole("link", { name: "Profile", exact: true })).toHaveAttribute(
    "href",
    "/app/profile",
  );
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
        .getByRole("heading", { name: "Redirect card taps and scans", exact: true })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/^Georgia/i);
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

test("customer customization drafts stay private until the profile is published", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page.goto("/app/customize");
  await expect
    .poll(() =>
      page
        .getByRole("tabpanel")
        .first()
        .evaluate((panel) => getComputedStyle(panel).backgroundColor),
    )
    .toBe("rgb(255, 253, 248)");
  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("radio", { name: "Editorial" }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.goto("/app/profile");
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
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", {
      name: "Email",
    }),
  ).toBeVisible();
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

  await page.goto("/app/customize");
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
  await page.goto("/app/customize");

  await page.getByRole("tab", { name: "Media" }).click();
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

  const storedMedia = await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected demo state after saving media.");
    const state = JSON.parse(raw) as {
      profile?: { draft?: { media?: { background?: Record<string, unknown> } } };
      profiles?: Array<{ draft?: { media?: { background?: Record<string, unknown> } } }>;
    };
    const profile = state.profiles?.find((candidate) => candidate.draft?.media?.background);
    return profile?.draft?.media?.background ?? state.profile?.draft?.media?.background;
  });
  expect(storedMedia).toBeTruthy();
  expect(storedMedia).not.toHaveProperty("previewUrl");
  expect(typeof storedMedia?.url).toBe("string");
  expect((storedMedia?.url as string).startsWith("data:image/")).toBe(true);
  expect((storedMedia?.url as string).length).toBeLessThan(250_000);

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("region", { name: "Profile hero" })).toHaveCount(0);

  await page.goto("/app/customize");
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

test("high-entropy demo media is reduced below the storage limit", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
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

  const storedMedia = await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected demo state after saving high-entropy media.");
    const state = JSON.parse(raw) as {
      profile?: { draft?: { media?: { background?: Record<string, unknown> } } };
      profiles?: Array<{ draft?: { media?: { background?: Record<string, unknown> } } }>;
    };
    const profile = state.profiles?.find((candidate) => candidate.draft?.media?.background);
    return profile?.draft?.media?.background ?? state.profile?.draft?.media?.background;
  });
  expect(storedMedia).toBeTruthy();
  expect(storedMedia).not.toHaveProperty("previewUrl");
  expect((storedMedia?.url as string).startsWith("data:image/")).toBe(true);
  expect((storedMedia?.url as string).length).toBeLessThan(250_000);
});

test("incomplete background media stays in preview but blocks saving and publishing", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("tab", { name: "Media" }).click();
  await page
    .getByLabel("Upload background image")
    .setInputFiles("tests/fixtures/profile-images/opaque-landscape.png");

  await expect(page.getByRole("status").filter({ hasText: "Uploading image" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Profile hero" })).toBeVisible();
  await expect(
    page.getByText("A background image needs an accessible description.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft", exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /^(?:Publish(?: changes)?|Published)$/ }),
  ).toBeDisabled();

  await page.getByLabel("Background image description").fill("Warm studio backdrop");
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
    await expect(link).toHaveClass(/rounded-lg/);
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
    /rounded-lg/,
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
    .toMatch(/^Georgia/i);
  await cropDialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(cropDialog).toHaveCount(0);
  await expect(photo).toHaveAttribute("src", /^data:image\/png;base64,/);
});

test("customer analytics and account controls stay scoped to the customer", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Profile analytics" })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/^Georgia/i);
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
  await expect(page).toHaveURL(/\/app\/account$/);
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByRole("heading", { name: "Delete account" })
        .evaluate((heading) => getComputedStyle(heading).fontFamily),
    )
    .toMatch(/^Georgia/i);
  await page.getByRole("button", { name: "Request deletion" }).click();
  await expect(page.getByRole("dialog", { name: "Request account deletion?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});

test("customer can unpublish from Account", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await page.goto("/app/account");
  await expect(page.getByRole("heading", { name: "Publication", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(
    page.getByText("Profile unpublished. Visitors now see the unavailable page.", {
      exact: true,
    }),
  ).toBeVisible();

  await page.goto("/app/profile");
  await expect(page.getByRole("heading", { name: "Publication", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toHaveCount(0);
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});

test("customer utility workspaces fit phone and desktop widths", async ({ page }) => {
  await signInAsCustomer(page);

  for (const route of ["/app/analytics", "/app/account", "/app/account/build-card"] as const) {
    await page.goto(route);
    if (route === "/app/account/build-card") {
      await expect
        .poll(() =>
          page
            .getByRole("heading", { name: "Bring your card to life" })
            .evaluate((heading) => getComputedStyle(heading).fontFamily),
        )
        .toMatch(/Georgia|Times New Roman/i);
    }
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("main").first()).toBeVisible();
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
