"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { isLocalDemoMode } from "@/lib/demo/mode";
import type { DemoProfile } from "@/lib/demo/fixtures";
import { getDemoProfiles, updateDemoState, useDemoState } from "@/lib/demo/store";
import { validateProfileSlug } from "@/lib/domain";
import { createSetupToken, hashSetupToken } from "@/lib/auth/setup-token";
import { CopyButton } from "@/components/admin/prepared/CopyButton";

export function LegacyCustomersManager() {
  return isLocalDemoMode() ? <DemoInviteForm /> : <ConvexInviteForm />;
}

function DemoInviteForm() {
  const state = useDemoState();
  return (
    <LegacyInviteForm
      local
      onCreate={({ email, name, slug, token }) => {
        if (state.customers.some((customer) => customer.email.toLowerCase() === email))
          throw new Error("That customer email is already registered.");
        const customerId = "customer-" + Date.now();
        const profileId = "profile-" + Date.now();
        const baseSlug = (slug || email.split("@")[0] || "new-profile")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        const profileSlug = baseSlug + "-" + Date.now().toString(36);
        const existingSlugs = getDemoProfiles(state).flatMap((profile) => [
          profile.draft.slug,
          ...(profile.published ? [profile.published.slug] : []),
        ]);
        const slugError = validateProfileSlug(profileSlug, { existingSlugs });
        if (slugError) throw new Error(slugError);
        const occurredAt = new Date().toISOString();
        updateDemoState((current) => ({
          ...current,
          profiles: [
            ...getDemoProfiles(current),
            {
              id: profileId,
              ownerId: customerId,
              status: "draft",
              theme: "paper",
              draft: { name, slug: profileSlug, email, links: [] },
              published: null,
            } satisfies DemoProfile,
          ],
          customers: [
            ...current.customers,
            {
              id: customerId,
              email,
              role: "customer",
              profileId,
              status: "invited",
              deletionStatus: "active",
              setupToken: token,
            },
          ],
          audits: [
            {
              id: "audit-" + Date.now(),
              actor: "admin@tapit.local",
              action: "customer.created",
              target: email,
              occurredAt,
              after: "invited",
            },
            ...current.audits,
          ],
        }));
      }}
    />
  );
}

function ConvexInviteForm() {
  const create = useMutation(api.customers.createCustomer);
  return (
    <LegacyInviteForm
      local={false}
      onCreate={async ({ email, name, slug, token }) => {
        await create({
          email,
          ...(slug ? { slug } : {}),
          name,
          tokenHash: await hashSetupToken(token),
        });
      }}
    />
  );
}

function LegacyInviteForm({
  local,
  onCreate,
}: {
  local: boolean;
  onCreate: (values: {
    email: string;
    name: string;
    slug: string;
    token: string;
  }) => void | Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileSlug, setProfileSlug] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [setupLink, setSetupLink] = useState("");
  const [pending, setPending] = useState(false);

  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSetupLink("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage({ tone: "error", text: "Enter a valid customer email address." });
      return;
    }
    setPending(true);
    try {
      const token = local ? `demo-${Date.now().toString(36)}` : createSetupToken();
      await onCreate({
        email: normalizedEmail,
        name: profileName.trim(),
        slug: profileSlug.trim(),
        token,
      });
      setEmail("");
      setSetupLink(`/setup/${token}`);
      setMessage({
        tone: "success",
        text: `Customer account created for ${normalizedEmail}.`,
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Customer could not be created.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-card bg-tapit-surface p-4 shadow-card">
      <summary className="min-h-11 cursor-pointer content-center font-semibold text-tapit-ink">
        Invite an account by email
      </summary>
      <section aria-label="Create customer by email" className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-tapit-muted">
          Create a traditional email-based invitation. Use “Set up for someone” for a prepared
          profile and shareable setup link.
        </p>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={(event) => void createCustomer(event)}
        >
          <div className="min-w-64 flex-1">
            <Field
              autoComplete="off"
              id="legacy-customer-email"
              label="Customer email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
              type="email"
              value={email}
            />
          </div>
          <div className="min-w-52 flex-1">
            <Field
              id="legacy-customer-profile-name"
              label="Initial profile name"
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Optional display name"
              value={profileName}
            />
          </div>
          <div className="min-w-52 flex-1">
            <Field
              id="legacy-customer-profile-slug"
              label="Profile slug"
              onChange={(event) => setProfileSlug(event.target.value)}
              placeholder="Optional stable slug"
              value={profileSlug}
            />
          </div>
          <Button disabled={pending} loading={pending} type="submit">
            <Icon name="user" size={18} />
            Create and invite
          </Button>
        </form>
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        {setupLink ? (
          <div className="flex flex-wrap items-center gap-3 rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
            Setup link:{" "}
            <a className="break-all font-semibold text-tapit-accent-strong" href={setupLink}>
              {setupLink}
            </a>
            <CopyButton
              text={
                new URL(
                  setupLink,
                  typeof window === "undefined" ? "http://localhost" : window.location.origin,
                ).href
              }
              label="Copy link"
            />
          </div>
        ) : null}
      </section>
    </details>
  );
}
