import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsCustomer } from "./support/demo-harness";

async function publishWarmStudioProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("radio", { name: "Warm Studio" }).check();
  await page.getByRole("radio", { name: "Editorial" }).check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.goto("/app/profile");
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

async function prepareLegacyNightProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.getByLabel("Bio or role").fill("Legacy profile migration test.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Account menu for mara@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected the demo state to be persisted before legacy setup.");
    const state = JSON.parse(raw);
    const customer = state.customers.find(
      (candidate: { email?: string }) => candidate.email === "mara@example.test",
    );
    const stripCustomization = (profile: {
      id?: string;
      draft?: object;
      published?: object | null;
    }) => {
      if (profile.id !== customer?.profileId) return profile;
      const draft = { ...profile.draft } as { customization?: unknown };
      delete draft.customization;
      const next = { ...profile, draft } as typeof profile & { published?: object | null };
      if (profile.published) {
        const published = { ...profile.published } as { customization?: unknown };
        delete published.customization;
        next.published = published;
      }
      return next;
    };
    state.profiles = state.profiles.map(stripCustomization);
    state.profile = stripCustomization(state.profile);
    window.localStorage.setItem("tapit:demo-state:v1", JSON.stringify(state));
  });
  await page.reload();
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  await page.getByRole("button", { name: "Night", exact: true }).click();
  await expect(page.getByRole("button", { name: "Night", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
      pageBackground: getComputedStyle(main).backgroundColor,
      headingFontFamily: heading ? getComputedStyle(heading).fontFamily : null,
      panelBackground: details
        ? null
        : getComputedStyle(main.querySelector("section")!).backgroundColor,
      panelRadius: details ? null : getComputedStyle(main.querySelector("section")!).borderRadius,
    };
  });
}

async function readProfilePresentation(profile: Locator) {
  return profile.evaluate((root) => {
    const heading = root.querySelector<HTMLElement>("h1, h2");
    const image = root.querySelector<HTMLImageElement>('img[alt="Mara Velasquez profile"]');
    const identity = heading?.parentElement?.parentElement;
    const bio = identity?.querySelector<HTMLElement>("p");
    const panel = root.querySelector<HTMLElement>("section");
    const link = root.querySelector<HTMLElement>('ul[aria-label="Profile links"] a');
    const hero = root.querySelector<HTMLElement>('[aria-label="Profile hero"]');
    const heroContent = hero?.querySelector<HTMLElement>(":scope > div.relative.z-10");
    const textStyle = (element: HTMLElement | null | undefined) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        color: computed.color,
        textAlign: computed.textAlign,
      };
    };
    const boxStyle = (element: HTMLElement | null | undefined) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        borderRadius: computed.borderRadius,
        borderWidth: computed.borderWidth,
        borderColor: computed.borderColor,
        backgroundColor: computed.backgroundColor,
      };
    };
    const avatarStyle = image
      ? {
          width: getComputedStyle(image).width,
          height: getComputedStyle(image).height,
          borderRadius: getComputedStyle(image).borderRadius,
          sizes: image.getAttribute("sizes"),
        }
      : null;
    const identityStyle = identity
      ? {
          alignItems: getComputedStyle(identity).alignItems,
          flexDirection: getComputedStyle(identity).flexDirection,
          textAlign: getComputedStyle(identity).textAlign,
        }
      : null;
    const linkStyle = link
      ? {
          fontSize: getComputedStyle(link).fontSize,
          minHeight: getComputedStyle(link).minHeight,
          paddingTop: getComputedStyle(link).paddingTop,
          paddingBottom: getComputedStyle(link).paddingBottom,
          borderRadius: getComputedStyle(link).borderRadius,
          backgroundColor: getComputedStyle(link).backgroundColor,
        }
      : null;
    const heroContentStyle = heroContent
      ? {
          paddingTop: getComputedStyle(heroContent).paddingTop,
          paddingBottom: getComputedStyle(heroContent).paddingBottom,
        }
      : null;

    return {
      heading: textStyle(heading),
      bio: textStyle(bio),
      avatar: avatarStyle,
      identity: identityStyle,
      panel: boxStyle(panel),
      link: linkStyle,
      heroContent: heroContentStyle,
    };
  });
}

