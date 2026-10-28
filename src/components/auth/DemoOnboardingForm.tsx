"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { completeDemoReOnboarding, useDemoSession, useDemoState } from "@/lib/demo/store";

export function DemoOnboardingForm() {
  const router = useRouter();
  const session = useDemoSession();
  const state = useDemoState();
  const account = session && state.customers.find((customer) => customer.email === session.email);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session || account?.demoOnboardingPending !== true || account.isDemo !== true)
      router.replace("/login");
  }, [account?.demoOnboardingPending, account?.isDemo, router, session]);
  if (!session || account?.demoOnboardingPending !== true || account.isDemo !== true) return null;
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
            router.replace("/app/profile");
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
        <Button type="submit">Complete onboarding</Button>
      </form>
    </AuthShell>
  );
}
