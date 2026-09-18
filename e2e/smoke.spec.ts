import { expect, test } from "@playwright/test";

test("landing page places the Get Started CTA at the bottom", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Share one profile. Update it anytime." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View demo profile", exact: true })).toHaveCount(0);

  const ctaSection = page.locator("#pricing");
  const cta = ctaSection.getByRole("link", { name: "Get Started", exact: true });
  await expect(cta).toHaveAttribute("href", "/mara-velasquez");
  const bulkOrder = ctaSection
    .getByRole("heading", { name: "Need more than 10?" })
    .locator("xpath=../../..");
  const [ctaBox, bulkOrderBox] = await Promise.all([cta.boundingBox(), bulkOrder.boundingBox()]);
  if (!ctaBox || !bulkOrderBox) {
    throw new Error("Could not measure the pricing CTA spacing");
  }
  expect(ctaBox.y - (bulkOrderBox.y + bulkOrderBox.height)).toBeGreaterThanOrEqual(20);

  expect(
    await page.locator("main > footer").evaluate((footer) => footer.previousElementSibling?.id),
  ).toBe("pricing");

  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
    "href",
    "/app/profile",
  );
});