test("public profile identity stays centered across screen widths", async ({ page }) => {
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
  await expect(heading).toHaveCSS("text-align", "center");
  await expect(bio).toHaveCSS("text-align", "center");
});

test("desktop public profiles keep a phone-width layout and settle under reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/mara-velasquez");

  const main = page.getByRole("main");
  const heading = page.getByRole("heading", { name: "Mara Velasquez" });
  const linkedIn = page.getByRole("link", { name: "LinkedIn" });
  const profilePanel = main.locator("section").first();

  await expect(heading).toBeVisible();
  await expect(linkedIn).toBeVisible();
  await expect
    .poll(() => profilePanel.evaluate((panel) => panel.getBoundingClientRect().width))
    .toBeLessThanOrEqual(448);
  await expect(heading).toHaveCSS("text-align", "center");

  const headingBox = await heading.boundingBox();
  const linkBox = await linkedIn.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(linkBox).not.toBeNull();
  expect(linkBox!.y).toBeGreaterThan(headingBox!.y + headingBox!.height);
  await expect
    .poll(() => main.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("tapit-profile-entry");
  await page.screenshot({ path: "test-results/tapit-public-profile-desktop.png", fullPage: true });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => main.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
  await expect(heading).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(heading).toHaveCSS("text-align", "center");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/tapit-public-profile-mobile.png", fullPage: true });
});

test("public profile keeps its primary actions usable at narrow phone widths", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/mara-velasquez");

    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toHaveCSS(
      "font-family",
      /ui-sans-serif/,
    );
    const linkedIn = page.getByRole("link", { name: "LinkedIn" });
    await expect(linkedIn).toBeVisible();
    await expect(linkedIn.locator("svg").last()).toHaveClass(/text-white\/80/);
    await expect(page.getByRole("button", { name: "Save contact" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});

test("profile action cards share the Save contact corner radius", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mara-velasquez");

  const linkedIn = page.getByRole("link", { name: "LinkedIn" });
  const saveContact = page.getByRole("button", { name: "Save contact" });
  await expect(linkedIn).toBeVisible();
  await expect(saveContact).toBeVisible();

  const [linkRadius, saveContactRadius] = await Promise.all([
    linkedIn.evaluate((element) => getComputedStyle(element).borderRadius),
    saveContact.evaluate((element) => getComputedStyle(element).borderRadius),
  ]);
  expect(linkRadius).toBe(saveContactRadius);
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

test("direct and active card profiles stay phone-width on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    await expect(page.locator("main.tapit-profile-entry > div")).toHaveCSS("max-width", "448px");
  }
});

test("desktop public profile routes match the mobile preview presentation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const previewProfile = page.getByTestId("profile-preview-device").locator(".tapit-profile-entry");
  await expect(previewProfile.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  const previewPresentation = await readProfilePresentation(previewProfile);

  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    const profile = page.locator("main.tapit-profile-entry");
    await expect(profile.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    expect(await readProfilePresentation(profile)).toEqual(previewPresentation);
  }
});

test("customized direct and active card paths preserve presentation parity", async ({ page }) => {
  await publishWarmStudioProfile(page);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const paths = [];
    for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toHaveCSS(
        "font-family",
        /ui-sans-serif/,
      );
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      paths.push(await readPublicProfileSnapshot(page));
    }

    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0]).toMatchObject({
      name: "Mara Velasquez",
      headingFontFamily: expect.stringMatching(/ui-sans-serif/),
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
      pageBackground: "rgb(251, 246, 239)",
    });
  }
});

