"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { isHostedDemoMode, isLocalDemoMode } from "@/lib/demo/mode";
import {
  useDemoSession,
  useDemoState,
  verifyDemoCardClaim,
  completeDemoCardClaim,
  requestDemoCardCorrection,
} from "@/lib/demo/store";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { normalizeClaimCode } from "@/lib/auth/claim-code";
import { api } from "../../../convex/_generated/api";

const subscribeToNothing = () => () => {};

function browserCardReturnHref(cardToken: string, fallback?: string) {
  const path = `/c/${encodeURIComponent(cardToken)}`;
  return window.location.pathname === path
    ? `${window.location.pathname}${window.location.search}`
    : fallback;
}

export function CardSetupFlow({
  cardToken,
  returnHref,
  correction = false,
  codeFree = false,
}: {
  cardToken: string;
  returnHref?: string;
  correction?: boolean;
  codeFree?: boolean;
}) {
  const browserReturnHref = useSyncExternalStore(
    subscribeToNothing,
    () => browserCardReturnHref(cardToken, returnHref),
    () => returnHref,
  );
  if (codeFree) return <CodeFreeCardContinuation />;
  return isLocalDemoMode() ? (
    <DemoCardSetupFlow
      cardToken={cardToken}
      returnHref={browserReturnHref}
      correction={correction}
    />
  ) : (
    <LiveCardSetupFlow
      cardToken={cardToken}
      returnHref={browserReturnHref}
      correction={correction}
    />
  );
}

function CodeFreeCardContinuation() {
  const router = useRouter();
  return (
    <Shell>
      <h1 className="tapit-display text-2xl font-semibold text-tapit-ink">
        Finish setting up your card
      </h1>
      <Notice>
        This card is connected to your private profile. Review and publish your profile from your
        workspace to make it public.
      </Notice>
      <Button onClick={() => router.replace("/app/profile")} type="button">
        Review your profile
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-tapit-paper">
      <header className="mx-auto w-full max-w-lg px-4 py-4">
        <Brand />
      </header>
      <section className="mx-auto my-auto grid w-full max-w-lg gap-4 px-4 py-8">{children}</section>
    </main>
  );
}

