import { expect, test, type Page } from "@playwright/test";
import { signInAsAdmin } from "./support/demo-harness";

async function signInAsCustomer(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
}

async function openMaraProfileDetails(page: Page) {
  await page.getByRole("button", { name: "Mara Velasquez /mara-velasquez" }).click();
  await expect(page.getByRole("dialog", { name: "Mara Velasquez profile" })).toBeVisible();
}

test("administrator edits and publishes the selected customer profile details", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Profiles" }).click();
  await openMaraProfileDetails(page);

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Edit profile" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Mara Velasquez Updated");
  await dialog.getByLabel("Bio or role", { exact: true }).fill("Updated by the administrator.");
  await dialog.getByLabel("Email", { exact: true }).fill("mara-updated@example.test");
  await dialog.getByRole("button", { name: "Save admin draft" }).click();
  await expect(
    dialog.getByText(
      "Administrative draft changes saved. Public content is unchanged until publication.",
    ),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    dialog.getByText("Profile published. The stable public URL now serves the approved snapshot."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close profile details" }).click();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez Updated" })).toBeVisible();
  await expect(page.getByText("Updated by the administrator.", { exact: true })).toBeVisible();
  await expect(page.locator('a[href="mailto:mara-updated@example.test"]')).toBeVisible();
});