test("legacy customer typography and selected theme remain intact in preview and card paths", async ({
  page,
}) => {
  await prepareLegacyNightProfile(page);
  const preview = page
    .getByTestId("profile-preview-frame")
    .getByRole("heading", { name: "Mara Velasquez" });
  await expect(preview).toHaveCSS("font-family", /ui-sans-serif/);
  const previewFontFamily = await preview.evaluate(
    (heading) => getComputedStyle(heading).fontFamily,
  );
  const previewFontSize = await preview.evaluate((heading) => getComputedStyle(heading).fontSize);
  await expect(preview).toHaveCSS("color", "rgb(242, 246, 241)");

  await page.goto("/mara-velasquez");
  const directHeading = page.getByRole("heading", { name: "Mara Velasquez" });
  await expect(directHeading).toHaveCSS("font-family", /ui-sans-serif/);
  await expect(directHeading).toHaveCSS("font-size", previewFontSize);
  await expect(page.getByText("Brand systems for independent teams.")).toBeVisible();
  await expect(page.getByText("Legacy profile migration test.")).toHaveCount(0);
  const directProfile = await readPublicProfileSnapshot(page);

  await page.goto("/c/mara-card-7f2q");
  const cardHeading = page.getByRole("heading", { name: "Mara Velasquez" });
  await expect(cardHeading).toHaveCSS("font-family", /ui-sans-serif/);
  await expect(cardHeading).toHaveCSS("font-size", previewFontSize);
  await expect(page.getByText("Brand systems for independent teams.")).toBeVisible();
  await expect(page.getByText("Legacy profile migration test.")).toHaveCount(0);
  const cardProfile = await readPublicProfileSnapshot(page);

  expect(directProfile).toEqual(cardProfile);
  expect(directProfile.headingFontFamily).toBe(previewFontFamily);
  expect(directProfile.pageBackground).toBe("rgb(23, 33, 31)");
  expect(directProfile.panelBackground).toBe("rgb(34, 48, 43)");
  expect(directProfile.panelRadius).toBe("18px");
  expect(directProfile.pageClass).toContain("bg-[#17211f]");
});

test("tagged profile activity appears by source and aggregates to one daily trend point", async ({
  page,
}) => {
  for (const source of ["nfc", "qr"] as const) {
    await page.goto(`/mara-velasquez?source=${source}`);
    await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate((expectedSource) => {
          const stored = window.localStorage.getItem("tapit:demo-state:v1");
          if (stored === null) return false;
          const state = JSON.parse(stored) as {
            analytics?: Array<{
              profileId?: string;
              source?: string;
              views: number;
            }>;
          };
          return state.analytics?.some(
            (bucket) =>
              bucket.profileId === "profile-mara" &&
              bucket.source === expectedSource &&
              bucket.views > 0,
          );
        }, source),
      )
      .toBe(true);
  }

  await signInAsCustomer(page);
  await page.goto("/app/analytics");

  const trafficSources = page.getByLabel("Traffic source breakdown");
  await expect(
    trafficSources.getByText("NFC", { exact: true }).locator("xpath=following-sibling::dd"),
  ).toHaveText("1");
  await expect(
    trafficSources.getByText("QR code", { exact: true }).locator("xpath=following-sibling::dd"),
  ).toHaveText("1");

  const trend = page.getByLabel("Aggregate engagement trend");
  const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
  await expect(trend.getByText(today, { exact: true })).toHaveCount(1);
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

test("unavailable profiles do not reveal their previously published identity", async ({ page }) => {
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await page.evaluate(() => {
    const stateKey = "tapit:demo-state:v1";
    const state = JSON.parse(window.localStorage.getItem(stateKey) ?? "{}");
    const profile = state.profiles?.find(
      (candidate: { id: string }) => candidate.id === "profile-mara",
    );
    const owner = state.customers?.find(
      (candidate: { id: string }) => candidate.id === profile?.ownerId,
    );
    if (!owner) throw new Error("Expected the demo profile owner to exist.");
    owner.deletionStatus = "requested";
    window.localStorage.setItem(stateKey, JSON.stringify(state));
  });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("Mara Velasquez")).toHaveCount(0);
  await expect(page.getByText("Brand systems for independent teams.")).toHaveCount(0);
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
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/c/claimable-card-demo");
  await expect(page.getByRole("heading", { name: "Claimed profile" })).toBeVisible();
});
