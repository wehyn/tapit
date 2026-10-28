import { expect, type Page } from "@playwright/test";

type DemoMediaUploadControl = { delayMs?: number; fail?: boolean };

export async function setDemoMediaUploadControl(page: Page, control: DemoMediaUploadControl) {
  await page.evaluate(({ delayMs, fail }) => {
    if (delayMs === undefined) window.localStorage.removeItem("tapit:e2e-media-upload-delay-ms");
    else window.localStorage.setItem("tapit:e2e-media-upload-delay-ms", String(delayMs));
    if (fail) window.localStorage.setItem("tapit:e2e-media-upload-failure", "true");
    else window.localStorage.removeItem("tapit:e2e-media-upload-failure");
  }, control);
}

export async function resetDemoHarness(page: Page) {
  await page.goto("/login");
  await page.evaluate(() => {
    window.localStorage.removeItem("tapit:demo-state:v1");
    window.localStorage.removeItem("tapit:demo-session:v1");
    window.localStorage.removeItem("tapit:e2e-media-upload-delay-ms");
    window.localStorage.removeItem("tapit:e2e-media-upload-failure");
  });
  await page.reload();
}

export async function signInAsCustomer(
  page: Page,
  { showNavigationTour = false }: { showNavigationTour?: boolean } = {},
) {
  await page.goto("/login");
  const tourAlreadyCompleted = await page.evaluate(
    () => window.localStorage.getItem("tapit:customer-navigation-tour:profile-mara") === "done",
  );
  await page.getByLabel("Email").fill("mara@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  if (!showNavigationTour && !tourAlreadyCompleted) {
    const tour = page.getByTestId("navigation-tour-coach-mark");
    await expect(tour).toBeVisible();
    await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
    await expect(tour).toHaveCount(0);
  }
}

export async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
}
