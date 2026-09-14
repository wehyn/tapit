"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Fingerprint } from "@phosphor-icons/react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { setDemoSession, useDemoSession, useDemoState } from "@/lib/demo/store";
import { verifyDemoPassword } from "@/lib/demo/password";

/** Accept only an internal, same-origin path for post-login navigation. */
export function sanitizeReturnPath(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0 || !value.startsWith("/")) return undefined;
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /%(?![0-9a-fA-F]{2})/.test(value)
  )
    return undefined;
  try {
    const parsed = new URL(value, "https://tapit.invalid");
    if (parsed.origin !== "https://tapit.invalid") {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const state = useDemoState();
  const session = useDemoSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const safeNextPath = sanitizeReturnPath(nextPath);

  useEffect(() => {
    if (session !== null)
      router.replace(
        safeNextPath || (session.role === "admin" ? "/admin/customers" : "/app/profile"),
      );
  }, [router, safeNextPath, session]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    const account = state.customers.find(
      (candidate) =>
        candidate.email === normalizedEmail &&
        candidate.status === "active" &&
        candidate.deletionStatus === "active",
    );
    window.setTimeout(async () => {
      try {
        const valid =
          account !== undefined && (await verifyDemoPassword(password, account.passwordHash));
        if (!valid) {
          setError("The email or password is not correct.");
          setSubmitting(false);
          return;
        }
        setDemoSession({ email: account.email, role: account.role });
        router.replace(
          safeNextPath || (account.role === "admin" ? "/admin/customers" : "/app/profile"),
        );
      } catch {
        setError("The demo authentication service is unavailable. Try again.");
        setSubmitting(false);
      }
    }, 180);
  }

  return (
    <main className="min-h-[100dvh] bg-tapit-paper px-5 py-6 sm:px-10 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-6xl flex-col">
        <Brand />
        <section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1fr_0.8fr] lg:gap-28">
          <div className="max-w-lg">
            <Fingerprint
              aria-hidden="true"
              className="text-tapit-accent"
              size={48}
              weight="light"
            />
            <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
              Welcome back
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-tapit-ink sm:text-6xl">
              Sign in to Tapit
            </h1>
            <p className="mt-4 max-w-sm text-base leading-7 text-tapit-muted">
              Manage your profile, links, and publication state from one calm workspace.
            </p>
          </div>
          <div className="border-t border-tapit-line pt-8 lg:border-t-0 lg:border-l lg:pl-12">
            <form className="grid gap-5" onSubmit={submit}>
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Field
                autoComplete="email"
                id="email"
                label="Email"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
              <Field
                autoComplete="current-password"
                help="Use at least 8 characters."
                id="password"
                label="Password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
              <Button disabled={submitting} type="submit">
                {submitting ? "Signing in" : "Sign in"}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-tapit-muted">
              Need help?{" "}
              <a
                className="font-semibold text-tapit-accent hover:underline"
                href={state.supportUrl}
              >
                Contact support{" "}
                <ArrowUpRight aria-hidden="true" className="ml-1 inline" size={14} />
              </a>
            </p>
            {process.env.NEXT_PUBLIC_DEMO_MODE !== "false" ? (
              <p className="mt-6 rounded-tapit bg-tapit-paper px-4 py-3 text-xs leading-5 text-tapit-muted">
                Local demo: use <strong>mara@example.test</strong> or{" "}
                <strong>admin@tapit.local</strong> with password <strong>tapit-demo</strong>.
              </p>
            ) : null}
          </div>
        </section>
        <footer className="border-t border-tapit-line pt-4 text-xs text-tapit-muted">
          A focused workspace for a more memorable introduction.
        </footer>
      </div>
    </main>
  );
}
