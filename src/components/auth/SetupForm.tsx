"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint } from "@phosphor-icons/react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword } from "@/lib/demo/password";
import { setDemoSession, updateDemoState, useDemoState } from "@/lib/demo/store";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";

export function SetupForm({ token }: { token: string }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return <LiveSetupForm token={token} />;
  return <DemoSetupForm token={token} />;
}

function DemoSetupForm({ token }: { token: string }) {
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
      window.setTimeout(() => router.replace("/app/profile"), 250);
    } catch {
      setError("The setup service is unavailable. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[0.9fr_0.8fr] lg:gap-28">
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
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
              Choose a password
            </h1>
            <p className="mt-3 text-sm leading-6 text-tapit-muted">
              This one-time link gives you access to your Tapit profile workspace.
            </p>
          </div>
          <div className="border-t border-tapit-line pt-8 lg:border-t-0 lg:border-l lg:pl-12">
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

function LiveSetupForm({ token }: { token: string }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const completeSetup = useMutation(api.customers.completeSetup);
  const [tokenHash, setTokenHash] = useState<string>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [setupFailed, setSetupFailed] = useState(false);
  const [awaitingAuthentication, setAwaitingAuthentication] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const invitation = useQuery(api.invitations.status, tokenHash ? { tokenHash, now } : "skip");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (!awaitingAuthentication || !isAuthenticated || tokenHash === undefined) return;
    let cancelled = false;
    void completeSetup({ tokenHash })
      .then(() => {
        if (cancelled) return;
        setComplete(true);
        setSetupFailed(false);
        setAwaitingAuthentication(false);
        window.setTimeout(() => router.replace("/app/profile"), 250);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "The setup service is unavailable. Try again.",
        );
        setAwaitingAuthentication(false);
        setSubmitting(false);
        setSetupFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [awaitingAuthentication, completeSetup, isAuthenticated, router, tokenHash]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (invitation?.valid !== true || tokenHash === undefined || !("email" in invitation)) {
      setError("This setup link is invalid, expired, or already used.");
      return;
    }
    const email = invitation.email;
    if (email === undefined) {
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
      const result = await signIn("password", { flow: "signUp", email, password });
      setPassword("");
      setConfirmation("");
      setSetupFailed(false);
      if (result.signingIn) {
        setAwaitingAuthentication(true);
      } else {
        setAwaitingVerification(true);
        setSubmitting(false);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The setup service is unavailable. Try again.",
      );
      setSubmitting(false);
    }
  }

  async function verifySetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !verificationCode.trim() ||
      tokenHash === undefined ||
      invitation?.valid !== true ||
      !("email" in invitation) ||
      invitation.email === undefined
    ) {
      setError("Enter the verification code from your email.");
      return;
    }
    const email = invitation.email;
    setSubmitting(true);
    setError("");
    try {
      const result = await signIn("password", {
        flow: "email-verification",
        email,
        code: verificationCode.trim(),
      });
      if (!result.signingIn) throw new Error("Email verification did not complete.");
      setVerificationCode("");
      setAwaitingVerification(false);
      setAwaitingAuthentication(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "That code is invalid or expired. Try again.",
      );
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    if (invitation?.valid !== true || !("email" in invitation) || invitation.email === undefined) {
      setError("This setup link is invalid, expired, or already used.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await signIn("password", { flow: "email-verification", email: invitation.email });
    } catch {
      setError("The email service is unavailable. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retrySetup() {
    if (tokenHash === undefined) {
      setError("This setup link is invalid, expired, or already used.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await completeSetup({ tokenHash });
      setComplete(true);
      setSetupFailed(false);
      setTimeout(() => router.replace("/app/profile"), 250);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The setup service is unavailable. Try again.",
      );
      setSubmitting(false);
      setSetupFailed(true);
    }
  }

  const loading = authLoading || tokenHash === undefined || invitation === undefined;
  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[0.9fr_0.8fr] lg:gap-28">
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
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
              Choose a password
            </h1>
            <p className="mt-3 text-sm leading-6 text-tapit-muted">
              This one-time link gives you access to your Tapit profile workspace.
            </p>
          </div>
          <div className="border-t border-tapit-line pt-8 lg:border-t-0 lg:border-l lg:pl-12">
            {loading ? (
              <p className="text-sm text-tapit-muted">Checking your setup link…</p>
            ) : invitation?.valid !== true ? (
              <Notice tone="error">This setup link is invalid, expired, or already used.</Notice>
            ) : awaitingVerification ? (
              <form className="mt-6 grid gap-5" onSubmit={verifySetup}>
                {error ? <Notice tone="error">{error}</Notice> : null}
                <Notice tone="success">Check your email for a verification code.</Notice>
                <Field
                  autoComplete="one-time-code"
                  id="live-setup-verification-code"
                  autoFocus
                  inputMode="text"
                  label="Verification code"
                  onChange={(event) => setVerificationCode(event.target.value)}
                  value={verificationCode}
                />
                <Button disabled={submitting} type="submit">
                  {submitting ? "Verifying code" : "Verify email"}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={resendVerification}
                  type="button"
                  variant="quiet"
                >
                  {submitting ? "Sending code" : "Resend code"}
                </Button>
              </form>
            ) : setupFailed ? (
              <div className="mt-6 grid gap-5">
                {error ? <Notice tone="error">{error}</Notice> : null}
                <p className="text-sm leading-6 text-tapit-muted">
                  Your email is verified, but setup could not finish yet.
                </p>
                <Button disabled={submitting} onClick={retrySetup} type="button">
                  {submitting ? "Saving account" : "Retry setup"}
                </Button>
              </div>
            ) : (
              <form className="mt-6 grid gap-5" onSubmit={submit}>
                <p className="rounded-tapit bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
                  Account email: <strong className="text-tapit-ink">{invitation.email}</strong>
                </p>
                {error ? <Notice tone="error">{error}</Notice> : null}
                {complete ? (
                  <Notice tone="success">Password saved. Taking you to your profile.</Notice>
                ) : null}
                <Field
                  autoComplete="new-password"
                  help="Use at least 8 characters."
                  id="live-setup-password"
                  label="Password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                />
                <Field
                  autoComplete="new-password"
                  id="live-setup-confirmation"
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
