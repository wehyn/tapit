"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { sanitizeReturnPath } from "@/lib/auth/return-path";

export function GoogleLoginForm({
  nextPath,
  oauthError,
  reason,
}: {
  nextPath?: string;
  oauthError?: string;
  reason?: "invitation-required" | "account-inactive";
}) {
  const { signIn } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(oauthError ? "Google sign-in could not be completed. Try again." : "");
  const safeNextPath = sanitizeReturnPath(nextPath);

  async function continueWithGoogle() {
    setPending(true);
    setError("");
    try {
      await signIn("google", { redirectTo: safeNextPath ?? "/app/profile" });
    } catch {
      setError("Google sign-in could not be completed. Try again.");
      setPending(false);
    }
  }

  return (
    <AuthShell mode="signin" variant="google" onModeChange={() => undefined}>
      <div className="grid gap-5">
        {reason === "invitation-required" ? (
          <Notice tone="error">Use your invitation link to continue with Google.</Notice>
        ) : reason === "account-inactive" ? (
          <Notice tone="error">Your account is inactive. Contact support for access.</Notice>
        ) : error ? (
          <Notice tone="error">{error}</Notice>
        ) : null}
        <Button
          aria-busy={pending}
          disabled={pending}
          onClick={() => void continueWithGoogle()}
          type="button"
        >
          {pending ? "Connecting to Google" : "Continue with Google"}
        </Button>
        <Button onClick={() => { setPending(false); setError(""); }} type="button" variant="quiet">
          Cancel
        </Button>
      </div>
    </AuthShell>
  );
}
