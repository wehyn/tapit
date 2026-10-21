"use client";

import { isLocalDemoMode } from "@/lib/demo/mode";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import { normalizeClaimCode } from "@/lib/auth/claim-code";
import { completeDemoCardClaim, verifyDemoCardClaim, useDemoSession } from "@/lib/demo/store";
import { api } from "../../../convex/_generated/api";

const RETURN_PATH = (token: string) => `/c/${encodeURIComponent(token)}`;

export function UnpublishedCardClaim({ cardToken }: { cardToken: string }) {
  return !isLocalDemoMode() ? (
    <LiveUnpublishedCardClaim cardToken={cardToken} />
  ) : (
    <DemoUnpublishedCardClaim cardToken={cardToken} />
  );
}

type ClaimScreenProps = {
  challenge?: string;
  code: string;
  error: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  signInHref?: string;
  submitting: boolean;
};

function ClaimPageShell({
  busy = false,
  children,
  signInHref,
}: {
  busy?: boolean;
  children: ReactNode;
  signInHref?: string;
}) {
  return (
    <main
      aria-busy={busy || undefined}
      aria-live={busy ? "polite" : undefined}
      className="flex min-h-[100dvh] flex-col bg-tapit-paper"
    >
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-4">
        <Brand />
        {signInHref ? (
          <Link
            aria-label="Sign in to continue"
            className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-tapit-muted transition-colors hover:bg-tapit-soft-surface hover:text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus"
            href={signInHref}
          >
            Sign in
          </Link>
        ) : null}
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-6 sm:py-8">
        <div
          aria-hidden="true"
          className="mx-auto flex aspect-[1.586] w-60 flex-col justify-between rounded-card bg-tapit-ink p-6 text-white shadow-card"
        >
          <Icon className="self-end text-tapit-warm" name="contactless" size={24} />
          <p className="text-sm font-semibold">Your Tapit card</p>
        </div>
        {children}
      </div>
    </main>
  );
}

function ClaimScreen({
  challenge,
  code,
  error,
  onChange,
  onSubmit,
  signInHref,
  submitting,
}: ClaimScreenProps) {
  return (
    <ClaimPageShell signInHref={signInHref}>
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="tapit-eyebrow">New card</p>
        <h1 className="tapit-display text-xl font-semibold leading-tight tracking-tight text-tapit-ink">
          This card is ready to set up
        </h1>
        <p className="text-sm leading-5 text-tapit-muted">
          Enter the claim code that came with it. The card will open your profile from now on.
        </p>
      </div>
      <section className="grid gap-4 rounded-card bg-tapit-surface p-6 shadow-card">
        <form className="grid gap-4" onSubmit={onSubmit}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {challenge ? (
            <Notice tone="success">Code verified. Continue to your profile workspace.</Notice>
          ) : null}
          <div className="[&_input]:text-center [&_input]:font-mono [&_input]:font-semibold [&_input]:tracking-widest">
            <Field
              autoComplete="one-time-code"
              autoFocus
              id="card-claim-code"
              inputMode="text"
              label="Claim code"
              maxLength={8}
              onChange={(event) => onChange(event.target.value.toUpperCase())}
              pattern="[A-Z0-9]{8}"
              value={code}
            />
          </div>
          <Button
            className="text-base"
            disabled={submitting || challenge !== undefined}
            type="submit"
          >
            {submitting ? "Checking code" : "Claim this card"}
          </Button>
        </form>
      </section>
    </ClaimPageShell>
  );
}

function DemoUnpublishedCardClaim({ cardToken }: { cardToken: string }) {
  const router = useRouter();
  const session = useDemoSession();
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    const stored = sessionStorage.getItem(`tapit:claim:${cardToken}`);
    if (!stored) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      try {
        completeDemoCardClaim(cardToken, stored, session.email);
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        router.replace("/app/profile");
      } catch {
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        if (!cancelled) {
          setError("This card claim could not be completed for this account.");
          setSubmitting(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cardToken, router, session]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeClaimCode(code);
    if (normalized === null) {
      setError("Enter the 8-character code supplied with your card.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const nextChallenge = verifyDemoCardClaim(cardToken, normalized);
      sessionStorage.setItem(`tapit:claim:${cardToken}`, nextChallenge);
      setChallenge(nextChallenge);
      if (session) {
        completeDemoCardClaim(cardToken, nextChallenge, session.email);
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        router.replace("/app/profile");
      } else {
        router.replace(`/login?next=${encodeURIComponent(RETURN_PATH(cardToken))}`);
      }
    } catch {
      setError(
        "That code is invalid, expired, used, or unavailable. Check the code and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <ClaimScreen
      challenge={challenge}
      code={code}
      error={error}
      onChange={setCode}
      onSubmit={submit}
      signInHref={session ? undefined : `/login?next=${encodeURIComponent(RETURN_PATH(cardToken))}`}
      submitting={submitting}
    />
  );
}

function LiveUnpublishedCardClaim({ cardToken }: { cardToken: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const verifyCode = useMutation(api.cardClaims.verifyCode);
  const completeClaim = useMutation(api.cardClaims.complete);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string>();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const stored = sessionStorage.getItem(`tapit:claim:${cardToken}`);
    if (!stored) return;
    void completeClaim({ challenge: stored })
      .then(() => {
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        router.replace("/app/profile");
      })
      .catch(() => {
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        setError("This card claim could not be completed for this account.");
        setSubmitting(false);
      });
  }, [cardToken, completeClaim, isAuthenticated, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeClaimCode(code);
    if (normalized === null) {
      setError("Enter the 8-character code supplied with your card.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await verifyCode({ token: cardToken, code: normalized });
      if (!result.ok) {
        setError(
          "That code is invalid, expired, used, or unavailable. Check the code and try again.",
        );
        setSubmitting(false);
        return;
      }
      sessionStorage.setItem(`tapit:claim:${cardToken}`, result.challenge);
      setChallenge(result.challenge);
      if (isAuthenticated) {
        await completeClaim({ challenge: result.challenge });
        sessionStorage.removeItem(`tapit:claim:${cardToken}`);
        router.replace("/app/profile");
      } else {
        router.replace(`/login?next=${encodeURIComponent(RETURN_PATH(cardToken))}`);
      }
    } catch {
      setError(
        "That code is invalid, expired, used, or unavailable. Check the code and try again.",
      );
      setSubmitting(false);
    }
  }

  if (authLoading) return <ClaimLoading />;
  if (!isAuthenticated) {
    return (
      <ClaimPageShell signInHref={`/login?next=${encodeURIComponent(RETURN_PATH(cardToken))}`}>
        <section className="flex flex-col items-center gap-4 text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            New card
          </p>
          <h1 className="tapit-display text-xl font-semibold leading-tight tracking-tight text-tapit-ink">
            This card is ready to set up
          </h1>
          <p className="text-sm leading-6 text-tapit-muted">
            Sign in to your Tapit account first. Then enter the private claim code supplied with
            your card to activate it and confirm ownership.
          </p>
        </section>
      </ClaimPageShell>
    );
  }
  return (
    <ClaimScreen
      challenge={challenge}
      code={code}
      error={error}
      onChange={setCode}
      onSubmit={submit}
      submitting={submitting}
    />
  );
}

function ClaimLoading() {
  return (
    <ClaimPageShell busy>
      <p className="text-center text-sm text-tapit-muted" role="status">
        Checking your sign-in status...
      </p>
    </ClaimPageShell>
  );
}
