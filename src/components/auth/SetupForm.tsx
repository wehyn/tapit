"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Brand } from "@/components/layout/Brand";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword } from "@/lib/demo/password";
import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
import { clearDemoSession, setDemoSession, updateDemoState, useDemoState } from "@/lib/demo/store";
import { hashSetupToken } from "@/lib/auth/setup-token";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";

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

function SetupFrame({ children, footer }: { children: ReactNode; footer?: string }) {
  return (
    <main className="flex min-h-dvh flex-col gap-12 bg-tapit-paper px-4 py-6 sm:px-12 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <ButtonLink href="/login" variant="quiet">
          Already set up? Sign in
        </ButtonLink>
      </div>
      <div className="flex flex-1 flex-col items-center gap-6">
        <ol aria-label="Setup progress" className="flex flex-wrap justify-center gap-2">
          <li>
            <Chip tone="accent">1 · Password</Chip>
          </li>
          <li>
            <Chip>2 · Profile</Chip>
          </li>
          <li>
            <Chip>3 · Done</Chip>
          </li>
        </ol>
        <div className="flex w-full max-w-md flex-col gap-6 rounded-card bg-tapit-surface p-6 shadow-card">
          {children}
        </div>
        {footer ? <p className="text-center text-xs text-tapit-muted">{footer}</p> : null}
      </div>
    </main>
  );
}

function useInvitationStatus(tokenHash: string | undefined) {
  const [now, setNow] = useState(Date.now);
  const invitation = useQuery(api.invitations.status, tokenHash ? { tokenHash } : "skip");

  useEffect(() => {
    if (invitation?.state !== "valid" || typeof invitation.expiresAt !== "number") return;
    if (invitation.expiresAt <= now) return;
    const remaining = Math.max(0, invitation.expiresAt - Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [invitation?.expiresAt, invitation?.state, now]);

  return invitation?.state === "valid" &&
    typeof invitation.expiresAt === "number" &&
    invitation.expiresAt <= now
    ? { ...invitation, state: "expired" as const }
    : invitation;
}

function HostedDemoSetupForm({ token, nextPath }: { token: string; nextPath?: string }) {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const convex = useConvex();
  const completeSetup = useMutation(api.customers.completeSetup);
  const [tokenHash, setTokenHash] = useState<string>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authFlow, setAuthFlow] = useState<"signUp" | "signIn">("signUp");
  const invitation = useInvitationStatus(tokenHash);

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
    if (
      tokenHash === undefined ||
      invitation?.state !== "valid" ||
      email.trim().length === 0 ||
      (invitation.expiresAt !== null &&
        invitation.expiresAt !== undefined &&
        invitation.expiresAt <= Date.now())
    ) {
      setError("This setup link is invalid, expired, or revoked.");
      return;
    }
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmation) return setError("Passwords do not match.");
    const normalizedEmail = email.trim().toLowerCase();
    setSubmitting(true);
    setError("");
    try {
      const emailMatchesInvitation = await convex.mutation(api.customers.preflightSetupEmail, {
        tokenHash,
        email: normalizedEmail,
      });
      if (!emailMatchesInvitation) {
        setError("The email address does not match this setup invitation.");
        setSubmitting(false);
        return;
      }
      await signIn("password", {
        flow: isAuthenticated ? "signIn" : authFlow,
        email: normalizedEmail,
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
    <SetupFrame>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-tapit-accent-strong uppercase">
          Hosted demo setup
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">Choose a password</h1>
        <p className="text-sm text-tapit-muted">
          This isolated hosted demo uses its password flow for demonstration only.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-tapit-muted">Checking your setup link…</p>
      ) : stateCopy ? (
        <Notice tone="error">{stateCopy}</Notice>
      ) : invitation?.state !== "valid" ? (
        <Notice tone="error">This setup link is not available.</Notice>
      ) : (
        <>
          <p className="rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
            Enter the email address from your invitation.
          </p>
          <form className="grid gap-6" onSubmit={submit}>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field
              autoComplete="email"
              id="hosted-setup-email"
              label="Invitation email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
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
    </SetupFrame>
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
      setDemoSession({ email: account.email, role: "customer" });
      try {
        updateDemoState((current) => ({
          ...current,
          customers: current.customers.map((candidate) =>
            candidate.id === account.id
              ? { ...candidate, status: "active", setupToken: undefined, passwordHash }
              : candidate,
          ),
        }));
      } catch (cause) {
        if (!clearDemoSession()) {
          setError(
            "We couldn't finish setup or clear the saved session. Restore browser storage access, then retry this invitation.",
          );
          setSubmitting(false);
          return;
        }
        throw cause;
      }
      setComplete(true);
      window.setTimeout(() => router.replace(nextPath || "/app/profile"), 250);
    } catch {
      setError("The setup service is unavailable. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <SetupFrame footer="Your profile stays private until you choose to publish it.">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-tapit-accent-strong uppercase">
          Set up your account
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">Choose a password</h1>
        <p className="text-sm text-tapit-muted">
          This one-time link gives you access to your Tapit profile workspace.
        </p>
      </div>
      {account ? (
        <p className="rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
          Account email: <strong className="text-tapit-ink">{account.email}</strong>
        </p>
      ) : null}
      <form className="grid gap-6" onSubmit={submit}>
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
    </SetupFrame>
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
  const invitation = useInvitationStatus(tokenHash);

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
    if (
      !isAuthenticated ||
      tokenHash === undefined ||
      invitation?.state !== "valid" ||
      (invitation.expiresAt !== null &&
        invitation.expiresAt !== undefined &&
        invitation.expiresAt <= Date.now())
    )
      return;
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
  }, [
    acceptInvitation,
    invitation?.expiresAt,
    invitation?.state,
    isAuthenticated,
    nextPath,
    router,
    tokenHash,
  ]);

  async function continueWithGoogle() {
    if (
      invitation?.expiresAt !== null &&
      invitation?.expiresAt !== undefined &&
      invitation.expiresAt <= Date.now()
    ) {
      setError("This invitation has expired.");
      return;
    }
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
    <SetupFrame footer="Your profile stays private until you choose to publish it.">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-tapit-accent-strong uppercase">
          Set up your account
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-tapit-ink">
          Join Tapit with Google
        </h1>
        <p className="text-sm text-tapit-muted">
          Your invitation stays reusable until an administrator revokes it.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-tapit-muted">Checking your invitation…</p>
      ) : stateCopy ? (
        <Notice tone="error">{stateCopy}</Notice>
      ) : invitation?.state !== "valid" ? (
        <Notice tone="error">This invitation is not available.</Notice>
      ) : (
        <>
          <p className="rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
            Continue with the Google account that received this invitation.
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {isAuthenticated ? (
            <p className="text-sm text-tapit-muted">Finishing your invitation…</p>
          ) : (
            <Button disabled={submitting} onClick={continueWithGoogle} type="button">
              <Icon name="google" size={20} weight="bold" />
              {submitting ? "Opening Google" : "Continue with Google"}
            </Button>
          )}
        </>
      )}
    </SetupFrame>
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
