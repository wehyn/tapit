"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { setDemoSession, useDemoSession, useDemoState } from "@/lib/demo/store";
import { verifyDemoPassword } from "@/lib/demo/password";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const state = useDemoState();
  const session = useDemoSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session !== null)
      router.replace(nextPath || (session.role === "admin" ? "/admin/customers" : "/app/profile"));
  }, [nextPath, router, session]);

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
      (candidate) => candidate.email === normalizedEmail && candidate.status === "active",
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
          nextPath || (account.role === "admin" ? "/admin/customers" : "/app/profile"),
        );
      } catch {
        setError("The demo authentication service is unavailable. Try again.");
        setSubmitting(false);
      }
    }, 180);
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-tapit-line bg-tapit-surface p-7 shadow-[0_20px_60px_rgba(23,33,31,0.07)] sm:p-10">
        <Brand />
        <div className="mt-10">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Welcome back
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            Sign in to Tapit
          </h1>
          <p className="mt-3 text-sm leading-6 text-tapit-muted">
            Manage your profile, links, and publication state from one calm workspace.
          </p>
        </div>
        <form className="mt-8 grid gap-5" onSubmit={submit}>
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
          <a className="font-semibold text-tapit-accent hover:underline" href={state.supportUrl}>
            Contact support
          </a>
        </p>
        {process.env.NEXT_PUBLIC_DEMO_MODE !== "false" ? (
          <p className="mt-6 rounded-xl bg-tapit-paper px-4 py-3 text-xs leading-5 text-tapit-muted">
            Local demo: use <strong>mara@example.test</strong> or <strong>admin@tapit.local</strong>{" "}
            with password <strong>tapit-demo</strong>.
          </p>
        ) : null}
      </section>
    </main>
  );
}
