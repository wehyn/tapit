import { expect, test } from "@playwright/test";

test("landing page keeps the core sections without placeholder copy or pricing", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Share one profile. Update it anytime." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View demo profile", exact: true })).toHaveCount(0);

  await expect(page.getByText("A smarter way to connect", { exact: true })).toHaveCount(0);
  await expect(page.locator("#product").getByText("The profile", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Keep your contact details, work, and next step together in a profile that is easy to share and easy to keep current.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.locator("#how-it-works").getByText("How it works", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Build once, then update your links and contact details whenever your work changes. The public profile stays stable while your story keeps moving.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(page.locator("#teams").getByText("For teams", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Give people a polished, updateable profile for events, introductions, and the moments in between.",
      { exact: true },
    ),
  ).toHaveCount(0);

  await expect(page.locator("#pricing")).toHaveCount(0);
  await expect(page.locator('a[href="#pricing"]')).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Everyone gets one clear way to be found." }),
  ).toBeVisible();
  expect(
    await page.locator("main > footer").evaluate((footer) => footer.previousElementSibling?.id),
  ).toBe("teams");

  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
    "href",
    "/app/profile",
  );
});
