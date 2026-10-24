import { expect, test } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

test("published profile destination controls where the slug link goes", async ({
  page,
}, testInfo) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await expect(page.getByRole("switch", { name: "Show my Tapit profile" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Redirect to website" })).toHaveCount(0);
  await page.goto("/app/links");
  await expect(page.getByRole("switch", { name: "Show my Tapit profile" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Redirect to website" })).toHaveCount(1);

  const destination = "https://destination.example.test/contact";
  await page.route("https://destination.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><main><h1>Website destination loaded</h1></main></body></html>",
    }),
  );

  const redirectMode = page.getByRole("switch", { name: "Redirect to website" });
  await redirectMode.click();
  await expect(redirectMode).toBeChecked();
  await expect(page.getByRole("switch", { name: "Show my Tapit profile" })).not.toBeChecked();
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
  await expect(page.getByRole("combobox", { name: "Featured link" })).toBeDisabled();
  await expect(
    page.getByText(
      "Profile links are paused while visitors go to your website. Show my Tapit profile to edit them.",
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
  const tapitProfileMode = page.getByRole("switch", { name: "Show my Tapit profile" });
  await tapitProfileMode.click();
  await expect(tapitProfileMode).toBeChecked();
  await expect(page.getByRole("switch", { name: "Redirect to website" })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Add link" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Label for LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Destination for LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "Enable LinkedIn" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reorder LinkedIn" })).toBeEnabled();
  await expect(
    linkedInRow.getByRole("button", { name: "Preset icon for LinkedIn: LinkedIn" }),
  ).toBeEnabled();
  await expect(page.getByRole("combobox", { name: "Featured link" })).toBeEnabled();
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