test("administrator sidebar preserves operations and governance navigation", async ({ page }) => {
  await signInAsAdmin(page);

  const sidebar = page.getByTestId("workspace-sidebar");
  await expect
    .poll(() => sidebar.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(240, 237, 229)");

  const desktopNavigation = page.getByRole("navigation", { name: "Tapit operations navigation" });
  await expect(desktopNavigation).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Operations" })).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Governance" })).toBeVisible();
  await expect(desktopNavigation.getByRole("heading", { name: "Personal" })).toBeVisible();
  await expect(desktopNavigation.getByRole("link", { name: "My profile" })).toHaveAttribute(
    "href",
    "/app/profile",
  );
  for (const label of ["Customers", "Profiles", "Cards", "Analytics", "Audit log", "Settings"]) {
    await expect(desktopNavigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/customers");
  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  await openNavigation.click();
  const drawerNavigation = page.getByRole("navigation", { name: "Tapit operations navigation" });
  await expect(drawerNavigation).toBeVisible();
  await expect(
    drawerNavigation.getByRole("link", { name: "Audit log", exact: true }),
  ).toBeVisible();
  await expect(drawerNavigation.getByRole("link", { name: "My profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cards", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await drawerNavigation.getByRole("link", { name: "Cards", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/cards$/);
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await openNavigation.click();
  await drawerNavigation.getByRole("link", { name: "My profile" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("administrator records and governance pages remain usable at phone and desktop widths", async ({
  page,
}) => {
  await signInAsAdmin(page);

  const pages = [
    { path: "/admin/customers", heading: "Customers", marker: "Search customers" },
    { path: "/admin/profiles", heading: "Profiles", marker: "Search profiles" },
    { path: "/admin/cards", heading: "Cards", marker: "Search cards" },
    { path: "/admin/analytics", heading: "Analytics", marker: "Time range" },
    { path: "/admin/audit-log", heading: "Audit log", marker: "Search audit entries" },
    { path: "/admin/settings", heading: "Settings", marker: "Support destination" },
  ];

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const item of pages) {
      await page.goto(item.path);
      await expect(page.getByRole("heading", { name: item.heading, level: 1 })).toBeVisible();
      await expect(page.getByLabel(item.marker)).toBeVisible();
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
        console.log(`Horizontal overflow on ${item.path} at ${width}px`, overflowingElements);
      }
      expect(scrollWidth).toBeLessThanOrEqual(width);
    }
  }
});

test("administrator pages present a visible editorial page heading", async ({ page }) => {
  await signInAsAdmin(page);

  const pages = [
    { path: "/admin/customers", title: "Customers" },
    { path: "/admin/profiles", title: "Profiles" },
    { path: "/admin/cards", title: "Cards" },
    { path: "/admin/analytics", title: "Analytics" },
    { path: "/admin/audit-log", title: "Audit log" },
    { path: "/admin/settings", title: "Settings" },
  ];

  for (const item of pages) {
    await page.goto(item.path);
    const heading = page.getByRole("heading", { name: item.title, level: 1 });
    await expect(heading).toBeVisible();
    await expect
      .poll(() => heading.evaluate((element) => getComputedStyle(element).fontFamily))
      .toMatch(/ui-serif|Georgia|serif/i);
  }
});

test("administrator records and governance details stay readable on phones", async ({ page }) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/admin/customers");
  const mara = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await expect(mara).toBeVisible();
  await expect(mara.getByRole("button")).toContainText("Mara Velasquez");
  await expect(mara.getByText("active", { exact: true })).toBeVisible();
  await expect(mara.getByText("published", { exact: true })).toBeVisible();
  await expect(mara.getByRole("link", { name: "View profile" })).toBeVisible();
  const maraSelector = mara.getByRole("button");
  await maraSelector.click();
  await expect(maraSelector).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Selected customer" })).toBeVisible();

  await page.goto("/admin/profiles");
  const maraProfile = page.getByRole("button", { name: "Select Mara Velasquez profile" });
  await expect(maraProfile).toContainText("published");
  await maraProfile.click();
  const dialog = page.getByRole("dialog", { name: "Mara Velasquez profile" });
  await expect(dialog.getByRole("tab", { name: "Edit profile" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Details & slug" })).toBeVisible();

  await page.goto("/admin/cards");
  const card = page.locator("article").filter({ hasText: "mara-card-7f2q" }).first();
  await expect(card).toBeVisible();
  await expect(card.locator("summary")).toContainText("Mara Velasquez");
  await expect(card.locator("summary")).toContainText("active");
});

test("administrator analytics, audit, and settings keep their scoped feedback clear", async ({
  page,
}) => {
  await signInAsAdmin(page);

  await page.goto("/admin/analytics");
  await expect(page.getByRole("heading", { name: "Engagement overview" })).toBeVisible();
  await expect(page.getByText(/Cross-customer totals are aggregate-only/)).toBeVisible();
  await expect(page.getByText("Profile views", { exact: true })).toBeVisible();
  await expect(page.getByText("Unique views", { exact: true })).toBeVisible();
  await expect(page.getByText("Link clicks", { exact: true })).toBeVisible();
  await expect(page.getByText(/visitor identity|raw event history/i)).toBeVisible();

  await page.goto("/admin/audit-log");
  const auditEntry = page.locator("details").first();
  await expect(auditEntry.getByText(/^By /)).toBeVisible();
  await expect(auditEntry.locator("time")).toBeVisible();
  await expect(auditEntry.getByText("View details")).toBeVisible();

  await page.goto("/admin/settings");
  await page.getByLabel("Support destination").fill("mailto:support@example.test");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Support destination saved.")).toBeVisible();
});

test("administrator profile registry uses scannable desktop rows", async ({ page }) => {
  await signInAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/profiles");

  const registry = page.getByRole("table", { name: "Profile registry" });
  await expect(registry).toBeVisible();
  await expect(registry.getByRole("columnheader", { name: "Profile" })).toBeVisible();
  await expect(registry.getByRole("columnheader", { name: "Public URL" })).toBeVisible();
  await expect(registry.getByRole("row", { name: /Mara Velasquez.*published/i })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: "test-results/ui-redesign/admin-profiles-desktop.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(registry).toBeHidden();
  await expect(page.getByRole("button", { name: "Select Mara Velasquez profile" })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: "test-results/ui-redesign/admin-profiles-mobile.png" });
});

test("administrator can inspect only the selected profile analytics and traffic sources", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByLabel("Customer email").fill("analytics-seed@example.test");
  await page.getByRole("button", { name: "Create and invite" }).click();
  await expect(
    page.getByText("Customer account created for analytics-seed@example.test."),
  ).toBeVisible();
  await page.evaluate(() => {
    const rawState = window.localStorage.getItem("tapit:demo-state:v1");
    if (rawState === null) throw new Error("Demo state was not initialized.");
    const state = JSON.parse(rawState) as { analytics: Array<Record<string, unknown>> };
    const now = Date.now();
    state.analytics = [
      {
        profileId: "profile-mara",
        bucketStart: now - 3 * 86400000,
        source: "nfc",
        views: 7,
        uniqueViews: 5,
        clicks: 2,
        linkClicks: { linkedin: 2 },
      },
      {
        profileId: "profile-mara",
        bucketStart: now - 2 * 86400000,
        source: "qr",
        views: 3,
        uniqueViews: 2,
        clicks: 1,
        linkClicks: { portfolio: 1 },
      },
      {
        profileId: "profile-claimable",
        bucketStart: now - 86400000,
        source: "direct",
        views: 99,
        uniqueViews: 90,
        clicks: 8,
        linkClicks: { site: 8 },
      },
      {
        profileId: "profile-mara",
        bucketStart: now - 40 * 86400000,
        source: "direct",
        views: 400,
        uniqueViews: 300,
        clicks: 40,
        linkClicks: { booking: 40 },
      },
    ];
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/admin/analytics");
  await page.getByLabel("Time range").selectOption("7d");

  const maraButton = page.getByRole("button", { name: /View analytics for Mara Velasquez/ });
  await maraButton.click();
  const maraDialog = page.getByRole("dialog", { name: "Mara Velasquez analytics" });
  await expect(maraDialog).toBeVisible();

  const maraSummary = maraDialog.getByRole("region", { name: "Engagement summary" });
  const maraDefinitions = maraSummary.getByRole("definition");
  await expect(maraDefinitions.nth(0)).toHaveText("10");
  await expect(maraDefinitions.nth(1)).toHaveText("7");
  await expect(maraDefinitions.nth(2)).toHaveText("3");
  const maraSources = maraDialog.getByRole("region", { name: "Traffic sources" });
  await expect(maraSources.getByText("NFC", { exact: true }).locator("..")).toContainText("9");
  await expect(maraSources.getByText("QR code", { exact: true }).locator("..")).toContainText("4");
  await expect(
    maraDialog.getByRole("region", { name: "Link results" }).getByText("2 clicks", { exact: true }),
  ).toBeVisible();
  await expect(maraDialog).not.toContainText("99");
  await expect(maraDialog).not.toContainText("400");

  await page.keyboard.press("Escape");
  await expect(maraDialog).toBeHidden();
  await expect(maraButton).toBeFocused();

  await page.getByRole("button", { name: /View analytics for Claimed profile/ }).click();
  const claimedDialog = page.getByRole("dialog", { name: "Claimed profile analytics" });
  await expect(
    claimedDialog
      .getByRole("region", { name: "Engagement summary" })
      .getByRole("definition")
      .nth(0),
  ).toHaveText("99");
  await expect(
    claimedDialog
      .getByRole("region", { name: "Traffic sources" })
      .getByText("Direct profile", { exact: true })
      .locator(".."),
  ).toContainText("107");
});

test("administrator profile analytics dialog contains keyboard and assistive navigation", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.goto("/admin/analytics");

  const profileButton = page.getByRole("button", { name: /View analytics for Mara Velasquez/ });
  await profileButton.click();
  const dialog = page.getByRole("dialog", { name: "Mara Velasquez analytics" });
  const closeButton = dialog.getByRole("button", { name: "Close profile analytics" });
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeButton).toBeFocused();

  await page.getByLabel("Time range").focus();
  await expect(closeButton).toBeFocused();

  const accessibilitySession = await page.context().newCDPSession(page);
  try {
    const { nodes } = await accessibilitySession.send("Accessibility.getFullAXTree");
    expect(
      nodes.some(
        (node) => node.role?.value === "dialog" && node.name?.value === "Mara Velasquez analytics",
      ),
    ).toBe(true);
    expect(
      nodes.some((node) => node.role?.value === "combobox" && node.name?.value === "Time range"),
    ).toBe(false);
    expect(
      nodes.some(
        (node) =>
          node.role?.value === "navigation" && node.name?.value === "Tapit operations navigation",
      ),
    ).toBe(false);
  } finally {
    await accessibilitySession.detach();
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(profileButton).toBeFocused();
});

test("administrator owns a private personal workspace and keeps console access", async ({
  page,
}) => {
  await signInAsAdmin(page);
  const nav = page.getByRole("navigation", { name: "Tapit operations navigation" });
  await expect(nav.getByRole("heading", { name: "Personal" })).toBeVisible();
  await nav.getByRole("link", { name: "My profile" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await expect(page.getByLabel("Name")).toHaveValue("Tapit Admin");
  await expect(page.getByLabel("Stable profile slug")).toHaveValue("admin-tapit");
  const profileNavigation = page.getByRole("navigation", {
    name: "Your Tapit profile navigation",
  });
  const customizeLink = profileNavigation.getByRole("link", { name: "Customize", exact: true });
  await expect(customizeLink).toBeVisible();
  await customizeLink.click();
  await expect(page).toHaveURL(/\/app\/customize$/);
  await expect(page.getByRole("heading", { name: "Customize your profile" })).toBeVisible();
  await page.goto("/app/profile");
  await profileNavigation.getByRole("link", { name: "Admin workspace" }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
  await expect(page.getByRole("heading", { name: "Customer accounts" })).toBeVisible();
});

test("administrator publishes only after editing their own draft", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/app/profile");
  await expect(page.getByLabel("Name")).toHaveValue("Tapit Admin");
  await page.goto("/admin-tapit");
  await expect(page.getByRole("heading", { name: "Profile not found" })).toBeVisible();

  await page.goto("/app/profile");
  await page.getByLabel("Name").fill("Admin Personal Profile");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.goto("/app/links");
  await page.getByRole("button", { name: "Add link" }).click();
  await page
    .getByRole("textbox", { name: /Label for/ })
    .last()
    .fill("Portfolio");
  await page
    .getByRole("textbox", { name: /Destination for/ })
    .last()
    .fill("https://example.com");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.goto("/app/profile");
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(page.getByText(/Profile published/)).toBeVisible();
  await page.goto("/admin-tapit");
  await expect(page.getByRole("heading", { name: "Admin Personal Profile" })).toBeVisible();

  await page.goto("/app/account/build-card");
  await expect(page.getByRole("heading", { name: "Bring your card to life" })).toBeVisible();
  await page.goto("/app/analytics");
  await expect(page.getByRole("heading", { name: "Profile analytics" })).toBeVisible();
  await page.goto("/app/account");
  await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request deletion" })).toBeDisabled();
  await page.getByRole("button", { name: "Account menu for admin@tapit.local" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signInAsCustomer(page);
  await expect(page.getByLabel("Name")).toHaveValue("Mara Velasquez");
  await page.goto("/admin/customers");
  await expect(page).toHaveURL(/\/app\/profile$/);
});

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
  const replacementDialog = page.getByRole("dialog", { name: "Replace this card?" });
  await expect(replacementDialog).toContainText("mara-card-7f2q");
  await expect(replacementDialog).toContainText("/c/replacement-card-xyz");
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
  await openMaraProfileDetails(page);
  await page.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByRole("dialog", { name: "Suspend this profile?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Suspend profile" }).click();
  await expect(page.getByText("Profile status changed to suspended.")).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();

  await page.goto("/admin/profiles");
  await openMaraProfileDetails(page);
  await page.getByRole("button", { name: "Restore profile" }).click();
  await expect(page.getByText("Profile status changed to published.")).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
});

test("administrator changes a slug without publishing drafts, keeps card URLs stable, and frees the old slug", async ({
  page,
}) => {
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Profiles" }).click();
  await openMaraProfileDetails(page);

  const maraDialog = page.getByRole("dialog", { name: "Mara Velasquez profile" });
  const editTab = maraDialog.getByRole("tab", { name: "Edit profile" });
  const detailsTab = maraDialog.getByRole("tab", { name: "Details & slug" });
  await expect(editTab).toHaveAttribute("aria-selected", "true");
  await editTab.focus();
  await editTab.press("ArrowRight");
  await expect(detailsTab).toHaveAttribute("aria-selected", "true");
  await expect(detailsTab).toBeFocused();
  await detailsTab.press("ArrowLeft");
  await expect(editTab).toHaveAttribute("aria-selected", "true");
  await expect(editTab).toBeFocused();
  await maraDialog.getByRole("textbox", { name: "Bio or role" }).fill("Draft-only bio update.");
  await editTab.press("ArrowRight");
  await expect(detailsTab).toHaveAttribute("aria-selected", "true");

  const savedDraft = maraDialog.getByRole("region", { name: "Saved draft content" });
  const publishedSnapshot = maraDialog.getByRole("region", { name: "Published snapshot content" });
  const maraDetailsPanel = maraDialog.getByRole("tabpanel", { name: "Details & slug" });
  await maraDetailsPanel.getByLabel("Profile slug").fill("mara-renamed-e2e");
  await maraDialog.getByRole("button", { name: "Save slug" }).click();
  await expect(maraDialog.getByText("Profile slug changed.", { exact: true })).toBeVisible();
  await expect(savedDraft.getByText("Draft-only bio update.", { exact: true })).toBeVisible();
  await expect(
    publishedSnapshot.getByText("Brand systems for independent teams.", { exact: true }),
  ).toBeVisible();
  await expect(publishedSnapshot.getByText("Draft-only bio update.", { exact: true })).toHaveCount(
    0,
  );
  await maraDialog.getByRole("button", { name: "Close profile details" }).click();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Profile not found" })).toBeVisible();
  await page.goto("/mara-renamed-e2e");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(
    page.getByText("Brand systems for independent teams.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Draft-only bio update.", { exact: true })).toHaveCount(0);
  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();

  await page.goto("/admin/audit-log");
  const slugAudit = page.locator("details").filter({ hasText: "Profile slug changed" }).first();
  await expect(slugAudit).toBeVisible();
  await slugAudit.locator("summary").click();
  await expect(
    slugAudit.getByText("mara-velasquez → mara-renamed-e2e", { exact: true }),
  ).toBeVisible();

  await page.goto("/admin/profiles");
  await page.getByRole("button", { name: "Tapit Admin /admin-tapit" }).click();
  const adminDialog = page.getByRole("dialog", { name: "Tapit Admin profile" });
  const adminDetailsTab = adminDialog.getByRole("tab", { name: "Details & slug" });
  await adminDetailsTab.click();
  const adminDetailsPanel = adminDialog.getByRole("tabpanel", { name: "Details & slug" });
  await adminDetailsPanel.getByLabel("Profile slug").fill("mara-velasquez");
  await adminDetailsPanel.getByRole("button", { name: "Save slug" }).click();
  await expect(adminDialog.getByText("Profile slug changed.", { exact: true })).toBeVisible();
  await expect(adminDialog.getByText("/mara-velasquez", { exact: true })).toBeVisible();
});

test("administrator approves a customer deletion request", async ({ page }) => {
  await signInAsCustomer(page);
  await page.getByRole("link", { name: "Account" }).click();
  await page.getByRole("button", { name: "Request deletion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Request deletion" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Faccount$/);

  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Profiles" }).click();
  await openMaraProfileDetails(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText(
      "Your customer account is inactive or pending deletion. Contact support before publishing.",
    ),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Mara Velasquez profile" })
    .getByRole("button", { name: "Close profile details" })
    .click();
  await page.getByRole("link", { name: "Customers" }).click();
  const customer = page.locator("article").filter({ hasText: "mara@example.test" }).first();
  await page.setViewportSize({ width: 320, height: 844 });
  await customer.getByRole("button", { name: "Approve deletion" }).click();
  const approvalDialog = page.getByRole("dialog", { name: "Approve account deletion?" });
  await expect(approvalDialog).toBeVisible();
  const approvalDialogBox = await approvalDialog.boundingBox();
  expect(approvalDialogBox).not.toBeNull();
  expect(approvalDialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(approvalDialogBox!.x + approvalDialogBox!.width).toBeLessThanOrEqual(320);
  await expect(approvalDialog.getByRole("button", { name: "Approve deletion" })).toBeInViewport();
  await approvalDialog.getByRole("button", { name: "Approve deletion" }).click();
  await expect(
    page.getByText(
      "Deletion approved. The account is closed and its profile and cards remain unavailable.",
    ),
  ).toBeVisible();
  await expect(customer.getByText("deleted", { exact: true })).toBeVisible();
  await page.goto("/admin/audit-log");
  await expect(page.getByText("Account deletion approved")).toBeVisible();
});

test("administrator can expand audit entries to read account changes", async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByLabel("Customer email").fill("audit-test@example.test");
  await page.getByRole("button", { name: "Create and invite" }).click();
  await expect(
    page.getByText("Customer account created for audit-test@example.test."),
  ).toBeVisible();
  await page.evaluate(() => {
    const rawState = window.localStorage.getItem("tapit:demo-state:v1");
    if (rawState === null) throw new Error("Demo state was not initialized.");
    const state = JSON.parse(rawState) as {
      audits: Array<Record<string, string>>;
    };
    state.audits.unshift(
      {
        id: "audit-readable-account-created",
        actor: "harley@example.test",
        action: "auth.google_account_provisioned",
        target: "harley-albert-buendia",
        occurredAt: "2026-09-25T08:54:00.000Z",
        after: JSON.stringify({ role: "customer", status: "pending" }),
      },
      {
        id: "audit-readable-onboarding",
        actor: "harley@example.test",
        action: "customer.onboarding_completed",
        target: "harley-albert-buendia",
        occurredAt: "2026-09-25T08:55:00.000Z",
        after: JSON.stringify({ slug: "harley-albert-buendia" }),
      },
      {
        id: "audit-readable-role-change",
        actor: "admin@example.test",
        action: "customer.role_changed",
        target: "harley-albert-buendia",
        targetAccountEmail: "harley@example.test",
        occurredAt: "2026-09-25T08:56:00.000Z",
        before: "customer",
        after: "admin",
      },
    );
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await page.goto("/admin/audit-log");

  const entry = page.locator("details").filter({ hasText: "Google account created" });
  await expect(entry).toBeVisible();
  await expect(entry.getByText("View details")).toBeVisible();
  await expect(entry).not.toContainText('{"role":"customer","status":"pending"}');
  await entry.getByText("View details").click();
  await expect(entry.getByText(/Account role/)).toBeVisible();
  await expect(entry.getByText(/Not recorded → Customer/)).toBeVisible();
  await expect(entry.getByText(/Account status/)).toBeVisible();
  await expect(entry.getByText(/Not recorded → Pending/)).toBeVisible();

  const onboarding = page.locator("details").filter({ hasText: "Customer onboarding completed" });
  await onboarding.getByText("View details").click();
  await expect(onboarding.getByText(/Profile slug/)).toBeVisible();
  await expect(onboarding.getByText(/Not recorded → harley-albert-buendia/)).toBeVisible();

  const roleChange = page.locator("details").filter({ hasText: "Customer role changed" });
  await expect(
    roleChange.getByText("By admin@example.test · Account: harley@example.test"),
  ).toBeVisible();
  await roleChange.getByText("View details").click();
  await expect(roleChange.getByText(/Customer → Administrator/)).toBeVisible();
});
