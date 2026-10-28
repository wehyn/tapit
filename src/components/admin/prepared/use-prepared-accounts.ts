"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQuery_experimental } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  getDemoProfiles,
  listCustomers,
  useHydratedDemoState,
  createPrepared as createDemo,
  updatePrepared as updateDemo,
  generateLink as generateDemo,
  revokeLink as revokeDemo,
  deletePreparedDraft as deleteDemo,
  updateDemoState,
  updateDemoProfile,
} from "@/lib/demo/store";
import { createSetupToken, hashSetupToken } from "@/lib/auth/setup-token";
import {
  assertDemoCardOrderDeletionAccess,
  deleteDemoCardOrderAssetsForApprovedDeletion,
} from "@/lib/demo/card-order-assets";
import type { PreparedProfileInput } from "@/lib/demo/store";
import type { ActiveCustomerRow, PreparedRow } from "./types";

type Result = {
  rows: PreparedRow[];
  loading: boolean;
  create: (profile: PreparedProfileInput) => Promise<{ customerId: string; token: string }>;
  update: (customerId: string, profile: PreparedProfileInput) => Promise<void>;
  generate: (
    customerId: string,
    state: "waiting" | "draft",
  ) => Promise<{ token: string; title: string }>;
  revoke: (row: PreparedRow) => Promise<void>;
  remove: (customerId: string) => Promise<void>;
  valuesFor: (customerId: string) => PreparedProfileInput | null;
  revokeLegacy: (invitationId: string) => Promise<void>;
  replaceLegacy: (customerId: string) => Promise<string>;
  changeRole: (customerId: string, role: "customer" | "admin") => Promise<void>;
  approveDeletion: (customerId: string) => Promise<void>;
  setOwnerAccess: (row: ActiveCustomerRow, enabled: boolean) => Promise<void>;
};

export type PreparedAccounts = Result;

const pageArgs = { paginationOpts: { numItems: 1000, cursor: null } };

