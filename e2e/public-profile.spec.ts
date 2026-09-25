import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { expect, test } from "@playwright/test";

test("mobile identity alignment centers the public profile header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mara-velasquez");

  const heading = page.getByRole("heading", { name: "Mara Velasquez" });
  const bio = page.getByText("Brand systems for independent teams.");
  const avatar = page.getByRole("img", { name: "Mara Velasquez profile" });
  const panel = page.getByRole("main").locator("section");

  await expect(heading).toHaveCSS("text-align", "center");
  await expect(bio).toHaveCSS("text-align", "center");
  const avatarBox = await avatar.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(avatarBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(
    Math.abs(avatarBox!.x + avatarBox!.width / 2 - (panelBox!.x + panelBox!.width / 2)),
  ).toBeLessThanOrEqual(2);
  const devPortal = page.locator("nextjs-portal");
  if (await devPortal.count()) {
    await devPortal.evaluate((portal) => {
      (portal as HTMLElement).style.display = "none";
    });
  }
  await page.screenshot({
    path: "test-results/public-profile-mobile.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(heading).toHaveCSS("text-align", "left");
  await expect(bio).toHaveCSS("text-align", "left");
});

test("direct and active card paths show the same published profile", async ({ page }) => {
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);

  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
});

test("inactive cards never reveal their former profile and vCard includes approved profile fields", async ({
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
  const photoBase64 = await page.evaluate(async () => {
    const response = await fetch("/images/tapit-demo-mara-avatar.png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return window.btoa(binary);
  });
  const unfoldedVCard = vCard.replace(/\r\n[ \t]/g, "");
  expect(unfoldedVCard).not.toContain(`${new URL(page.url()).origin}/mara-velasquez`);
  expect(unfoldedVCard).not.toMatch(/^URL:/m);
  expect(unfoldedVCard).toContain("TEL;TYPE=VOICE:+63 917 555 0184");
  expect(unfoldedVCard).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${photoBase64}`);
  expect(unfoldedVCard).toContain("item1.URL:https://www.linkedin.com/in/mara-velasquez");
  expect(unfoldedVCard).toContain("item1.X-ABLabel:LinkedIn");
  expect(unfoldedVCard).toContain("item2.URL:https://mara-velasquez.example");
  expect(unfoldedVCard).toContain("item2.X-ABLabel:Portfolio");
  expect(unfoldedVCard).toContain("item3.X-ABLabel:Book a conversation");
  expect(unfoldedVCard).toContain("item4.URL:mailto:mara@example.test");
  expect(unfoldedVCard).toContain("item4.X-ABLabel:Email");
});

test("vCard export converts a published WebP photo to an embedded PNG", async ({ page }) => {
  const webpPhoto = await sharp(await readFile("public/images/tapit-demo-mara-avatar.png"))
    .webp({ quality: 80 })
    .toBuffer();
  await page.route("**/images/tapit-demo-mara-avatar.png", (route) =>
    route.fulfill({ body: webpPhoto, contentType: "image/webp" }),
  );

  await page.goto("/mara-velasquez");
  const downloadPromise = page.waitForEvent("download", { timeout: 3000 });
  await page.getByRole("button", { name: "Save contact" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const vCard = (await readFile(downloadPath as string, "utf8")).replace(/\r\n[ \t]/g, "");
  const photoBase64 = vCard.match(/PHOTO;ENCODING=b;TYPE=PNG:([A-Za-z0-9+/=]+)/)?.[1];
  expect(photoBase64).toBeTruthy();

  const dimensions = await page.evaluate(async (base64) => {
    const photoBlob = await fetch(`data:image/png;base64,${base64}`).then((response) =>
      response.blob(),
    );
    const photo = await createImageBitmap(photoBlob);
    return { width: photo.width, height: photo.height };
  }, photoBase64);
  expect(dimensions).toEqual({ width: 384, height: 384 });
});

test("a published phone-only profile can be saved as a contact", async ({ page }) => {
  const phone = "+63 917 555 0184";
  const owner = {
    id: "customer-phone-only",
    email: "phone-only@example.test",
    role: "customer" as const,
    profileId: "profile-phone-only",
    status: "active" as const,
    deletionStatus: "active" as const,
  };
  const links = [
    {
      id: "portfolio",
      label: "Portfolio",
      destination: "https://example.test/portfolio",
      enabled: true,
    },
  ];
  const profile = {
    id: "profile-phone-only",
    ownerId: owner.id,
    status: "published" as const,
    theme: "paper" as const,
    draft: {
      name: "Phone Only",
      slug: "phone-only",
      phone,
      website: "https://identity-website.example",
      links,
    },
    published: {
      name: "Phone Only",
      slug: "phone-only",
      phone,
      website: "https://identity-website.example",
      links,
      publishedAt: new Date().toISOString(),
    },
  };
  const demoState = {
    customers: [owner],
    profiles: [profile],
    profile,
    themes: { [profile.id]: profile.theme },
    theme: profile.theme,
    cards: [],
    analytics: [],
    audits: [],
    supportUrl: "https://example.test/support",
  };

  await page.addInitScript((state) => {
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  }, demoState);
  await page.goto("/phone-only");

  const saveContactButton = page.getByRole("button", { name: "Save contact" });
  await expect(saveContactButton).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await saveContactButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const vCard = await readFile(downloadPath as string, "utf8");
  const unfoldedVCard = vCard.replace(/\r\n[ \t]/g, "");
  expect(unfoldedVCard).toContain(`TEL;TYPE=VOICE:${phone}`);
  expect(unfoldedVCard).not.toContain("EMAIL;");
  expect(unfoldedVCard).not.toContain("https://identity-website.example");
  expect(unfoldedVCard).toContain("item1.URL:https://example.test/portfolio");
  expect(unfoldedVCard).toContain("item1.X-ABLabel:Portfolio");
});

test("demo card claim, publish, and resolver activation complete as one flow", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.goto("/app/links");
  await expect(
    page.getByText("Claim the attached card before publishing this profile."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Account menu for owner@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

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
