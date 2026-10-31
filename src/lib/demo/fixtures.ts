import type { CardRecord, ProfileRecord } from "@/lib/domain";
import { cardUrlFromToken } from "@/lib/card-url";
import { DEFAULT_SUPPORT_URL } from "@/lib/support";

import { DEFAULT_DEMO_PASSWORD_HASH } from "./password";

export type ProfileTheme = "paper" | "moss" | "night" | "custom";

export type DemoProfile = ProfileRecord & {
  theme: ProfileTheme;
};

export type DemoCard = CardRecord & {
  token: string;
  createdAt?: number;
  claimCode?: string;
  claimCodeGeneration?: number;
  claimCodeExpiresAt?: number;
  claimCodeInvalidatedAt?: number;
  correctionRequestedAt?: number;
  claimChallenge?: string;
  claimChallengeCode?: string;
  claimChallengeExpiresAt?: number;
  claimChallengeEmail?: string;
  claimedAt?: number;
  lostCardResolution?: "return" | "inactive";
  ownerDisabledAt?: number;
};

export type DemoCardCorrectionRequest = {
  id: string;
  token: string;
  challenge: string;
  profileId?: string;
  requestedBy: string;
  requestedAt: number;
  status: "pending" | "corrected";
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
  claimedCardIds?: string[];
  cardOwnerAccessOverride?: boolean;
  isDemo?: boolean;
  demoResetInProgress?: boolean;
  demoOnboardingPending?: boolean;
};

export type DemoSetupInvitation = {
  id: string;
  customerId: string;
  tokenHash: string;
  expiresAt: number;
  invalidatedAt?: number;
  usedAt?: number;
};

export type DemoSetupState = "waiting" | "draft" | "active";

export type AnalyticsBucket = {
  profileId?: string;
  bucketStart: number;
  source?: "nfc" | "qr" | "direct" | "unknown";
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
  targetAccountEmail?: string;
  occurredAt: string;
  before?: string;
  after?: string;
  actorId?: string;
  cardId?: string;
  profileId?: string;
};

export type DemoCardOrderPaymentMethod = {
  id: string;
  provider: string;
  label: string;
  accountDetails: string;
  instructions: string;
  active: boolean;
  qrAssetKey?: string;
  createdAt: number;
  updatedAt: number;
};

