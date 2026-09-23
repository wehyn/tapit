import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

async function publishWarmStudioProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("radio", { name: "Editorial" }).check();
  await page.getByRole("combobox", { name: "Featured link" }).selectOption("booking");
  await page.getByRole("radio", { name: "About", exact: true }).check();
  await page.getByLabel("About copy").fill("A published studio introduction.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
}

async function readPublicProfileSnapshot(page: Page) {
  return page.getByRole("main").evaluate((main) => {
    const text = (element: Element | null) =>
      element?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const links = (selector: string) =>
      Array.from(main.querySelectorAll<HTMLAnchorElement>(selector)).map((link) => ({
        label: text(link),
        href: link.getAttribute("href"),
        featured: link.getAttribute("data-featured"),
      }));
    const details = main.querySelector("details");
    const section = details
      ? {
          label: text(details.querySelector("summary")),
          body: text(details.querySelector('[role="region"]')),
          expanded: details.querySelector("summary")?.getAttribute("aria-expanded") ?? null,
        }
      : null;
    const heading = main.querySelector("h1");
    const identity = heading?.parentElement;

    return {
      name: text(heading),
      bio: text(identity?.querySelector("p") ?? null),
      imageSrc: main.querySelector("img")?.getAttribute("src") ?? null,
      contacts: links('nav[aria-label="Contact actions"] a'),
      featured: links('ul[aria-label="Featured profile link"] a'),
      links: links('ul[aria-label="Profile links"] a'),
      section,
      pageClass: main.getAttribute("class"),
    };
  });
}

test("direct and active card paths show the same published profile", async ({ page }) => {
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "LinkedIn" })).toBeVisible();
  await expect(page.getByText("Private note")).toHaveCount(0);

  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Portfolio" })).toBeVisible();
});

test("customized direct and active card paths preserve presentation parity", async ({ page }) => {
  await publishWarmStudioProfile(page);

  const paths = [];
  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    paths.push(await readPublicProfileSnapshot(page));
  }

  expect(paths[0]).toEqual(paths[1]);
  expect(paths[0]).toMatchObject({
    name: "Mara Velasquez",
    bio: "Brand systems for independent teams.",
    imageSrc: "/images/tapit-demo-mara-avatar.png",
    contacts: [
      { label: "Email", href: "mailto:mara@example.test", featured: null },
      { label: "Phone", href: "tel:+63 917 555 0184", featured: null },
      { label: "Website", href: "https://mara-velasquez.example", featured: null },
    ],
    featured: [
      {
        label: "Book a conversation",
        href: "https://cal.com/mara-velasquez",
        featured: "true",
      },
    ],
    links: [
      {
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/mara-velasquez",
        featured: null,
      },
      { label: "Portfolio", href: "https://mara-velasquez.example", featured: null },
      { label: "Email", href: "mailto:mara@example.test", featured: null },
    ],
    section: {
      label: "About",
      body: "A published studio introduction.",
      expanded: "false",
    },
    pageClass: expect.stringContaining("bg-[#fbf6ef]"),
  });
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
  expect(vCard).toContain(`URL:${new URL(page.url()).origin}/mara-velasquez`);
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
  await page.getByRole("button", { name: "Sign out" }).click();

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
