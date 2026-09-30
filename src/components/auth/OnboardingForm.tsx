"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";

export function OnboardingForm() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const access = useQuery(api.admin.currentAccess, isAuthenticated ? {} : "skip");
  const completeOnboarding = useMutation(api.customers.completeSelfServiceOnboarding);
  const deletePendingAccount = useMutation(api.customers.deletePendingAccount);
  const [name, setName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [slug, setSlug] = useState<string>();
  const initializedName = useRef(false);
  const completingOnboarding = useRef(false);

  useEffect(() => {
    if (access !== undefined && !initializedName.current) {
      initializedName.current = true;
      setName(access.onboardingName ?? "");
    }
  }, [access]);

  useEffect(() => {
    if (access?.accountStatus === "active" && !completingOnboarding.current)
      router.replace("/app/profile");
  }, [access?.accountStatus, router]);

  async function complete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a display name to continue.");
      return;
    }
    setSubmitting(true);
    setError("");
    completingOnboarding.current = true;
    try {
      const result = await completeOnboarding({ name: trimmedName });
      setSlug(result.slug);
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
      <main className="mx-auto max-w-2xl px-5 py-16 text-sm text-tapit-muted">
        Loading your account…
      </main>
    );
  }

  if (access.accountStatus === "invited") {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="error">Use your invitation link to finish setting up this account.</Notice>
      </main>
    );
  }

  if (access.accountStatus !== "pending" && slug === undefined) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="error">This account cannot be onboarded in its current state.</Notice>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-10 sm:px-10">
      <section className="mx-auto grid w-full max-w-2xl gap-8 rounded-[1.75rem] border border-tapit-line bg-tapit-surface p-5 shadow-[0_18px_42px_rgba(21,25,24,0.05)] sm:p-9">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Finish your profile
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-tapit-ink">
            Choose your display name
          </h1>
          <p className="mt-4 text-sm leading-6 text-tapit-muted">
            Your profile starts as a private draft. You can publish it when you are ready.
          </p>
        </div>
        <form className="grid gap-5" onSubmit={complete}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {slug ? <Notice tone="success">Your private profile is ready at /{slug}.</Notice> : null}
          <Field
            id="onboarding-name"
            label="Display name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <Button disabled={submitting || slug !== undefined} type="submit">
            {submitting
              ? "Creating your profile"
              : slug
                ? "Profile created"
                : "Complete onboarding"}
          </Button>
          {slug ? (
            <Button onClick={() => router.replace("/app/profile")} type="button">
              Continue to your profile
            </Button>
          ) : null}
        </form>
        {slug !== undefined ? null : confirmingDelete ? (
          <div className="grid gap-3 rounded-tapit border border-tapit-line p-4">
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
    </main>
  );
}
