import { describe, expect, it } from "vitest";

import { activeNavItemFor, navItemsFor, sidebarSectionsFor } from "@/components/layout/navigation";

describe("workspace navigation model", () => {
  it("builds customer tabs and More from the same registry", () => {
    expect(navItemsFor("customer", "tabs").map((item) => item.label)).toEqual([
      "Profile",
      "Links",
      "Analytics",
    ]);
    expect(navItemsFor("customer", "more").map((item) => item.label)).toEqual([
      "Customize",
      "Card",
      "Account",
      "Help",
    ]);
  });

  it("groups the customer sidebar by job and keeps pinned items out of the groups", () => {
    expect(
      sidebarSectionsFor("customer").map((section) => [
        section.label,
        section.items.map((item) => item.label),
      ]),
    ).toEqual([
      ["Your profile", ["Profile", "Links", "Customize"]],
      ["Share & grow", ["Card", "Analytics"]],
    ]);
  });

  it("gives admins their own audience and never leaks customer items", () => {
    expect(sidebarSectionsFor("admin").map((section) => section.label)).toEqual([
      "Operations",
      "Governance",
    ]);
    expect(navItemsFor("admin", "tabs").map((item) => item.label)).toEqual([
      "Customers",
      "Profiles",
      "Cards",
      "Codes",
    ]);
    expect(navItemsFor("admin", "sidebar").some((item) => item.href.startsWith("/app/"))).toBe(
      false,
    );
  });

  it("matches the most specific prefix and honours exact rules", () => {
    expect(activeNavItemFor("customer", "/app/card")?.label).toBe("Card");
    expect(activeNavItemFor("customer", "/app/account/settings")?.label).toBe("Account");
    expect(activeNavItemFor("customer", "/app/cardigan")).toBeUndefined();
    expect(activeNavItemFor("customer", "/app/accounts")).toBeUndefined();
  });

  it("routes the card to /app/card and the old build-card path is no longer a destination", () => {
    const hrefs = navItemsFor("customer", "sidebar").map((item) => item.href);
    expect(hrefs).toContain("/app/card");
    expect(hrefs.some((href) => href.includes("build-card"))).toBe(false);
  });
});