export function useConvexPreparedAccounts(): Result {
  const waitingResult = useQuery_experimental({
    query: api.customers.list,
    args: { ...pageArgs, setupState: "waiting" },
  });
  const draftResult = useQuery_experimental({
    query: api.customers.list,
    args: { ...pageArgs, setupState: "draft" },
  });
  const activeResult = useQuery_experimental({
    query: api.customers.list,
    args: { ...pageArgs, setupState: "active" },
  });
  const legacyResult = useQuery_experimental({
    query: api.customers.list,
    args: { ...pageArgs, setupState: null },
  });
  const invitesResult = useQuery_experimental({
    query: api.invitations.listForAdmin,
    args: pageArgs,
  });
  const deletionsResult = useQuery_experimental({
    query: api.customers.listDeletionRequests,
    args: pageArgs,
  });
  const profiles = useQuery(api.profiles.adminList, {});
  const cards = useQuery(api.cards.adminList, {});
  const createMutation = useMutation(api.customers.createPrepared);
  const updateMutation = useMutation(api.customers.updatePrepared);
  const deleteMutation = useMutation(api.customers.deletePreparedDraft);
  const generateMutation = useMutation(api.invitations.generate);
  const revokeMutation = useMutation(api.invitations.revoke);
  const replaceMutation = useMutation(api.invitations.replace);
  const setRoleMutation = useMutation(api.customers.setRole);
  const approveMutation = useMutation(api.customers.approveDeletion);
  const ownerAccessMutation = useMutation(api.customers.setCardOwnerAccessOverride);

  const rows = useMemo<PreparedRow[]>(() => {
    const resultPages = [waitingResult, draftResult, activeResult, legacyResult];
    const page = (result: typeof waitingResult) =>
      result.status === "success" && Array.isArray(result.data.page) ? result.data.page : [];
    if (
      resultPages.some((result) => result.status !== "success" || !Array.isArray(result.data.page))
    )
      return [];
    const all = resultPages.flatMap(page);
    const invites =
      invitesResult.status === "success" && Array.isArray(invitesResult.data?.page)
        ? invitesResult.data.page
        : [];
    const requests =
      deletionsResult.status === "success" && Array.isArray(deletionsResult.data?.page)
        ? deletionsResult.data.page
        : [];
    return all.map((customer): PreparedRow => {
      const profile = profiles?.find((candidate) => candidate._id === customer.profileId);
      const customerInvites = invites.filter((item) => item.customerId === customer._id);
      const invitation = customerInvites.find(
        (item) => item.email === null && item.invalidatedAt === null && item.acceptedAt === null,
      );
      const legacyInvitation = customerInvites.find(
        (item) => item.email !== null && item.invalidatedAt === null,
      );
      const latestLegacyInvitation = customerInvites.find((item) => item.email !== null);
      const base = {
        id: customer._id,
        email: customer.email ?? "",
        profileName: customer.profileName ?? profile?.draft.name ?? "Prepared account",
        profileSlug: customer.profileSlug ?? profile?.slug ?? "",
        linkExpiresAt: customer.linkExpiresAt,
        invitationId:
          legacyInvitation?.invitationId ??
          invitation?.invitationId ??
          latestLegacyInvitation?.invitationId,
      };
      if (customer.setupState === "waiting")
        return { ...base, setupState: "waiting", kind: "prepared" };
      if (customer.setupState === "draft")
        return {
          ...base,
          setupState: "draft",
          kind: "prepared",
        };
      if (customer.setupState === null)
        return {
          ...base,
          setupState: null,
          kind: "legacy",
          role: customer.role,
          status: customer.status,
          deletionStatus: customer.deletionStatus,
          profileStatus: profile?.status ?? null,
          cardCount: cards?.filter((card) => card.profileId === customer.profileId).length ?? 0,
          invitationStatus: latestLegacyInvitation
            ? latestLegacyInvitation.invalidatedAt !== null
              ? "revoked"
              : latestLegacyInvitation.acceptedAt !== null
                ? "accepted"
                : "pending"
            : undefined,
        };
      const active: ActiveCustomerRow = {
        ...base,
        setupState: "active",
        kind: "active",
        invitationId: legacyInvitation?.invitationId,
        role: customer.role,
        status: customer.status,
        deletionStatus: customer.deletionStatus,
        profileStatus: profile?.status ?? null,
        cardCount: cards?.filter((card) => card.profileId === customer.profileId).length ?? 0,
        hasDeletionRequest: requests.some(
          ({ request }) => request.customerId === customer._id && request.status === "requested",
        ),
        cardOwnerAccessOverride: customer.cardOwnerAccessOverride === true,
        ownsProfile: profile !== undefined,
        legacyInvitationActive: legacyInvitation !== undefined,
        invitationStatus: latestLegacyInvitation
          ? latestLegacyInvitation.invalidatedAt !== null
            ? "revoked"
            : latestLegacyInvitation.acceptedAt !== null
              ? "accepted"
              : "pending"
          : undefined,
      };
      return active;
    });
  }, [
    waitingResult,
    draftResult,
    activeResult,
    legacyResult,
    invitesResult,
    deletionsResult,
    profiles,
    cards,
  ]);

  async function create(profile: PreparedProfileInput) {
    const token = createSetupToken();
    const result = await createMutation({ profile, tokenHash: await hashSetupToken(token) });
    return { customerId: result.customerId, token };
  }
  async function update(customerId: string, profile: PreparedProfileInput) {
    await updateMutation({ customerId: customerId as Id<"customers">, profile });
  }
  async function generate(customerId: string, currentState: "waiting" | "draft") {
    const token = createSetupToken();
    await generateMutation({
      customerId: customerId as Id<"customers">,
      tokenHash: await hashSetupToken(token),
    });
    return { token, title: currentState === "waiting" ? "New link ready" : "Link generated" };
  }
  async function revoke(row: PreparedRow) {
    if (!row.invitationId) throw new Error("The current setup link is unavailable.");
    await revokeMutation({ invitationId: row.invitationId as Id<"invitations"> });
  }
  async function remove(customerId: string) {
    await deleteMutation({ customerId: customerId as Id<"customers"> });
  }
  async function revokeLegacy(invitationId: string) {
    await revokeMutation({ invitationId: invitationId as Id<"invitations"> });
  }
  async function replaceLegacy(customerId: string) {
    const token = createSetupToken();
    await replaceMutation({
      customerId: customerId as Id<"customers">,
      tokenHash: await hashSetupToken(token),
    });
    return token;
  }
  async function changeRole(customerId: string, role: "customer" | "admin") {
    await setRoleMutation({ customerId: customerId as Id<"customers">, role });
  }
  async function approveDeletion(customerId: string) {
    const request =
      deletionsResult.status === "success" && Array.isArray(deletionsResult.data?.page)
        ? deletionsResult.data.page.find(
            ({ request }) => request.customerId === customerId && request.status === "requested",
          )
        : undefined;
    if (!request) throw new Error("The deletion request is no longer available.");
    await approveMutation({ requestId: request.request._id });
  }
  async function setOwnerAccess(row: ActiveCustomerRow, enabled: boolean) {
    await ownerAccessMutation({ customerId: row.id as Id<"customers">, enabled });
  }
  function valuesFor(customerId: string): PreparedProfileInput | null {
    const all = [waitingResult, draftResult, activeResult, legacyResult].flatMap((result) =>
      result.status === "success" && Array.isArray(result.data?.page) ? result.data.page : [],
    );
    const row = all.find((item) => item._id === customerId);
    const profile = profiles?.find((item) => item._id === row?.profileId);
    if (!profile) return null;
    return {
      name: profile.draft.name,
      slug: profile.draft.slug,
      bio: profile.draft.bio,
      contactEmail: profile.draft.email,
      phone: profile.draft.phone,
      website: profile.draft.website,
      links: profile.draft.links.map(({ label, destination }) => ({ label, url: destination })),
    };
  }
  return {
    rows,
    loading: [waitingResult, draftResult, activeResult, legacyResult].some(
      (result) => result.status !== "success",
    ),
    create,
    update,
    generate,
    revoke,
    remove,
    valuesFor,
    revokeLegacy,
    replaceLegacy,
    changeRole,
    approveDeletion,
    setOwnerAccess,
  };
}

