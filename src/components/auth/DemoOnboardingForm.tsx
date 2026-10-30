"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { completeDemoReOnboarding, useDemoSession, useDemoState } from "@/lib/demo/store";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

export function DemoOnboardingForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const session = useDemoSession();
  const state = useDemoState();
  const account = session && state.customers.find((customer) => customer.email === session.email);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const safeNextPath = sanitizeReturnPath(nextPath);
  useEffect(() => {
    if (
      !session ||
      !account ||
      (!completed && account?.demoOnboardingPending !== true) ||
      account.isDemo !== true
    )
      router.replace("/login");
  }, [account, completed, router, session]);
  if (
    !session ||
    !account ||
    (account?.demoOnboardingPending !== true && !completed) ||
    account.isDemo !== true
  )
    return null;
  return (
    <AuthShell
      demoHint
      mode="signup"
      variant="demo"
      modeChangeDisabled
      onModeChange={() => {}}
      supportUrl={state.supportUrl}
    >
      <form
        className="grid gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            completeDemoReOnboarding({ name, slug });
            if (safeNextPath?.startsWith("/c/")) setCompleted(true);
            else router.replace(safeNextPath || "/app/profile");
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Onboarding could not be completed.");
          }
        }}
      >
        <p className="text-sm text-muted-foreground">Complete your profile for {session.email}.</p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          id="demo-onboarding-name"
          label="Display name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          id="demo-onboarding-slug"
          label="Profile address"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
        />
        {completed ? (
          <>
            <p className="text-sm text-muted-foreground">
              Your profile is ready. You can set up the card now or return later.
            </p>
            <Button onClick={() => router.replace(safeNextPath!)} type="button">
              Set up this card
            </Button>
            <Button onClick={() => router.replace("/app/profile")} type="button" variant="quiet">
              Skip for now
            </Button>
          </>
        ) : (
          <Button type="submit">Complete onboarding</Button>
        )}
      </form>
    </AuthShell>
  );
}
