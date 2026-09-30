import { expect, test } from "@playwright/test";

test("landing page keeps the core sections without placeholder copy or pricing", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Share one profile. Update it anytime." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View demo profile", exact: true })).toHaveCount(0);

  await expect(
    page.getByRole("heading", { name: "One place for the things people need next." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Links that stay useful." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A better first hello." })).toBeVisible();
  for (const step of ["Create your profile", "Add what comes next", "Share it anywhere"]) {
    await expect(page.getByRole("heading", { name: step })).toBeVisible();
  }
  await expect(page.locator("main > footer")).toContainText(
    "Built for quick, human introductions.",
  );

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
  const teamsContainer = page.locator("#teams > div");
  const teamsHeading = page.locator("#teams > div > h2");
  const [teamsContainerBox, teamsHeadingBox] = await Promise.all([
    teamsContainer.boundingBox(),
    teamsHeading.boundingBox(),
  ]);
  if (!teamsContainerBox || !teamsHeadingBox) {
    throw new Error("Could not measure the teams section alignment");
  }
  expect(
    Math.abs(
      teamsHeadingBox.x +
        teamsHeadingBox.width / 2 -
        (teamsContainerBox.x + teamsContainerBox.width / 2),
    ),
  ).toBeLessThanOrEqual(2);
  expect(
    await page.locator("main > footer").evaluate((footer) => footer.previousElementSibling?.id),
  ).toBe("teams");

  await expect(page.getByRole("link", { name: "Open workspace" })).toHaveAttribute(
    "href",
    "/app/profile",
  );
});

test("visitors can reach the privacy notice and terms from the public homepage", async ({
  page,
}) => {
  await page.goto("/");

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);

    if (width === 390) {
      const heroLines = page.getByRole("heading", {
        name: "Share one profile. Update it anytime.",
      });
      await expect
        .poll(() =>
          heroLines.locator("span").evaluateAll((spans) =>
            spans.map((span) => {
              const range = document.createRange();
              range.selectNodeContents(span);
              return range.getClientRects().length;
            }),
          ),
        )
        .toEqual([1, 1]);
    }
  }

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Tapit privacy notice" })).toBeVisible();

  await page.getByRole("link", { name: "Back to Tapit" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Tapit privacy notice" })).toBeVisible();
  await expect(page.getByText("Wayne Garcia operates Tapit from the Philippines.")).toBeVisible();

  await page.getByRole("link", { name: "Back to Tapit" }).click();
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: "Tapit terms of use" })).toBeVisible();
});
