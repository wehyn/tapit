"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { hashDemoPassword } from "@/lib/demo/password";
import { setDemoSession, updateDemoState, useDemoState } from "@/lib/demo/store";

export function SetupForm({ token }: { token: string }) {
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
    <main className="grid min-h-[100dvh] place-items-center bg-tapit-paper px-5 py-10">
      <section className="w-full max-w-md rounded-[2rem] border border-tapit-line bg-tapit-surface p-7 shadow-[0_20px_60px_rgba(23,33,31,0.07)] sm:p-10">
        <Brand />
        <div className="mt-10">
          <p className="text-xs font-semibold tracking-[0.18em] text-tapit-accent uppercase">
            Set up your account
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-tapit-ink">
            Choose a password
          </h1>
          <p className="mt-3 text-sm leading-6 text-tapit-muted">
            This one-time link gives you access to your Tapit profile workspace.
          </p>
        </div>
        {account ? (
          <p className="mt-6 rounded-xl bg-tapit-paper px-4 py-3 text-sm text-tapit-muted">
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
      </section>
    </main>
  );
}