export type DemoCardOrderReferralCode = {
  id: string;
  code: string;
  offerId?: string | null;
  referrerCode?: string | null;
  referrerLabel?: string;
  /** Legacy standalone codes keep their own pricing and usage until explicitly mapped. */
  fixedPriceCentavos?: number;
  usageCount?: number;
  usageLimit?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type DemoCardOrderOffer = {
  id: string;
  code: string;
  scope: "demo";
  fixedPriceCentavos?: number;
  percentOff?: number;
  expiresOn?: string;
  usageCount?: number;
  usageLimit?: number;
  createdAt: number;
  updatedAt: number;
};

export type DemoCardOrderDesignSource =
  | {
      kind: "upload";
      assetKey: string;
      fileName: string;
      contentType: "image/jpeg" | "image/png";
      byteSize: number;
    }
  | { kind: "url"; url: string };

export type DemoCardOrder = {
  id: string;
  customerId: string;
  quantity: 1;
  designSource: DemoCardOrderDesignSource;
  backDesignSource?: DemoCardOrderDesignSource;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  cardPriceCentavos: number;
  discountCentavos: number;
  shippingQuoteCentavos?: number;
  paymentMethodId: string;
  paymentSnapshot: {
    provider: string;
    label: string;
    accountDetails: string;
    instructions: string;
    qrAssetKey?: string;
  };
  referralCodeId?: string;
  referralSnapshot?: { code: string; referrerLabel: string };
  offerId?: string;
  offerSnapshot?: { code: string; fixedPriceCentavos?: number; percentOff?: number };
  paymentStatus: "unpaid" | "received" | "refunded";
  fulfillmentStatus:
    "awaiting_shipping_quote" | "awaiting_payment" | "processing" | "delivered" | "cancelled";
  commissionStatus: "none" | "pending" | "eligible" | "paid" | "void";
  commissionCentavos: number;
  payoutReference?: string;
  createdAt: number;
  updatedAt: number;
  receipt?: {
    receiptKey: string;
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "application/pdf";
    byteSize: number;
    uploadedAt: number;
  };
};

export type DemoCardOrderReferralCodeUsage = {
  date: number;
  orderId: string;
  customerName?: string;
  customerEmail?: string;
  paymentStatus: DemoCardOrder["paymentStatus"];
  fulfillmentStatus: DemoCardOrder["fulfillmentStatus"];
  commissionStatus: DemoCardOrder["commissionStatus"];
};

export type DemoState = {
  customers: DemoCustomer[];
  setupInvitations: DemoSetupInvitation[];
  nextSetupTokenId: number;
  profiles: DemoProfile[];
  profile: DemoProfile;
  themes: Record<string, ProfileTheme>;
  theme: ProfileTheme;
  cards: DemoCard[];
  cardCorrectionRequests?: DemoCardCorrectionRequest[];
  cardOrderPaymentMethods: DemoCardOrderPaymentMethod[];
  cardOrderReferralCodes: DemoCardOrderReferralCode[];
  cardOrderOffers: DemoCardOrderOffer[];
  cardOrders: DemoCardOrder[];
  analytics: AnalyticsBucket[];
  audits: DemoAuditEvent[];
  supportUrl: string;
  lostCardReturnInstructions?: string;
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
  const claimProfile: DemoProfile = {
    id: "profile-claimable",
    ownerId: "customer-claimable",
    status: "unpublished",
    theme: "paper",
    draft: {
      name: "Claimed profile",
      slug: "claimed-profile",
      links: [
        {
          id: "site",
          label: "Website",
          destination: "https://example.com",
          enabled: true,
        },
      ],
    },
    published: null,
  };
  const adminProfile: DemoProfile = {
    id: "profile-admin-demo",
    ownerId: "admin-demo",
    status: "draft",
    theme: "paper",
    draft: { name: "Tapit Admin", slug: "admin-tapit", email: "admin@tapit.local", links: [] },
    published: null,
  };
  const setupProfile: DemoProfile = {
    id: "profile-buyer-setup",
    ownerId: "customer-buyer-setup",
    status: "draft",
    theme: "paper",
    draft: {
      name: "Buyer Setup",
      slug: "buyer-setup",
      bio: "A private draft for card setup.",
      links: [],
    },
    published: null,
  };
  const activeUnclaimedProfile: DemoProfile = {
    id: "profile-active-unclaimed",
    ownerId: "customer-active-unclaimed",
    status: "draft",
    theme: "paper",
    draft: { name: "Active Setup", slug: "active-setup", links: [] },
    published: null,
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
        id: "customer-claimable",
        email: "owner@example.test",
        role: "customer",
        profileId: "profile-claimable",
        status: "active",
        deletionStatus: "active",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
      {
        id: "admin-demo",
        email: "admin@tapit.local",
        role: "admin",
        profileId: "profile-admin-demo",
        status: "active",
        deletionStatus: "active",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
      {
        id: "customer-buyer-setup",
        email: "buyer@example.test",
        role: "customer",
        profileId: "profile-buyer-setup",
        status: "active",
        deletionStatus: "active",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
      {
        id: "customer-active-unclaimed",
        email: "active-setup@example.test",
        role: "customer",
        profileId: "profile-active-unclaimed",
        status: "active",
        deletionStatus: "active",
        passwordHash: DEFAULT_DEMO_PASSWORD_HASH,
      },
    ],
    setupInvitations: [],
    nextSetupTokenId: 1,
    profiles: [primaryProfile, claimProfile, adminProfile, setupProfile, activeUnclaimedProfile],
    profile: primaryProfile,
    themes: {
      [primaryProfile.id]: primaryProfile.theme,
      [adminProfile.id]: adminProfile.theme,
      [setupProfile.id]: setupProfile.theme,
    },
    theme: "paper",
    cards: [
      {
        id: "card-unassigned-demo",
        token: "unassigned-card-demo",
        cardUrl: cardUrlFromToken("unassigned-card-demo"),
        status: "registered",
        claimCode: "DEMA29BC",
      },
      {
        id: "card-mara-active",
        token: "mara-card-7f2q",
        cardUrl: cardUrlFromToken("mara-card-7f2q"),
        status: "active",
        profileId: "profile-mara",
        claimedAt: 1,
      },
      {
        id: "card-claimable-demo",
        token: "claimable-card-demo",
        cardUrl: cardUrlFromToken("claimable-card-demo"),
        status: "claimable",
        profileId: "profile-claimable",
        claimCode: "MARA2Q8K",
      },
      {
        id: "card-active-unclaimed-demo",
        token: "active-unclaimed-card-demo",
        cardUrl: cardUrlFromToken("active-unclaimed-card-demo"),
        status: "active",
        profileId: "profile-active-unclaimed",
        claimCode: "ACTV29BC",
      },
      {
        id: "card-mara-inactive",
        token: "mara-card-retired",
        cardUrl: cardUrlFromToken("mara-card-retired"),
        status: "inactive",
        profileId: "profile-mara",
      },
    ],
    cardOrderPaymentMethods: [],
    cardOrderReferralCodes: [],
    cardOrderOffers: [],
    cardOrders: [],
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
    supportUrl: DEFAULT_SUPPORT_URL,
  };
}

export const DEMO_DAY_MS = DAY;
