import { expect, test } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

test("published profile destination controls where the slug link goes", async ({
  page,
}, testInfo) => {
  await resetDemoHarness(page);
  await signInAsCustomer(page);

  await expect(page.getByRole("radio", { name: "Show my Tapit profile" })).toBeChecked();
  await page.goto("/app/links");
  await expect(page.getByRole("radio", { name: "Redirect to website" })).toHaveCount(0);

  const destination = "https://destination.example.test/contact";
  await page.route("https://destination.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body><main><h1>Website destination loaded</h1></main></body></html>",
    }),
  );

  await page.goto("/app/profile");
  await page.getByRole("radio", { name: "Redirect to website" }).check();
  await page.getByRole("textbox", { name: "HTTPS destination URL" }).fill(destination);
  const settingsArtifact = testInfo.outputPath("profile-destination-settings.png");
  await page
    .getByRole("heading", { name: "Profile link destination" })
    .locator("xpath=..")
    .screenshot({ path: settingsArtifact });
  await testInfo.attach("profile-destination-settings", {
    path: settingsArtifact,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();

  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Email" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Contact actions" }).getByRole("link", { name: "Phone" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
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

  await page.goto("/app/profile");
  await page.getByRole("radio", { name: "Show my Tapit profile" }).check();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
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
