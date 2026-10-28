"use client";

import { Button, ButtonLink } from "@/components/ui/Button";
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Tile } from "@/components/ui/Tile";
import { CopyButton } from "./CopyButton";

export function PreparedHandoffScreen({
  token,
  title,
  name,
  demo,
  onBack,
}: {
  token: string;
  title: string;
  name: string;
  demo: boolean;
  onBack: () => void;
}) {
  const url = `${window.location.origin}/setup/${token}`;
  const first = name.trim().split(/\s+/)[0] || "there";
  const message = `Hi ${first}, your Tapit profile is ready. Open this link to finish setup with your Google account: ${url} (works once, expires in 7 days).`;
  return (
    <main className="flex min-w-0 flex-col gap-6 pt-2 pb-16">
      <Link className="text-sm font-semibold text-tapit-muted" href="/admin/customers">
        ← Customers
      </Link>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-tapit-success-soft text-tapit-success-ink">
            <Icon name="check" size={28} />
          </span>
          <Chip tone="accent">Admin</Chip>
          <h1 className="text-2xl font-semibold text-tapit-ink">{title}</h1>
          <p className="text-sm text-tapit-muted">
            Share this link with {first} so they can finish setup.
          </p>
        </div>
        <Tile tone="white" className="flex-wrap justify-between">
          <p className="min-w-0 break-all text-sm text-tapit-ink">{url}</p>
          <CopyButton text={url} label="Copy link" />
        </Tile>
        <div className="flex flex-wrap gap-2">
          <Chip tone="warn">Expires in 7 days</Chip>
          <Chip>One use only</Chip>
        </div>
        <section className="flex flex-col gap-3 rounded-card bg-tapit-surface p-6 shadow-card">
          <h2 className="font-semibold text-tapit-ink">Message you can send</h2>
          <p className="text-sm text-tapit-muted">{message}</p>
          <div className="self-start">
            <CopyButton text={message} label="Copy message" />
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-3">
          {["They open the link", "They sign in with Google", "Account is linked to them"].map(
            (text, i) => (
              <Tile key={text}>
                <Chip>{i + 1}</Chip>
                <span className="text-sm text-tapit-ink">{text}</span>
              </Tile>
            ),
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onBack} variant="secondary">
            Back to customers
          </Button>
          {demo ? (
            <ButtonLink href={`/setup/${token}`} variant="quiet">
              Preview as user
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </main>
  );
}