export function useDemoPreparedAccounts(): Result {
  const { state, hydrated } = useHydratedDemoState();
  const rows = useMemo(
    () =>
      listCustomers().map((customer): PreparedRow => {
        const owner = state.customers.find((entry) => entry.id === customer.id);
        const profile = owner && getDemoProfiles(state).find((item) => item.id === owner.profileId);
        const invitation = state.setupInvitations
          .filter((item) => item.customerId === customer.id)
          .at(-1);
        const base = {
          id: customer.id,
          email: customer.email,
          profileName: customer.profileName,
          profileSlug: customer.profileSlug,
          linkExpiresAt: customer.linkExpiresAt,
          invitationId: invitation?.id,
        };
        if (customer.setupState === "waiting")
          return { ...base, setupState: "waiting", kind: "prepared" };
        if (customer.setupState === "draft")
          return {
            ...base,
            setupState: "draft",
            kind: "prepared",
          };
        if (customer.setupState === null)
          return {
            ...base,
            setupState: null,
            kind: "legacy",
            role: owner?.role === "admin" ? "admin" : "customer",
            status: owner?.status ?? "invited",
            deletionStatus: owner?.deletionStatus ?? "active",
            profileStatus: profile?.status ?? null,
            cardCount: profile
              ? state.cards.filter((card) => card.profileId === profile.id).length
              : 0,
            invitationStatus: owner?.setupToken ? "pending" : undefined,
            setupToken: owner?.setupToken,
          };
        return {
          ...base,
          setupState: "active",
          kind: "active",
          role: owner?.role === "admin" ? "admin" : "customer",
          status: owner?.status ?? "active",
          deletionStatus: owner?.deletionStatus ?? "active",
          profileStatus: profile?.status ?? null,
          cardCount: profile
            ? state.cards.filter((card) => card.profileId === profile.id).length
            : 0,
          hasDeletionRequest: owner?.deletionStatus === "requested",
          cardOwnerAccessOverride: owner?.cardOwnerAccessOverride === true,
          ownsProfile: profile !== undefined && profile.ownerId === owner?.id,
          legacyInvitationActive: Boolean(owner?.setupToken),
          setupToken: owner?.setupToken,
        };
      }),
    [state],
  );

  return {
    rows,
    loading: !hydrated,
    create: createDemo,
    update: async (id, profile) => updateDemo(id, profile),
    generate: async (id, current) => ({
      token: (await generateDemo(id)).token,
      title: current === "waiting" ? "New link ready" : "Link generated",
    }),
    revoke: async (row) => revokeDemo(row.id),
    remove: async (id) => deleteDemo(id),
    valuesFor: (id) => {
      const customer = state.customers.find((item) => item.id === id);
      const profile =
        customer && getDemoProfiles(state).find((item) => item.id === customer.profileId);
      return profile
        ? {
            name: profile.draft.name,
            slug: profile.draft.slug,
            bio: profile.draft.bio,
            contactEmail: profile.draft.email,
            phone: profile.draft.phone,
            website: profile.draft.website,
            links: profile.draft.links.map(({ label, destination }) => ({
              label,
              url: destination,
            })),
          }
        : null;
    },
    revokeLegacy: async (invitationId) => {
      const customer = state.customers.find((item) => item.setupToken === invitationId);
      if (!customer) throw new Error("The invitation is no longer available.");
      updateDemoState((current) => ({
        ...current,
        customers: current.customers.map((item) =>
          item.id === customer.id ? { ...item, setupToken: undefined } : item,
        ),
      }));
    },
    replaceLegacy: async (customerId) => {
      const token = createSetupToken();
      updateDemoState((current) => ({
        ...current,
        customers: current.customers.map((customer) =>
          customer.id === customerId ? { ...customer, setupToken: token } : customer,
        ),
      }));
      return token;
    },
    changeRole: async (customerId, role) => {
      updateDemoState((current) => ({
        ...current,
        customers: current.customers.map((customer) =>
          customer.id === customerId ? { ...customer, role } : customer,
        ),
      }));
    },
    setOwnerAccess: async (row, enabled) => {
      if (enabled && !row.ownsProfile)
        throw new Error("An owned customer profile is required to grant owner access.");
      if (row.cardOwnerAccessOverride === enabled) return;
      updateDemoState((current) => {
        const target = current.customers.find((candidate) => candidate.id === row.id);
        if (
          target === undefined ||
          target.status !== "active" ||
          target.role !== "customer" ||
          target.deletionStatus !== "active" ||
          (target.cardOwnerAccessOverride === true) === enabled
        )
          return current;
        if (enabled) {
          const ownedProfile = getDemoProfiles(current).find(
            (candidate) => candidate.id === target.profileId,
          );
          if (ownedProfile === undefined || ownedProfile.ownerId !== target.id) return current;
        }
        return {
          ...current,
          customers: current.customers.map((candidate) =>
            candidate.id === target.id
              ? { ...candidate, cardOwnerAccessOverride: enabled ? true : undefined }
              : candidate,
          ),
          audits: [
            {
              id: `audit-${Date.now()}`,
              actor: "admin@tapit.local",
              action: "customer.card_owner_access_override_changed",
              target: target.email,
              occurredAt: new Date().toISOString(),
              before: String(target.cardOwnerAccessOverride === true),
              after: String(enabled),
            },
            ...current.audits,
          ],
        };
      });
    },
    approveDeletion: async (customerId) => {
      const adminId = assertDemoCardOrderDeletionAccess(customerId);
      const occurredAt = new Date().toISOString();
      await deleteDemoCardOrderAssetsForApprovedDeletion(customerId, adminId, (current) => {
        const customer = current.customers.find((candidate) => candidate.id === customerId);
        if (!customer) return current;
        const profile = getDemoProfiles(current).find(
          (candidate) => candidate.id === customer.profileId,
        );
        const withProfile = profile
          ? updateDemoProfile(current, profile.id, (currentProfile) => ({
              ...currentProfile,
              status: "unpublished",
            }))
          : current;
        return {
          ...withProfile,
          customers: withProfile.customers.map((candidate) =>
            candidate.id === customerId
              ? {
                  ...candidate,
                  status: "deleted",
                  deletionStatus: "deleted",
                  setupToken: undefined,
                }
              : candidate,
          ),
          cards: withProfile.cards.map((card) =>
            card.profileId === customer.profileId &&
            (card.status === "active" ||
              card.status === "claimable" ||
              card.status === "registered")
              ? { ...card, status: "inactive" }
              : card,
          ),
          audits: [
            {
              id: "audit-" + Date.now(),
              actor: "admin@tapit.local",
              action: "account.deletion_approved",
              target: customer.email,
              occurredAt,
              before: "requested",
              after: "deleted; profile unpublished; cards inactive; orders and artwork removed",
            },
            ...withProfile.audits,
          ],
        };
      });
    },
  };
}