function CardSetupContent({
  returnHref,
  profile,
  loading,
  onVerify,
  onConfirm,
  onCorrection,
  onSkip,
  correction,
  demoCode,
}: {
  returnHref: string;
  profile?: {
    name?: string;
    slug?: string;
    bio?: string;
    imageUrl?: string;
    links?: { label: string; destination: string; enabled?: boolean }[];
    published?: boolean;
  };
  loading: boolean;
  onVerify: (code: string) => Promise<void>;
  onConfirm: () => Promise<void>;
  onCorrection: () => Promise<void>;
  onSkip: () => void;
  correction: boolean;
  demoCode?: string;
}) {
  const [code, setCode] = useState(demoCode ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [correctionSent, setCorrectionSent] = useState(false);
  async function act(operation: () => Promise<void>, onFailure?: () => void) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The card could not be set up.");
      onFailure?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className="grid gap-2 text-center">
        <p className="tapit-eyebrow">Card setup</p>
        <h1 className="tapit-display text-2xl font-semibold text-tapit-ink">
          Set up your Tapit card
        </h1>
        <p className="text-sm text-tapit-muted">
          Sign in, review your profile, and confirm before this card is connected.
        </p>
      </div>
      {!profile ? (
        <Notice>
          {loading
            ? "Loading your profile…"
            : "Create your profile first. Your card stays private until you confirm setup."}
        </Notice>
      ) : (
        <div className="grid gap-3 rounded-card bg-tapit-surface p-4 shadow-card">
          <p className="text-sm font-semibold text-tapit-ink">
            Profile preview · {profile.published ? "Published" : "Private draft"}
          </p>
          <div className="flex items-center gap-3">
            {profile.imageUrl ? (
              <img alt="" className="size-14 rounded-full object-cover" src={profile.imageUrl} />
            ) : null}
            <div>
              <p className="font-semibold text-tapit-ink">{profile.name || "Your name"}</p>
              <p className="text-sm text-tapit-muted">/{profile.slug || "your-slug"}</p>
            </div>
          </div>
          {profile.bio ? <p className="text-sm text-tapit-muted">{profile.bio}</p> : null}
          <ul className="grid gap-1 text-sm text-tapit-muted">
            {profile.links
              ?.filter((link) => link.enabled !== false)
              .map((link) => (
                <li key={`${link.label}:${link.destination}`}>
                  {link.label} · {link.destination}
                </li>
              ))}
          </ul>
        </div>
      )}
      {!profile ? null : (
        <form
          className="grid gap-4 rounded-card bg-tapit-surface p-4 shadow-card"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await onVerify(code);
              setVerified(true);
            });
          }}
        >
          {error ? <Notice tone="error">{error}</Notice> : null}
          {verified ? (
            <Notice tone="success">
              Code verified. Review the profile above, then confirm the attachment.
            </Notice>
          ) : (
            <Field
              id="setup-code"
              label="Card code"
              autoComplete="one-time-code"
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              value={code}
            />
          )}
          {correctionSent ? (
            <Notice>
              Your card is paused while its assignment is corrected. Scan again after the
              correction.
            </Notice>
          ) : null}
          {verified && !correctionSent ? (
            <Button
              disabled={busy}
              onClick={() => void act(onConfirm, () => setVerified(false))}
              type="button"
            >
              {busy ? "Setting up card…" : "Confirm and attach card"}
            </Button>
          ) : !verified ? (
            <Button disabled={busy || loading} type="submit">
              {busy ? "Checking code…" : "Verify code"}
            </Button>
          ) : null}
          {verified && correction && !correctionSent ? (
            <Button
              disabled={busy}
              onClick={() =>
                void act(
                  async () => {
                    await onCorrection();
                    setCorrectionSent(true);
                  },
                  () => setVerified(false),
                )
              }
              type="button"
              variant="secondary"
            >
              Request assignment correction
            </Button>
          ) : null}
          <Button disabled={busy} onClick={onSkip} type="button" variant="quiet">
            Skip for now
          </Button>
        </form>
      )}
      <Link className="text-center text-sm font-semibold text-tapit-muted" href={returnHref}>
        Return to card
      </Link>
    </Shell>
  );
}

function DemoCardSetupFlow({
  cardToken,
  returnHref,
  correction,
}: {
  cardToken: string;
  returnHref?: string;
  correction: boolean;
}) {
  const router = useRouter();
  const session = useDemoSession();
  const state = useDemoState();
  const profile = session
    ? state.profiles.find(
        (item) =>
          item.ownerId === state.customers.find((customer) => customer.email === session.email)?.id,
      )
    : undefined;
  const [challenge, setChallenge] = useState<string>();
  const safeReturn = sanitizeReturnPath(returnHref) ?? `/c/${encodeURIComponent(cardToken)}`;
  if (!session)
    return (
      <Shell>
        <h1 className="tapit-display text-2xl font-semibold">Sign in to set up your card</h1>
        <p className="text-sm text-tapit-muted">
          Your card code and profile stay private until you confirm.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
          href={`/login?mode=signup&next=${encodeURIComponent(safeReturn)}`}
        >
          Continue with Google
        </Link>
        <Link
          className="text-center text-sm text-tapit-muted"
          href={`/login?next=${encodeURIComponent(safeReturn)}`}
        >
          I already have an account
        </Link>
      </Shell>
    );
  return (
    <CardSetupContent
      returnHref={safeReturn}
      loading={!profile}
      profile={
        profile
          ? {
              name: profile.draft.name,
              slug: profile.draft.slug,
              bio: profile.draft.bio,
              imageUrl: profile.draft.imageUrl,
              links: profile.draft.links,
              published: profile.status === "published",
            }
          : undefined
      }
      correction={correction}
      demoCode={state.cards.find((card) => card.token === cardToken)?.claimCode}
      onVerify={async (value) => {
        setChallenge(
          verifyDemoCardClaim(cardToken, normalizeClaimCode(value) ?? "", session.email),
        );
      }}
      onConfirm={async () => {
        if (!challenge || !profile) throw new Error("Verify the code first.");
        completeDemoCardClaim(cardToken, challenge, session.email);
        router.replace("/app/profile");
      }}
      onCorrection={async () => {
        if (!challenge) throw new Error("Verify the code first.");
        requestDemoCardCorrection(cardToken, challenge, session.email);
      }}
      onSkip={() => router.replace("/app/profile")}
    />
  );
}

