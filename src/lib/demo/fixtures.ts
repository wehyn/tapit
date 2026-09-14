import type { CardRecord, ProfileRecord } from "@/lib/domain";

import { DEFAULT_DEMO_PASSWORD_HASH } from "./password";

export type ProfileTheme = "paper" | "moss" | "night";

export type DemoProfile = ProfileRecord & {
  theme: ProfileTheme;
};

export type DemoCard = CardRecord & {
  token: string;
};

export type DemoCustomer = {
  id: string;
  email: string;
  role: "customer" | "admin";
  profileId?: string;
  status: "invited" | "active" | "deleted";
  deletionStatus: "active" | "requested" | "deleted";
  setupToken?: string;
  passwordHash?: string;
};

export type AnalyticsBucket = {
  profileId?: string;
  bucketStart: number;
  views: number;
  uniqueViews: number;
  clicks: number;
  linkClicks: Record<string, number>;
};

export type DemoAuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  occurredAt: string;
  before?: string;
  after?: string;
};

export type DemoState = {
  customers: DemoCustomer[];
  profiles: DemoProfile[];
  profile: DemoProfile;
  themes: Record<string, ProfileTheme>;
  theme: ProfileTheme;
  cards: DemoCard[];
  analytics: AnalyticsBucket[];
  audits: DemoAuditEvent[];
  supportUrl: string;
};

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): number {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  return date.getTime() - days * DAY;
}

const publishedLinks = [
  {
    id: "linkedin",
    label: "LinkedIn",
    destination: "https://www.linkedin.com/in/mara-velasquez",
    enabled: true,
    icon: "linkedin" as const,
  },
  {
    id: "portfolio",
    label: "Portfolio",
    destination: "https://mara-velasquez.example",
    enabled: true,
    icon: "globe" as const,
  },
  {
    id: "booking",
    label: "Book a conversation",
    destination: "https://cal.com/mara-velasquez",
    enabled: true,
    icon: "calendar" as const,
  },
  {
    id: "email",
    label: "Email",
    destination: "mailto:mara@example.test",
    enabled: true,
    icon: "mail" as const,
  },
];

const profileContent = {
  name: "Mara Velasquez",
  slug: "mara-velasquez",
  bio: "Brand systems for independent teams.",
  email: "mara@example.test",
  phone: "+63 917 555 0184",
  website: "https://mara-velasquez.example",
  imageUrl: "/images/tapit-demo-mara-avatar.png",
  links: publishedLinks,
};

export function createDefaultDemoState(): DemoState {
  const publishedAt = new Date(daysAgo(2)).toISOString();
  const primaryProfile: DemoProfile = {
    id: "profile-mara",
    ownerId: "customer-mara",
    status: "published",
    theme: "paper",
    draft: {
      ...profileContent,
      links: publishedLinks.map((link) => ({ ...link })),
    },
    published: {
      ...profileContent,
      links: publishedLinks.map((link) => ({ ...link })),
      publishedAt,
    },
  };
  return {
    customers: [
      {
        id: "customer-mara",
        email: "mara@example.test",
        role: "customer",
        profileId: "profile-mara",
        status: "active",
        deletionStatus: "active",
        setupToken: "demo-setup-token",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
      {
        id: "admin-demo",
        email: "admin@tapit.local",
        role: "admin",
        status: "active",
        deletionStatus: "active",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
    ],
    profiles: [primaryProfile],
    profile: primaryProfile,
    themes: { [primaryProfile.id]: primaryProfile.theme },
    theme: "paper",
    cards: [
      {
        id: "card-mara-active",
        token: "mara-card-7f2q",
        cardUrl: "/c/mara-card-7f2q",
        status: "active",
        profileId: "profile-mara",
      },
      {
        id: "card-mara-inactive",
        token: "mara-card-retired",
        cardUrl: "/c/mara-card-retired",
        status: "inactive",
        profileId: "profile-mara",
      },
    ],
    analytics: [
      {
        profileId: "profile-mara",
        bucketStart: daysAgo(2),
        views: 18,
        uniqueViews: 11,
        clicks: 9,
        linkClicks: { linkedin: 3, portfolio: 4, booking: 2 },
      },
      {
        profileId: "profile-mara",
        bucketStart: daysAgo(8),
        views: 27,
        uniqueViews: 17,
        clicks: 13,
        linkClicks: { linkedin: 5, portfolio: 6, booking: 2 },
      },
      {
        profileId: "profile-mara",
        bucketStart: daysAgo(34),
        views: 41,
        uniqueViews: 25,
        clicks: 17,
        linkClicks: { linkedin: 6, portfolio: 8, booking: 3 },
      },
      {
        profileId: "profile-mara",
        bucketStart: daysAgo(120),
        views: 63,
        uniqueViews: 39,
        clicks: 24,
        linkClicks: { linkedin: 9, portfolio: 10, booking: 5 },
      },
    ],
    audits: [
      {
        id: "audit-seed-1",
        actor: "Administrator",
        action: "card.assigned",
        target: "mara-card-7f2q → Mara Velasquez",
        occurredAt: publishedAt,
        after: "active",
      },
      {
        id: "audit-seed-2",
        actor: "Mara Velasquez",
        action: "profile.published",
        target: "mara-velasquez",
        occurredAt: publishedAt,
        after: "published",
      },
    ],
    supportUrl: "mailto:support@example.test",
  };
}

export const DEMO_DAY_MS = DAY;
