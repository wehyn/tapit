import type { IconName } from "../ui/Icon";

export type NavAudience = "customer" | "admin";
export type NavSurface = "sidebar" | "tabs" | "more";
export type NavSection = "your-profile" | "share-and-grow" | "operations" | "governance" | "pinned";

export type NavItem = {
  href: string;
  label: string;
  tabLabel?: string;
  icon: IconName;
  audience: NavAudience;
  section: NavSection;
  match: "exact" | "prefix";
  surfaces: readonly NavSurface[];
  cardOwnerOnly?: boolean;
};

export const supportHref = "mailto:wayneegarcia@gmail.com";

export const navAudiences: Record<
  NavAudience,
  { breadcrumbRoot: string; home: string; label: string; navLabel: string }
> = {
  customer: {
    breadcrumbRoot: "Workspace",
    home: "/app/profile",
    label: "Customer",
    navLabel: "Customer navigation",
  },
  admin: {
    breadcrumbRoot: "Admin",
    home: "/admin/customers",
    label: "Admin",
    navLabel: "Admin navigation",
  },
};

export const navSectionLabels: Record<NavSection, string> = {
  "your-profile": "Your profile",
  "share-and-grow": "Share & grow",
  operations: "Operations",
  governance: "Governance",
  pinned: "Account & help",
};

export const navItems: readonly NavItem[] = [
  {
    href: "/app/profile",
    label: "Profile",
    icon: "user",
    audience: "customer",
    section: "your-profile",
    match: "prefix",
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/app/links",
    label: "Links",
    icon: "link",
    audience: "customer",
    section: "your-profile",
    match: "prefix",
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/app/customize",
    label: "Customize",
    icon: "sliders",
    audience: "customer",
    section: "your-profile",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/app/card",
    label: "Card",
    icon: "card",
    audience: "customer",
    section: "share-and-grow",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    tabLabel: "Stats",
    icon: "chart",
    audience: "customer",
    section: "share-and-grow",
    match: "prefix",
    cardOwnerOnly: true,
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/app/account",
    label: "Account",
    icon: "gear",
    audience: "customer",
    section: "pinned",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: supportHref,
    label: "Help",
    icon: "help",
    audience: "customer",
    section: "pinned",
    match: "exact",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/admin/customers",
    label: "Customers",
    icon: "users",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/admin/profiles",
    label: "Profiles",
    icon: "profiles",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/admin/cards",
    label: "Cards",
    icon: "card",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "tabs"],
  },
  {
    href: "/admin/orders",
    label: "Orders",
    icon: "audit",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/admin/codes",
    label: "Codes",
    icon: "link",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "tabs", "more"],
  },
  {
    href: "/admin/analytics",
    label: "Analytics",
    icon: "chart",
    audience: "admin",
    section: "operations",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/admin/audit-log",
    label: "Audit log",
    icon: "audit",
    audience: "admin",
    section: "governance",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: "settings",
    audience: "admin",
    section: "governance",
    match: "prefix",
    surfaces: ["sidebar", "more"],
  },
];

export function navItemsFor(
  audience: NavAudience,
  surface: NavSurface,
  hasCardOwnerFeatures = true,
): NavItem[] {
  return navItems.filter(
    (item) =>
      item.audience === audience &&
      item.surfaces.includes(surface) &&
      (hasCardOwnerFeatures || !item.cardOwnerOnly),
  );
}

export function sidebarSectionsFor(
  audience: NavAudience,
  hasCardOwnerFeatures = true,
): { section: NavSection; label: string; items: NavItem[] }[] {
  const sections: { section: NavSection; label: string; items: NavItem[] }[] = [];
  for (const item of navItemsFor(audience, "sidebar", hasCardOwnerFeatures)) {
    const existing = sections.find((entry) => entry.section === item.section);
    if (existing) existing.items.push(item);
    else
      sections.push({
        section: item.section,
        label: navSectionLabels[item.section],
        items: [item],
      });
  }
  return sections;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function activeNavItemFor(
  audience: NavAudience,
  pathname: string,
  hasCardOwnerFeatures = true,
): NavItem | undefined {
  return navItemsFor(audience, "sidebar", hasCardOwnerFeatures)
    .filter((item) => isNavItemActive(item, pathname))
    .sort((left, right) => right.href.length - left.href.length)[0];
}

export const navAudienceSwitch = (Object.keys(navAudiences) as NavAudience[]).map((audience) => ({
  audience,
  href: navAudiences[audience].home,
  label: navAudiences[audience].label,
}));
