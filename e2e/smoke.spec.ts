import { expect, test } from "@playwright/test";

test("landing page exposes the public and workspace entry points", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "A quieter way to share what matters." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View demo profile" })).toHaveAttribute(
    "href",
    "/mara-velasquez",
  );
  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
    "href",
    "/app/profile",
  );
});