function LiveCardSetupFlow({
  cardToken,
  returnHref,
  correction,
}: {
  cardToken: string;
  returnHref?: string;
  correction: boolean;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useQuery(api.profiles.mine, isAuthenticated ? {} : "skip");
  const verify = useMutation(api.cardClaims.verifyCode);
  const complete = useMutation(api.cardClaims.complete);
  const requestCorrection = useMutation(api.cardCorrectionRequests.requestCorrection);
  const safeReturn = sanitizeReturnPath(returnHref) ?? `/c/${encodeURIComponent(cardToken)}`;
  const signupReturn = isHostedDemoMode()
    ? safeReturn
    : `/onboarding?next=${encodeURIComponent(safeReturn)}`;
  const [challenge, setChallenge] = useState<string>();
  if (isLoading)
    return (
      <Shell>
        <Notice>Checking your sign-in…</Notice>
      </Shell>
    );
  if (!isAuthenticated)
    return (
      <Shell>
        <h1 className="tapit-display text-2xl font-semibold">Sign in to set up your card</h1>
        <p className="text-sm text-tapit-muted">Your profile stays private until you confirm.</p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-tapit-accent px-4 text-sm font-semibold text-white"
          href={`/login?mode=signup&next=${encodeURIComponent(signupReturn)}`}
        >
          Continue with Google
        </Link>
        <Link
          className="text-center text-sm text-tapit-muted"
          href={`/login?next=${encodeURIComponent(safeReturn)}`}
        >
          I already have an account
        </Link>
      </Shell>
    );
  if (profile === undefined)
    return (
      <Shell>
        <Notice>Loading your profile…</Notice>
      </Shell>
    );
  if (profile === null)
    return (
      <Shell>
        <Notice>Create your profile before setting up this card.</Notice>
        <Link
          className="text-center text-sm font-semibold text-tapit-accent-strong"
          href={`/onboarding?next=${encodeURIComponent(safeReturn)}`}
        >
          Continue onboarding
        </Link>
      </Shell>
    );
  const draft = profile.draft;
  return (
    <CardSetupContent
      returnHref={safeReturn}
      loading={false}
      profile={{
        name: draft.name,
        slug: draft.slug,
        bio: draft.bio,
        imageUrl: draft.imageUrl,
        links: draft.links,
        published: profile.status === "published",
      }}
      correction={correction}
      onVerify={async (value) => {
        const result = await verify({ token: cardToken, code: normalizeClaimCode(value) ?? "" });
        if (!result.ok)
          throw new Error("That code is invalid or unavailable. Check the code and try again.");
        setChallenge(result.challenge);
      }}
      onConfirm={async () => {
        if (!challenge) throw new Error("Verify the code first.");
        await complete({ challenge });
        router.replace("/app/profile");
      }}
      onCorrection={async () => {
        if (!challenge) throw new Error("Verify the code first.");
        await requestCorrection({ token: cardToken, challenge });
      }}
      onSkip={() => router.replace("/app/profile")}
    />
  );
}
