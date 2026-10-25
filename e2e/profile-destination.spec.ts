import { expect, test } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

test("published profile destination controls where the slug link goes", async ({
  page,
}, testInfo) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  const tapitProfileChoice = page.getByRole("button", { name: "Tapit profile", exact: true });
  const redirectChoice = page.getByRole("button", { name: "Redirect link", exact: true });
  await expect(tapitProfileChoice).toHaveCount(0);
  await expect(redirectChoice).toHaveCount(0);
  await page.goto("/app/links");
  await expect(tapitProfileChoice).toHaveAttribute("aria-pressed", "true");
  await expect(redirectChoice).toHaveAttribute("aria-pressed", "false");

  const destination = "https://destination.example.test/contact";
  await page.route("https://destination.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><main><h1>Website destination loaded</h1></main></body></html>",
    }),
  );

  await redirectChoice.click();
  await expect(redirectChoice).toHaveAttribute("aria-pressed", "true");
  await expect(tapitProfileChoice).toHaveAttribute("aria-pressed", "false");
  const linkedInRow = page
    .locator("article")
    .filter({ has: page.getByRole("textbox", { name: "Label for LinkedIn" }) });
  await expect(page.getByRole("button", { name: "Add link" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Label for LinkedIn" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Destination for LinkedIn" })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: "Enable LinkedIn" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reorder LinkedIn" })).toBeDisabled();
  await expect(
    linkedInRow.getByRole("button", { name: "Preset icon for LinkedIn: LinkedIn" }),
  ).toBeDisabled();
  await expect(linkedInRow).toHaveCSS("opacity", "0.55");
  const actionsMenu = linkedInRow.locator("details");
  const actionsSummary = actionsMenu.locator("summary");
  await actionsSummary.focus();
  await expect(actionsSummary).not.toBeFocused();
  const summaryBox = await actionsSummary.boundingBox();
  expect(summaryBox).not.toBeNull();
  await page.mouse.click(
    summaryBox!.x + summaryBox!.width / 2,
    summaryBox!.y + summaryBox!.height / 2,
  );
  await expect(actionsMenu).toHaveJSProperty("open", false);
  await expect(actionsMenu.locator("button").filter({ hasText: "Move down" })).toBeDisabled();
  await expect(actionsMenu.locator("button").filter({ hasText: "Delete" })).toBeDisabled();
  await expect(
    page.getByText(
      "Profile links are paused while visitors go to your website. Switch to Tapit profile to edit them.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  const redirectInput = page.getByRole("textbox", { name: "HTTPS destination URL" });
  await expect(redirectInput).toHaveAttribute("aria-invalid", "true");
  await expect(
    redirectInput
      .locator("xpath=..")
      .getByRole("alert")
      .filter({ hasText: "Redirect destination must be a valid HTTPS URL without credentials." }),
  ).toBeVisible();
  await redirectInput.fill(destination);
  const settingsArtifact = testInfo.outputPath("profile-destination-settings.png");
  await page
    .getByRole("heading", { name: "Destination", exact: true })
    .locator("xpath=..")
    .screenshot({ path: settingsArtifact });
  await testInfo.attach("profile-destination-settings", {
    path: settingsArtifact,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Links saved to draft.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Phone" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();

  await page.goto("/app/links");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Links published. The public profile now uses this order and enabled state."),
  ).toBeVisible();
  await page.goto("/mara-velasquez");
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole("heading", { name: "Website destination loaded" })).toBeVisible();
  const redirectArtifact = testInfo.outputPath("published-website-destination.png");
  await page.screenshot({ path: redirectArtifact, fullPage: true });
  await testInfo.attach("published-website-destination", {
    path: redirectArtifact,
    contentType: "image/png",
  });

  await page.goto("/app/links");
  await tapitProfileChoice.click();
  await expect(tapitProfileChoice).toHaveAttribute("aria-pressed", "true");
  await expect(redirectChoice).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Add link" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Label for LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Destination for LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "Enable LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reorder LinkedIn" })).toBeEnabled();
  await expect(
    linkedInRow.getByRole("button", { name: "Preset icon for LinkedIn: LinkedIn" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Links published. The public profile now uses this order and enabled state."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Phone" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();
  const profileArtifact = testInfo.outputPath("published-tapit-profile.png");
  await page.screenshot({ path: profileArtifact, fullPage: true });
  await testInfo.attach("published-tapit-profile", {
    path: profileArtifact,
    contentType: "image/png",
  });
});
