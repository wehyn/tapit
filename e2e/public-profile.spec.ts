import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("direct and active card paths show the same published profile", async ({ page }) => {
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);

  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
});

test("inactive cards never reveal their former profile and vCard contains the approved fields", async ({
  page,
}) => {
  await page.goto("/c/mara-card-retired");
  await expect(page.getByRole("heading", { name: "This card is inactive" })).toBeVisible();
  await expect(page.getByText("Mara Velasquez")).toHaveCount(0);

  await page.goto("/mara-velasquez");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save contact" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("mara-velasquez.vcf");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const vCard = await readFile(downloadPath as string, "utf8");
  expect(vCard).toContain("URL:http://127.0.0.1:3000/mara-velasquez");
});

test("demo card claim, publish, and resolver activation complete as one flow", async ({ page }) => {
  await page.goto("/c/claimable-card-demo");
  await expect(
    page.getByRole("heading", { name: "Are you the owner of this card?" }),
  ).toBeVisible();
  await page.getByLabel("Claim code").fill("MARA2Q8K");
  await page.getByRole("button", { name: "Claim this card" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fc%2Fclaimable-card-demo$/);

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/c/claimable-card-demo");
  await expect(page.getByRole("heading", { name: "Claimed profile" })).toBeVisible();
});
