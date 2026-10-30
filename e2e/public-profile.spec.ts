import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { resetDemoHarness, signInAsAdmin, signInAsCustomer } from "./support/demo-harness";

async function publishWarmStudioProfile(page: Page) {
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/customize");
  const warmStudio = page.getByRole("radio", { name: "Warm Studio" });
  await warmStudio.locator("xpath=..").click();
  await expect(warmStudio).toBeChecked();
  await page.getByText("Fine tune", { exact: true }).click();
  const editorial = page.getByRole("radio", { name: "Editorial" });
  await editorial.locator("xpath=..").click();
  await expect(editorial).toBeChecked();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "About or Services" }).click();
  const about = page.getByRole("radio", { name: "About", exact: true });
  await about.locator("xpath=..").click();
  await expect(about).toBeChecked();
  await page.getByLabel("About copy").fill("A published studio introduction.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Visitors still see the last published version.")).toBeVisible();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();
}

async function prepareLegacyProfile(page: Page) {
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
}

async function prepareLegacyNightProfile(page: Page) {
  await prepareLegacyProfile(page);
  await page.goto("/app/customize");
  const night = page.getByRole("radio", { name: "Night" });
  await night.check();
  await expect(night).toBeChecked();
}

async function readPublicProfileSnapshot(page: Page) {
  return page.getByRole("main").evaluate((main) => {
    const text = (element: Element | null) =>
      element?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    const links = (selector: string) =>
      Array.from(main.querySelectorAll<HTMLAnchorElement>(selector)).map((link) => ({
        label: text(link),
        href: link.getAttribute("href"),
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

test("public profiles resolve lowercase and mixed-case direct URLs", async ({ page }) => {
  for (const slug of ["mara-velasquez", "Mara-Velasquez"]) {
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: "Mara Velasquez", exact: true })).toBeVisible();
  }
});

test("owner shortcut is hidden when signed out and links Mara to profile editor", async ({
  page,
}) => {
  await resetDemoHarness(page);
  await page.goto("/mara-velasquez");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);

  await signInAsCustomer(page);
  const preview = page.getByTestId("profile-preview-device");
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(preview.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 390 });
  await page.goto("/mara-velasquez");
  const editProfile = page.getByRole("link", { name: "Edit profile", exact: true });
  await expect(editProfile).toBeVisible();
  await expect(editProfile).toHaveAttribute("href", "/app/profile");
  const ownerActions = page.getByRole("navigation", { name: "Profile actions" });
  await expect(ownerActions).toHaveCSS("position", "absolute");
  const [ownerBox, heroBox] = await Promise.all([
    ownerActions.boundingBox(),
    page.getByRole("region", { name: "Profile hero" }).boundingBox(),
  ]);
  expect(ownerBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  expect(ownerBox!.x).toBeGreaterThanOrEqual(heroBox!.x);
  expect(ownerBox!.y).toBeGreaterThanOrEqual(heroBox!.y);
  expect(ownerBox!.x + ownerBox!.width).toBeLessThanOrEqual(heroBox!.x + heroBox!.width);
  expect(ownerBox!.y + ownerBox!.height).toBeLessThanOrEqual(heroBox!.y + heroBox!.height);

  await page.goto("/c/mara-card-7f2q");
  const cardEditProfile = page.getByRole("link", { name: "Edit profile", exact: true });
  await expect(cardEditProfile).toBeVisible();
  await expect(cardEditProfile).toHaveAttribute("href", "/app/profile");
});

test("shortcut stays hidden for a signed-in admin viewing Mara's profile", async ({ page }) => {
  await resetDemoHarness(page);
  await signInAsAdmin(page);
  await page.goto("/mara-velasquez");

  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
  await page.goto("/c/mara-card-7f2q");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit profile", exact: true })).toHaveCount(0);
});

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

test("desktop public profile routes match the preview with the prototype avatar size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await resetDemoHarness(page);
  await signInAsCustomer(page);
  await page.goto("/app/links");

  const previewProfile = page.getByTestId("profile-preview-device").locator(".tapit-profile-entry");
  await expect(previewProfile.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  const {
    avatar: previewAvatar,
    heroContent: previewHeroContent,
    panel: previewPanel,
    ...previewPresentation
  } = await readProfilePresentation(previewProfile);
  expect(previewAvatar).toMatchObject({ width: "80px", height: "80px" });
  expect(previewHeroContent).toBeNull();
  expect(previewPanel).toMatchObject({
    backgroundColor: "rgb(255, 255, 255)",
    borderRadius: "20px",
  });

  for (const path of ["/mara-velasquez", "/c/mara-card-7f2q"]) {
    await page.goto(path);
    const profile = page.locator("main.tapit-profile-entry");
    await expect(profile.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
    const {
      avatar: publicAvatar,
      heroContent: publicHeroContent,
      panel: publicPanel,
      ...publicPresentation
    } = await readProfilePresentation(profile);
    expect(publicAvatar).toMatchObject({ width: "104px", height: "104px" });
    expect(publicHeroContent).toMatchObject({ paddingTop: "0px", paddingBottom: "16px" });
    expect(publicPanel).toMatchObject({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderRadius: "0px",
    });
    expect(publicPresentation).toEqual(previewPresentation);
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
        { label: "Email", href: "mailto:mara@example.test" },
        { label: "Phone", href: "tel:+63 917 555 0184" },
        { label: "Website", href: "https://mara-velasquez.example" },
      ],
      links: [
        {
          label: "LinkedIn",
          href: "https://www.linkedin.com/in/mara-velasquez",
        },
        { label: "Portfolio", href: "https://mara-velasquez.example" },
        { label: "Book a conversation", href: "https://cal.com/mara-velasquez" },
        { label: "Email", href: "mailto:mara@example.test" },
      ],
      section: {
        label: "About",
        body: "A published studio introduction.",
        expanded: "false",
      },
      pageBackground: "rgb(251, 246, 239)",
    });
  }
});

