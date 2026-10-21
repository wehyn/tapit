"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

type OnboardingProfileDetails = {
  name: string;
  bio: string;
  website: string;
};

export function OnboardingForm() {
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

  const closeProfileCreatedDialog = useCallback(() => {
    setProfileCreatedDialogOpen(false);
  }, []);
  const continueToCustomization = useCallback(() => {
    router.replace("/app/profile");
  }, [router]);

  useEffect(() => {
    if (access !== undefined && !initializedName.current) {
      initializedName.current = true;
      setDetails((current) => ({ ...current, name: access.onboardingName ?? "" }));
    }
  }, [access]);

  useEffect(() => {
    if (access?.accountStatus === "active" && !completingOnboarding.current)
      router.replace("/app/profile");
  }, [access?.accountStatus, router]);

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
      <main className="mx-auto grid min-h-[100dvh] max-w-2xl place-items-center px-4 py-10 text-sm text-tapit-muted">
        Loading your account…
      </main>
    );
  }

  if (access.accountStatus === "invited") {
    return (
      <main className="mx-auto grid min-h-[100dvh] max-w-2xl place-items-center px-4 py-10">
        <Notice tone="error">Use your invitation link to finish setting up this account.</Notice>
      </main>
    );
  }

  if (access.accountStatus !== "pending" && slug === undefined) {
    return (
      <main className="mx-auto grid min-h-[100dvh] max-w-2xl place-items-center px-4 py-10">
        <Notice tone="error">This account cannot be onboarded in its current state.</Notice>
      </main>
    );
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[radial-gradient(ellipse_at_86%_0%,#e8edf9_0%,transparent_42%),#f4f6fa] px-4 py-8 sm:px-10 sm:py-10">
      <section className="mx-auto grid w-full max-w-2xl gap-8 rounded-card border border-tapit-line bg-tapit-surface p-5 shadow-[0_16px_44px_rgba(27,36,51,0.06)] sm:p-9">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Finish your profile
          </p>
          <h1 className="tapit-display mt-3 text-2xl font-semibold tracking-[-0.055em] text-tapit-ink">
            Choose your display name
          </h1>
          <p className="mt-4 text-sm leading-6 text-tapit-muted">
            Display name is required. Bio and website are optional. Your profile starts as a private
            draft that you can publish when you are ready.
          </p>
        </div>
        <form className="grid gap-5" onSubmit={complete}>
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
            onChange={(event) => setDetails((current) => ({ ...current, bio: event.target.value }))}
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
          <div className="grid gap-3 rounded-card border border-tapit-line p-4">
            <p className="text-sm text-tapit-muted">
              Delete this pending account? Your Google identity will remain available to start again
              later.
            </p>
            <div className="flex gap-3">
              <Button disabled={submitting} onClick={deleteAccount} type="button" variant="quiet">
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
