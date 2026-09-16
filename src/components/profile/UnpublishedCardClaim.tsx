"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { normalizeClaimCode } from "@/lib/auth/claim-code";
import { completeDemoCardClaim, verifyDemoCardClaim, useDemoSession } from "@/lib/demo/store";
import { api } from "../../../convex/_generated/api";

const RETURN_PATH = (token: string) => `/c/${encodeURIComponent(token)}`;

export function UnpublishedCardClaim({ cardToken }: { cardToken: string }) {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? (
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
  submitting: boolean;
};

function ClaimScreen({ challenge, code, error, onChange, onSubmit, submitting }: ClaimScreenProps) {
  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-10">
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col justify-center border-t border-b border-tapit-line py-12">
        <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
          Card setup
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
          Are you the owner of this card?
        </h1>
        <p className="mt-4 text-sm leading-6 text-tapit-muted">
          This profile is not published yet. Enter the private claim code to continue.
        </p>
        <form className="mt-8 grid gap-5" onSubmit={onSubmit}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {challenge ? (
            <Notice tone="success">Code verified. Continue to your profile workspace.</Notice>
          ) : null}
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
          <Button disabled={submitting || challenge !== undefined} type="submit">
            {submitting ? "Checking code" : "Claim this card"}
          </Button>
        </form>
      </section>
    </main>
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
      <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-10">
        <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col justify-center border-t border-b border-tapit-line py-12">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Card setup
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            Are you the owner of this card?
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-tapit-muted">
            Sign in to your Tapit account first. Then enter the private code supplied with your card
            to confirm ownership.
          </p>
          <div className="mt-8">
            <ButtonLink href={`/login?next=${encodeURIComponent(RETURN_PATH(cardToken))}`}>
              Sign in to continue
            </ButtonLink>
          </div>
        </section>
      </main>
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
    <main
      aria-busy="true"
      aria-live="polite"
      className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-10"
    >
      <section className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-xl flex-col justify-center border-t border-b border-tapit-line py-12">
        <p className="text-sm text-tapit-muted" role="status">
          Checking your sign-in status...
        </p>
      </section>
    </main>
  );
}
