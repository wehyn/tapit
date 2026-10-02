"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "@phosphor-icons/react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword } from "@/lib/demo/password";
import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
import { setDemoSession, updateDemoState, useDemoState } from "@/lib/demo/store";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

function setupReturnPath(value: string | null): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return undefined;
  try {
    const parsed = new URL(value, "https://tapit.invalid");
    return parsed.origin === "https://tapit.invalid" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function SetupForm({ token }: { token: string }) {
  const nextPath =
    typeof window === "undefined"
      ? undefined
      : setupReturnPath(new URLSearchParams(window.location.search).get("next"));
  return isLocalDemoMode() ? (
    <DemoSetupForm token={token} nextPath={nextPath} />
  ) : isHostedDemoMode() ? (
    <HostedDemoSetupForm token={token} nextPath={nextPath} />
  ) : (
    <LiveSetupForm token={token} nextPath={nextPath} />
  );
}

function HostedDemoSetupForm({ token, nextPath }: { token: string; nextPath?: string }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const completeSetup = useMutation(api.customers.completeSetup);
  const [tokenHash, setTokenHash] = useState<string>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authFlow, setAuthFlow] = useState<"signUp" | "signIn">("signUp");
  const invitation = useQuery(api.invitations.status, tokenHash ? { tokenHash } : "skip");

  useEffect(() => {
    let cancelled = false;
    void hashSetupToken(token).then((hash) => {
      if (!cancelled) setTokenHash(hash);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (tokenHash === undefined || invitation?.state !== "valid" || invitation.email === null) {
      setError("This setup link is invalid, expired, or revoked.");
      return;
    }
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    setSubmitting(true);
    setError("");
    try {
      await signIn("password", {
        flow: isAuthenticated ? "signIn" : authFlow,
        email: invitation.email,
        password,
      });
      setAuthFlow("signIn");
      await completeSetup({ tokenHash });
      router.replace(nextPath || "/app/profile");
    } catch (cause) {
      if (cause instanceof Error && /already exists|already registered/i.test(cause.message)) {
        setAuthFlow("signIn");
      }
      setError(hostedInvitationErrorCopy(cause));
      setSubmitting(false);
    }
  }

  const loading = tokenHash === undefined || invitation === undefined;
  const stateCopy =
    invitation?.state === "missing"
      ? "This setup link could not be found."
      : invitation?.state === "revoked"
        ? "This setup link has been revoked."
        : invitation?.state === "expired"
          ? "This setup link has expired."
          : undefined;

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-8 py-10 sm:py-14">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
              Hosted demo setup
            </p>
            <h1 className="tapit-display mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
              Choose a password
            </h1>
            <p className="mt-3 text-sm leading-6 text-tapit-muted">
              This isolated hosted demo uses its password flow for demonstration only.
            </p>
          </div>
          <div className="grid gap-5 rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_16px_36px_rgba(16,33,28,0.07)] sm:p-8">
            {loading ? (
              <p className="text-sm text-tapit-muted">Checking your setup link…</p>
            ) : stateCopy ? (
              <Notice tone="error">{stateCopy}</Notice>
            ) : invitation?.state !== "valid" || invitation.email === null ? (
              <Notice tone="error">This setup link is not available.</Notice>
            ) : (
              <>
                <p className="rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
                  Invitation for <strong className="text-tapit-ink">{invitation.email}</strong>
                  {invitation.profileName ? (
                    <>
                      {" "}
                      to <strong className="text-tapit-ink">{invitation.profileName}</strong>
                    </>
                  ) : null}
                </p>
                <form className="grid gap-5" onSubmit={submit}>
                  {error ? <Notice tone="error">{error}</Notice> : null}
                  <Field
                    autoComplete="new-password"
                    id="hosted-setup-password"
                    label="Password"
                    minLength={8}
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    value={password}
                  />
                  <Field
                    autoComplete="new-password"
                    id="hosted-setup-confirmation"
                    label="Confirm password"
                    minLength={8}
                    onChange={(event) => setConfirmation(event.target.value)}
                    type="password"
                    value={confirmation}
                  />
                  <Button disabled={submitting} type="submit">
                    {submitting ? "Saving password" : "Set password"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function hostedInvitationErrorCopy(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("already exists") || message.includes("already registered"))
    return "An account already exists for this invitation. Use its password and try again.";
  if (message.includes("does not match"))
    return "This password account does not match the invitation email.";
  if (message.includes("already linked") || message.includes("already used"))
    return "This setup link is already connected to another account.";
  if (message.includes("invalid") || message.includes("expired"))
    return "This setup link is invalid or expired.";
  return "Setup could not be completed. Check the invitation details and try again.";
}

function DemoSetupForm({ token, nextPath }: { token: string; nextPath?: string }) {
  const router = useRouter();
  const state = useDemoState();
  const account = state.customers.find((candidate) => candidate.setupToken === token);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (account === undefined) {
      setError("This setup link is invalid, expired, or already used.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const passwordHash = await hashDemoPassword(password);
      updateDemoState((current) => ({
        ...current,
        customers: current.customers.map((candidate) =>
          candidate.id === account.id
            ? { ...candidate, status: "active", setupToken: undefined, passwordHash }
            : candidate,
        ),
      }));
      setDemoSession({ email: account.email, role: "customer" });
      setComplete(true);
      window.setTimeout(() => router.replace(nextPath || "/app/profile"), 250);
    } catch {
      setError("The setup service is unavailable. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-10 py-10 sm:gap-12 sm:py-14 lg:grid-cols-[0.9fr_0.8fr] lg:gap-24">
          <div className="max-w-lg">
            <Fingerprint
              aria-hidden="true"
              className="text-tapit-accent"
              size={48}
              weight="light"
            />
            <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
              Set up your account
            </p>
            <h1 className="tapit-display mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
              Choose a password
            </h1>
            <p className="mt-3 text-sm leading-6 text-tapit-muted">
              This one-time link gives you access to your Tapit profile workspace.
            </p>
          </div>
          <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_16px_36px_rgba(16,33,28,0.07)] sm:p-8">
            {account ? (
              <p className="mt-6 rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
                Account email: <strong className="text-tapit-ink">{account.email}</strong>
              </p>
            ) : null}
            <form className="mt-6 grid gap-5" onSubmit={submit}>
              {error ? <Notice tone="error">{error}</Notice> : null}
              {complete ? (
                <Notice tone="success">Password saved. Taking you to your profile.</Notice>
              ) : null}
              <Field
                autoComplete="new-password"
                help="Use at least 8 characters."
                id="setup-password"
                label="Password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
              <Field
                autoComplete="new-password"
                id="setup-confirmation"
                label="Confirm password"
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                value={confirmation}
              />
              <Button disabled={complete || submitting} type="submit">
                {submitting ? "Saving password" : "Set password"}
              </Button>
            </form>
          </div>
        </section>
        <footer className="border-t border-tapit-line pt-4 text-xs text-tapit-muted">
          Your profile stays private until you choose to publish it.
        </footer>
      </div>
    </main>
  );
}

function LiveSetupForm({ token, nextPath }: { token: string; nextPath?: string }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const acceptInvitation = useMutation(api.customers.acceptInvitation);
  const [tokenHash, setTokenHash] = useState<string>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const invitation = useQuery(api.invitations.status, tokenHash ? { tokenHash } : "skip");

  useEffect(() => {
    let cancelled = false;
    void hashSetupToken(token).then((hash) => {
      if (!cancelled) setTokenHash(hash);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!isAuthenticated || tokenHash === undefined || invitation?.state !== "valid") return;
    let cancelled = false;
    void acceptInvitation({ tokenHash })
      .then(() => {
        if (cancelled) return;
        window.setTimeout(() => router.replace(nextPath || "/app/profile"), 250);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(invitationErrorCopy(cause));
        setSubmitting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [acceptInvitation, invitation?.state, isAuthenticated, nextPath, router, tokenHash]);

  async function continueWithGoogle() {
    setSubmitting(true);
    setError("");
    try {
      await signIn("google", { redirectTo: `/setup/${token}` });
    } catch {
      setError("Google sign-in could not be completed. Try again.");
      setSubmitting(false);
    }
  }

  const loading = authLoading || tokenHash === undefined || invitation === undefined;
  const state = invitation?.state;
  const stateCopy =
    state === "missing"
      ? "This invitation could not be found."
      : state === "revoked"
        ? "This invitation has been revoked."
        : state === "expired"
          ? "This invitation has expired."
          : undefined;

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-10 py-10 sm:gap-12 sm:py-14 lg:grid-cols-[0.9fr_0.8fr] lg:gap-24">
          <div className="max-w-lg">
            <Fingerprint
              aria-hidden="true"
              className="text-tapit-accent"
              size={48}
              weight="light"
            />
            <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
              Set up your account
            </p>
            <h1 className="tapit-display mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
              Join Tapit with Google
            </h1>
            <p className="mt-3 text-sm leading-6 text-tapit-muted">
              Your invitation stays reusable until an administrator revokes it.
            </p>
          </div>
          <div className="rounded-tapit border border-tapit-line bg-tapit-surface p-5 shadow-[0_16px_36px_rgba(16,33,28,0.07)] sm:p-8">
            {loading ? (
              <p className="text-sm text-tapit-muted">Checking your invitation…</p>
            ) : stateCopy ? (
              <Notice tone="error">{stateCopy}</Notice>
            ) : invitation?.state !== "valid" ? (
              <Notice tone="error">This invitation is not available.</Notice>
            ) : (
              <div className="mt-6 grid gap-5">
                <p className="rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
                  Invitation for <strong className="text-tapit-ink">{invitation.email}</strong>
                  {invitation.profileName ? (
                    <>
                      {" "}
                      to <strong className="text-tapit-ink">{invitation.profileName}</strong>
                    </>
                  ) : null}
                </p>
                {error ? <Notice tone="error">{error}</Notice> : null}
                {isAuthenticated ? (
                  <p className="text-sm text-tapit-muted">Finishing your invitation…</p>
                ) : (
                  <Button disabled={submitting} onClick={continueWithGoogle} type="button">
                    {submitting ? "Opening Google" : "Continue with Google"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
        <footer className="border-t border-tapit-line pt-4 text-xs text-tapit-muted">
          Your profile stays private until you choose to publish it.
        </footer>
      </div>
    </main>
  );
}

function invitationErrorCopy(cause: unknown): string {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  if (message.includes("does not match"))
    return "This Google account does not match the invitation email.";
  if (message.includes("linked to another") || message.includes("already linked"))
    return "This invitation is already linked to another Google account.";
  if (
    message.includes("invitation") &&
    (message.includes("invalid") || message.includes("expired"))
  )
    return "This invitation is invalid or expired.";
  if (message.includes("link context")) return "Open the invitation link again to finish setup.";
  return "This invitation could not be accepted. Try again.";
}