test("legacy Paper theme uses Soft Precision by default on preview and slug routes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareLegacyProfile(page);
  await page.goto("/app/customize");

  const previewFrame = page.getByTestId("profile-preview-frame");
  const previewCanvas = previewFrame.locator("xpath=..");
  const previewPanel = page
    .getByTestId("profile-preview-device")
    .locator(".tapit-profile-entry > div > section");
  await expect(page.getByRole("radio", { name: "Soft Precision (Paper)" })).toBeChecked();
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(244, 246, 250)");
  await expect(previewPanel).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({
    path: "test-results/soft-precision-site/profile-preview-default-paper.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/mara-velasquez");
  const slugProfile = page.locator("main.tapit-profile-entry");
  await expect(slugProfile).toHaveCSS("background-color", "rgb(244, 246, 250)");
  await expect(slugProfile.locator(":scope > div > section")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.screenshot({
    path: "test-results/soft-precision-site/slug-profile-default-paper.png",
    fullPage: true,
  });
});

test("legacy customer typography and selected theme remain intact after publishing", async ({
  page,
}) => {
  await prepareLegacyNightProfile(page);
  const previewFrame = page.getByTestId("profile-preview-frame");
  const previewCanvas = previewFrame.locator("xpath=..");
  const previewProfilePanel = page
    .getByTestId("profile-preview-device")
    .locator(".tapit-profile-entry > div > section");
  const preview = previewFrame.getByRole("heading", { name: "Mara Velasquez" });
  await expect(previewCanvas).toHaveCSS("background-color", "rgb(23, 33, 31)");
  await expect(previewProfilePanel).toHaveCSS("background-color", "rgb(34, 48, 43)");
  await expect(preview).toHaveCSS("font-family", /ui-sans-serif/);
  const previewFontFamily = await preview.evaluate(
    (heading) => getComputedStyle(heading).fontFamily,
  );
  const previewFontSize = await preview.evaluate((heading) => getComputedStyle(heading).fontSize);
  await expect(preview).toHaveCSS("color", "rgb(242, 246, 241)");

  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/mara-velasquez");
  const directHeading = page.getByRole("heading", { name: "Mara Velasquez" });
  await expect(directHeading).toHaveCSS("font-family", /ui-sans-serif/);
  await expect(directHeading).toHaveCSS("font-size", previewFontSize);
  await expect(page.getByText("Legacy profile migration test.")).toBeVisible();
  await expect(page.getByText("Brand systems for independent teams.")).toHaveCount(0);
  await expect(page.locator("main img").first()).toHaveCSS(
    "box-shadow",
    /rgba\(255, 255, 255, 0\.1\) 0px 0px 0px 1px/,
  );
  const directProfile = await readPublicProfileSnapshot(page);

  await page.goto("/c/mara-card-7f2q");
  const cardHeading = page.getByRole("heading", { name: "Mara Velasquez" });
  await expect(cardHeading).toHaveCSS("font-family", /ui-sans-serif/);
  await expect(cardHeading).toHaveCSS("font-size", previewFontSize);
  await expect(page.getByText("Legacy profile migration test.")).toBeVisible();
  await expect(page.getByText("Brand systems for independent teams.")).toHaveCount(0);
  const cardProfile = await readPublicProfileSnapshot(page);

  expect(directProfile).toEqual(cardProfile);
  expect(directProfile.headingFontFamily).toBe(previewFontFamily);
  expect(directProfile.pageBackground).toBe("rgb(23, 33, 31)");
  expect(directProfile.panelBackground).toBe("rgba(0, 0, 0, 0)");
  expect(directProfile.panelRadius).toBe("0px");
});

test("tagged profile activity appears by source and aggregates into the current monthly period", async ({
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
  const nfcRow = trafficSources.getByText("NFC", { exact: true }).locator("..");
  const qrRow = trafficSources.getByText("QR code", { exact: true }).locator("..");
  await expect(nfcRow.getByText("1", { exact: true })).toBeVisible();
  await expect(qrRow.getByText("1", { exact: true })).toBeVisible();

  const trend = page.getByLabel("Aggregate engagement trend");
  const currentPeriod = await page.evaluate(() => {
    const raw = window.localStorage.getItem("tapit:demo-state:v1");
    if (!raw) throw new Error("Expected the tagged activity to be persisted.");
    const state = JSON.parse(raw) as {
      analytics?: Array<{
        profileId?: string;
        bucketStart: number;
        views: number;
        clicks: number;
      }>;
    };
    const rows = state.analytics?.filter((bucket) => bucket.profileId === "profile-mara") ?? [];
    const utcDayStart = (timestamp: number) => {
      const date = new Date(timestamp);
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    };
    const today = utcDayStart(Date.now());
    const monthStart = Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth(), 1);
    const firstDay = Math.min(...rows.map((bucket) => utcDayStart(bucket.bucketStart)));
    const start = Math.max(monthStart, firstDay);
    const counts = rows
      .filter((bucket) => {
        const day = utcDayStart(bucket.bucketStart);
        return day >= start && day <= today;
      })
      .reduce(
        (total, bucket) => ({
          views: total.views + bucket.views,
          clicks: total.clicks + bucket.clicks,
        }),
        { views: 0, clicks: 0 },
      );
    const format = (timestamp: number) =>
      new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    const label = start === today ? format(start) : `${format(start)}–${format(today)}`;
    return `${label}: ${counts.views + counts.clicks} total, ${counts.views} views, ${counts.clicks} clicks`;
  });
  await expect(trend.getByRole("group", { name: currentPeriod, exact: true })).toHaveCount(1);
});

test("inactive cards never reveal their former profile and vCard includes approved profile fields", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/c/mara-card-retired");
    await expect(
      page.getByRole("heading", { name: "This profile is currently unavailable" }),
    ).toBeVisible();
    await expect(page.getByText("Mara Velasquez")).toHaveCount(0);
    await expect(page.getByText("Brand systems for independent teams.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }

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
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "This profile is currently unavailable" }),
    ).toBeVisible();
    await expect(page.getByText("Mara Velasquez")).toHaveCount(0);
    await expect(page.getByText("Brand systems for independent teams.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Contact support" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
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

test("a vCard still downloads when its optional profile photo is unavailable", async ({ page }) => {
  await page.route("**/images/tapit-demo-mara-avatar.png", (route) => route.abort());
  await page.goto("/mara-velasquez");

  const downloadPromise = page.waitForEvent("download", { timeout: 5000 });
  await page.getByRole("button", { name: "Save contact" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const vCard = await readFile(downloadPath as string, "utf8");

  expect(vCard).toContain("FN:Mara Velasquez");
  expect(vCard).toContain("TEL;TYPE=VOICE:+63 917 555 0184");
  expect(vCard).not.toContain("PHOTO;");
});

test("a published website-only profile can be saved as a contact", async ({ page }) => {
  const owner = {
    id: "customer-website-only",
    email: "website-only@example.test",
    role: "customer" as const,
    profileId: "profile-website-only",
    status: "active" as const,
    deletionStatus: "active" as const,
  };
  const website = "https://identity-website.example";
  const profile = {
    id: "profile-website-only",
    ownerId: owner.id,
    status: "published" as const,
    theme: "paper" as const,
    draft: {
      name: "Website Only",
      slug: "website-only",
      website,
      links: [],
    },
    published: {
      name: "Website Only",
      slug: "website-only",
      website,
      links: [],
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
  await page.goto("/website-only");

  const saveContactButton = page.getByRole("button", { name: "Save contact" });
  await expect(saveContactButton).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await saveContactButton.click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const vCard = await readFile(downloadPath as string, "utf8");
  const unfoldedVCard = vCard.replace(/\r\n[ \t]/g, "");
  expect(unfoldedVCard).toContain("FN:Website Only");
  expect(unfoldedVCard).toContain(`item1.URL:${website}`);
  expect(unfoldedVCard).not.toContain("EMAIL;");
  expect(unfoldedVCard).not.toContain("TEL;");
});

test("demo card claim, publish, and resolver activation complete as one flow", async ({ page }) => {
  await page.goto("/c/claimable-card-demo");
  await expect(page.getByRole("heading", { name: "Sign in to set up your card" })).toBeVisible();
  await expect(page.getByText("Claimed profile")).toHaveCount(0);
  await page.getByRole("link", { name: "I already have an account" }).click();

  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/c\/claimable-card-demo$/);
  await expect(page.getByText("Claimed profile")).toBeVisible();
  await expect(page.getByText("Profile preview · Private draft", { exact: true })).toBeVisible();
  await page.getByLabel("Card code").fill("MARA2Q8K");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByText(/Code verified/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm and attach card" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and attach card" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.getByRole("button", { name: /^Publish(?: changes)?$/ }).click();
  await expect(
    page.getByText("Profile published. Your active card paths now show this version."),
  ).toBeVisible();

  await page.goto("/c/claimable-card-demo");
  await expect(page.getByRole("heading", { name: "Claimed profile" })).toBeVisible();
});

test("demo unassigned card keeps its code and query through skip and rescan", async ({ page }) => {
  const cardPath = "/c/unassigned-card-demo?source=qr&claim=1&a=%20&b=1&a=2";
  await page.goto(cardPath);
  await expect(page.getByRole("heading", { name: "Sign in to set up your card" })).toBeVisible();
  await expect(page.getByText("Buyer Setup")).toHaveCount(0);
  await page.getByRole("link", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill("buyer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(cardPath);
  await expect(page.getByText("Buyer Setup")).toBeVisible();
  await expect(page.getByText("Profile preview · Private draft", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.goto(cardPath);
  await expect(page.getByText("Buyer Setup")).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveValue("DEMA29BC");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByText(/Code verified/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm and attach card" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.goto(cardPath);
  await expect(page.getByRole("heading", { name: "Finish setting up your card" })).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveCount(0);
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Account menu for buyer@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto(cardPath);
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("Buyer Setup")).toHaveCount(0);
});

test("active but unclaimed cards require a code and keep the draft private", async ({ page }) => {
  const cardPath = "/c/active-unclaimed-card-demo?source=qr";
  await page.goto(cardPath);
  await expect(page.getByRole("heading", { name: "Sign in to set up your card" })).toBeVisible();
  await expect(page.getByText("Active Setup")).toHaveCount(0);
  await page.getByRole("link", { name: "I already have an account" }).click();
  await page.getByLabel("Email").fill("active-setup@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(cardPath);
  await expect(page.getByText("Active Setup")).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveValue("ACTV29BC");
  await page.getByLabel("Card code").fill("ACTV29BC");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByRole("button", { name: "Confirm and attach card" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.goto(cardPath);
  await expect(page.getByRole("heading", { name: "Finish setting up your card" })).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveCount(0);
});

test("claim query does not force the claim screen for an active card", async ({ page }) => {
  await page.goto("/c/mara-card-7f2q?claim=1&source=qr");
  await expect(page.getByRole("heading", { name: "Mara Velasquez" })).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveCount(0);
});

test("a code-proven correction pauses the URL until an administrator corrects its assignment", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("buyer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.getByRole("button", { name: "Maybe later", exact: true }).click();
  await page.goto("/c/claimable-card-demo?source=qr&claim=1");
  await expect(page.getByText("Buyer Setup")).toBeVisible();
  await page.getByLabel("Card code").fill("MARA2Q8K");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByRole("button", { name: "Request assignment correction" }).click();
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Account menu for buyer@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@tapit.local");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto("/admin/cards");
  const request = page.locator("section").filter({ hasText: "Assignment corrections" });
  await expect(request.getByText(/claimable-card-demo.*Buyer Setup/)).toBeVisible();
  const pendingCard = page.locator("article").filter({ hasText: "/c/claimable-card-demo" });
  await pendingCard.locator("summary").first().click();
  await expect(pendingCard.getByRole("button", { name: "Generate code" })).toBeDisabled();
  await expect(pendingCard.getByText(/Resolve the pending assignment correction/)).toBeVisible();
  await request.getByRole("button", { name: "Correct assignment" }).click();
  await expect(page.getByText("Assignment for claimable-card-demo corrected.")).toBeVisible();

  await page.goto("/admin/cards");
  await page.getByRole("button", { name: "Account menu for admin@tapit.local" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Email").fill("buyer@example.test");
  await page.getByLabel("Password", { exact: true }).fill("tapit-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto("/c/claimable-card-demo?source=qr&claim=1");
  await expect(page.getByText("Buyer Setup")).toBeVisible();
  await page.getByLabel("Card code").fill("MARA2Q8K");
  await page.getByRole("button", { name: "Verify code" }).click();
  await page.getByRole("button", { name: "Confirm and attach card" }).click();
  await expect(page).toHaveURL(/\/app\/profile$/);
  await page.goto("/c/claimable-card-demo?source=qr&claim=1");
  await expect(page.getByRole("heading", { name: "Finish setting up your card" })).toBeVisible();
  await expect(page.getByLabel("Card code")).toHaveCount(0);
  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Account menu for buyer@example.test" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/c/claimable-card-demo?source=qr&claim=1");
  await expect(
    page.getByRole("heading", { name: "This profile is currently unavailable" }),
  ).toBeVisible();
});
