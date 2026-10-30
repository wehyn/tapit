"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Tile } from "@/components/ui/Tile";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

type OnboardingProfileDetails = {
  name: string;
  bio: string;
  website: string;
};

export function OnboardingForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const completeOnboarding = useMutation(api.customers.completeSelfServiceOnboarding);
  const deletePendingAccount = useMutation(api.customers.deletePendingAccount);
  const [details, setDetails] = useState<OnboardingProfileDetails>({
    name: "",
    bio: "",
    website: "",
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState<string>();
  const [profileCreatedDialogOpen, setProfileCreatedDialogOpen] = useState(false);
  const initializedName = useRef(false);
  const completingOnboarding = useRef(false);
  const safeNextPath = sanitizeReturnPath(nextPath);

  const closeProfileCreatedDialog = useCallback(() => {
    setProfileCreatedDialogOpen(false);
  }, []);
  const continueToCustomization = useCallback(() => {
    router.replace(safeNextPath || "/app/profile");
  }, [router, safeNextPath]);

  useEffect(() => {
    if (access !== undefined && !initializedName.current) {
      initializedName.current = true;
      setDetails((current) => ({ ...current, name: access.onboardingName ?? "" }));
    }
  }, [access]);

  useEffect(() => {
    if (access?.accountStatus === "active" && !completingOnboarding.current)
      router.replace(safeNextPath || "/app/profile");
  }, [access?.accountStatus, router, safeNextPath]);

  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = details.name.trim();
    if (!name) {
      setError("Enter a display name to continue.");
      return;
    }
    const bio = details.bio.trim();
    const website = details.website.trim();
    if (website) {
      let parsedWebsite: URL;
      try {
        parsedWebsite = new URL(website);
      } catch {
        setError("Enter a valid HTTPS website address.");
        return;
      }
      if (
        parsedWebsite.protocol !== "https:" ||
        !parsedWebsite.hostname ||
        parsedWebsite.username ||
        parsedWebsite.password
      ) {
        setError("Enter a valid HTTPS website address.");
        return;
      }
    }
    setSubmitting(true);
    setError("");
    completingOnboarding.current = true;
    try {
      const result = await completeOnboarding({
        name,
        ...(bio ? { bio } : {}),
        ...(website ? { website } : {}),
      });
      setSlug(result.slug);
      setProfileCreatedDialogOpen(true);
      setSubmitting(false);
    } catch (cause) {
      completingOnboarding.current = false;
      setError(cause instanceof Error ? cause.message : "Onboarding could not be completed.");
      setSubmitting(false);
    }
  }

  async function deleteAccount() {
    setSubmitting(true);
    setError("");
    try {
      await deletePendingAccount({});
      await signOut();
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account could not be deleted.");
      setSubmitting(false);
      setConfirmingDelete(false);
    }
  }

  if (authLoading || access === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center bg-tapit-paper px-4 text-sm text-tapit-muted">
        Loading your account…
      </main>
    );
  }

  if (access.accountStatus === "invited") {
    return (
      <main className="grid min-h-dvh place-items-center bg-tapit-paper px-4">
        <div className="w-full max-w-md">
          <Notice tone="error">Use your invitation link to finish setting up this account.</Notice>
        </div>
      </main>
    );
  }

  if (access.demoResetInProgress) {
    return (
      <main className="grid min-h-dvh place-items-center bg-tapit-paper px-4">
        <div className="w-full max-w-md">
          <Notice>
            Resetting your Demo account. Onboarding will be available when cleanup finishes.
          </Notice>
        </div>
      </main>
    );
  }

  if (access.accountStatus !== "pending" && slug === undefined) {
    return (
      <main className="grid min-h-dvh place-items-center bg-tapit-paper px-4">
        <div className="w-full max-w-md">
          <Notice tone="error">This account cannot be onboarded in its current state.</Notice>
        </div>
      </main>
    );
  }

  const previewName = details.name.trim() || "Your name";
  const previewInitials = previewName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="flex min-h-dvh flex-col gap-12 bg-tapit-paper px-4 py-6 sm:px-12 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <ol aria-label="Onboarding progress" className="flex flex-wrap gap-2">
          <li>
            <Chip tone="ok">
              <Icon name="check" size={14} weight="bold" />
              Account
            </Chip>
          </li>
          <li>
            <Chip tone="accent">2 · Profile</Chip>
          </li>
          <li>
            <Chip>3 · Done</Chip>
          </li>
        </ol>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-12 lg:flex-row">
        <section className="flex w-full max-w-xl flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold tracking-widest text-tapit-accent-strong uppercase">
              Finish your profile
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
              Choose your display name
            </h1>
            <p className="text-sm text-tapit-muted">
              Display name is required. Bio and website are optional. Your profile starts as a
              private draft that you can publish when you are ready.
            </p>
          </div>
          <form className="grid gap-6" onSubmit={complete}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            {slug && !profileCreatedDialogOpen ? (
              <Notice tone="success">
                Profile created. Your private profile is ready at /{slug}.
              </Notice>
            ) : null}
            <Field
              id="onboarding-name"
              label="Display name (required)"
              maxLength={120}
              onChange={(event) =>
                setDetails((current) => ({ ...current, name: event.target.value }))
              }
              required
              value={details.name}
            />
            <TextareaField
              compact
              id="onboarding-bio"
              label="Bio or role (optional)"
              help="A short introduction people can scan quickly."
              maxLength={140}
              onChange={(event) =>
                setDetails((current) => ({ ...current, bio: event.target.value }))
              }
              placeholder="e.g. Designer helping small teams"
              value={details.bio}
            />
            <Field
              id="onboarding-website"
              label="Website (optional)"
              help="Use an HTTPS address, such as https://yourwebsite.com."
              maxLength={320}
              onChange={(event) =>
                setDetails((current) => ({ ...current, website: event.target.value }))
              }
              placeholder="https://yourwebsite.com"
              type="url"
              value={details.website}
            />
            <Button disabled={submitting || slug !== undefined} type="submit">
              {submitting
                ? "Creating your profile"
                : slug
                  ? "Profile created"
                  : "Complete onboarding"}
            </Button>
            {slug ? (
              <Button onClick={continueToCustomization} type="button">
                Customize your profile
              </Button>
            ) : null}
          </form>
          {slug !== undefined ? null : confirmingDelete ? (
            <div className="flex flex-col gap-3 rounded-control bg-tapit-soft-surface p-4">
              <p className="text-sm text-tapit-muted">
                Delete this pending account? Your Google identity will remain available to start
                again later.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={submitting}
                  onClick={deleteAccount}
                  type="button"
                  variant="danger-soft"
                >
                  Confirm delete account
                </Button>
                <Button
                  disabled={submitting}
                  onClick={() => setConfirmingDelete(false)}
                  type="button"
                  variant="quiet"
                >
                  Keep account
                </Button>
              </div>
            </div>
          ) : (
            <Button
              disabled={submitting}
              onClick={() => setConfirmingDelete(true)}
              type="button"
              variant="quiet"
            >
              Delete pending account
            </Button>
          )}
        </section>
        <div
          aria-hidden="true"
          className="flex w-full max-w-72 flex-col gap-3 rounded-card bg-tapit-surface p-6 shadow-card"
        >
          <div className="flex flex-col items-center gap-4 rounded-card bg-tapit-paper p-6 text-center">
            <span className="grid size-22 place-items-center rounded-full bg-tapit-accent text-xl font-semibold text-white">
              {previewInitials}
            </span>
            <div className="flex flex-col items-center gap-1">
              <p className="text-lg font-semibold text-tapit-ink">{previewName}</p>
              {details.bio.trim() ? (
                <p className="text-sm text-tapit-muted">{details.bio.trim()}</p>
              ) : null}
            </div>
            <Tile className="w-full justify-center text-sm text-tapit-muted" tone="white">
              Add links after this step
            </Tile>
          </div>
        </div>
      </div>
      {slug && safeNextPath?.startsWith("/c/") ? (
        <section className="mx-auto w-full max-w-xl rounded-card bg-tapit-accent-soft p-4">
          <h2 className="font-semibold text-tapit-ink">Your profile is ready</h2>
          <p className="mt-1 text-sm text-tapit-muted">
            Attach this card to your new profile now, or skip and come back later.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => router.replace(safeNextPath)} type="button">
              Attach this card
            </Button>
            <Button onClick={() => router.replace("/app/profile")} type="button" variant="quiet">
              Skip for now
            </Button>
          </div>
        </section>
      ) : null}
      <ConfirmDialog
        cancelLabel="Continue later"
        confirmLabel="Customize your profile"
        description={
          slug
            ? `Your profile was created successfully. Your private profile is ready at /${slug}.`
            : "Your profile was created successfully."
        }
        onCancel={closeProfileCreatedDialog}
        onConfirm={continueToCustomization}
        open={profileCreatedDialogOpen}
        title="Profile created"
      />
    </main>
  );
}
