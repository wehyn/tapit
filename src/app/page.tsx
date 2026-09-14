import Link from "next/link";

import { Brand } from "@/components/layout/Brand";
import { PageContainer } from "@/components/layout/PageContainer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-tapit-paper">
      <PageContainer className="flex min-h-screen flex-col justify-between py-8 sm:py-12">
        <header className="flex items-center justify-between">
          <Brand />
          <Link className="text-sm font-semibold text-tapit-accent hover:underline" href="/login">
            Sign in
          </Link>
        </header>
        <section className="grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-tapit-accent uppercase">
              Your profile, in one tap
            </p>
            <h1 className="mt-5 max-w-2xl text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-tapit-ink sm:text-7xl">
              A quieter way to share what matters.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-tapit-muted">
              Tapit keeps your professional identity and useful links ready for the moment someone
              taps, scans, or opens your profile.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-tapit-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-tapit-accent-strong"
                href="/mara-velasquez"
              >
                View demo profile
              </Link>
              <Link
                className="rounded-full border border-tapit-line bg-tapit-surface px-5 py-3 text-sm font-semibold text-tapit-ink hover:border-tapit-accent"
                href="/app/profile"
              >
                Open workspace
              </Link>
            </div>
          </div>
          <aside
            aria-label="Tapit product preview"
            className="rounded-[2rem] border border-tapit-line bg-tapit-surface p-7 shadow-[0_20px_60px_rgba(23,33,31,0.08)] sm:p-9"
          >
            <div className="flex items-center justify-between border-b border-tapit-line pb-5">
              <span className="text-sm font-semibold text-tapit-ink">Tapit profile</span>
              <span className="rounded-full bg-tapit-accent-soft px-3 py-1 text-xs font-semibold text-tapit-accent-strong">
                Published
              </span>
            </div>
            <div className="py-8 text-center">
              <div
                aria-hidden="true"
                className="mx-auto grid size-20 place-items-center rounded-full bg-tapit-accent-soft text-2xl font-semibold text-tapit-accent"
              >
                A
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-tapit-ink">Mara Velasquez</h2>
              <p className="mt-2 text-sm text-tapit-muted">Brand systems for independent teams.</p>
            </div>
            <div className="space-y-3">
              {["LinkedIn", "Portfolio", "Book a conversation"].map((label) => (
                <div
                  className="flex items-center justify-between rounded-2xl border border-tapit-line px-4 py-3 text-sm font-medium"
                  key={label}
                >
                  <span>{label}</span>
                  <span aria-hidden="true" className="text-tapit-muted">
                    ↗
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-tapit-line pt-5 text-xs text-tapit-muted">
          <span>Built for quick, human introductions.</span>
          <span>Local MVP demo mode</span>
        </footer>
      </PageContainer>
    </main>
  );
}
