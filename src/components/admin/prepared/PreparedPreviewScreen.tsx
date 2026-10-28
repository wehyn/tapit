"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { PreparedFormValues, PreparedStep } from "./types";
import { initials } from "./presentation";

export function PreviewScreen({
  values,
  editMode,
  onEdit,
  onBack,
  onSave,
  busy,
}: {
  values: PreparedFormValues;
  editMode: boolean;
  onEdit: (step: PreparedStep) => void;
  onBack: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const host = "tapit.com";
  const sections: { title: string; step: PreparedStep; lines: string[] }[] = [
    {
      title: "Profile",
      step: 1,
      lines: [
        values.name || "Name",
        `tapit.com/${values.slug || "profile"}`,
        values.bio || "No bio",
      ],
    },
    {
      title: "Contact",
      step: 2,
      lines: [
        values.contactEmail || "No email",
        values.phone || "No phone",
        values.website || "No website",
      ],
    },
    {
      title: "Links",
      step: 3,
      lines: values.links.length ? values.links.map((link) => link.label) : ["None added"],
    },
  ];
  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 pt-2 pb-16">
      <Link className="text-sm font-semibold text-tapit-muted" href="/admin/customers">
        ← Customers
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-tapit-ink">Preview before you create</h1>
        <p className="mt-2 text-sm text-tapit-muted">
          This is how {values.name.split(/\s+/)[0] || "their"}&apos;s profile will look. Nothing is
          published until they claim it.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card">
          <Chip tone="warn">Not published</Chip>
          <p className="rounded-control bg-tapit-soft-surface p-3 text-sm text-tapit-muted">
            <Icon name="shield" size={17} /> {host}/
            <strong className="text-tapit-ink">{values.slug}</strong>
          </p>
          <div className="flex flex-col items-center gap-3 rounded-card bg-tapit-paper p-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-tapit-accent-soft text-xl font-semibold text-tapit-accent-strong">
              {initials(values.name)}
            </span>
            <h2 className="text-xl font-semibold text-tapit-ink">{values.name || "Your name"}</h2>
            <p className="text-sm text-tapit-muted">
              {values.bio || "Add a short introduction to your profile."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {values.contactEmail ? <Chip>Email</Chip> : null}
              {values.phone ? <Chip>Call</Chip> : null}
              {values.website ? <Chip>Website</Chip> : null}
              {values.contactEmail || values.phone || values.website ? null : (
                <span className="text-sm text-tapit-muted">Contact options will appear here.</span>
              )}
            </div>
            {values.links.length ? (
              values.links.map((link, i) => (
                <Chip key={`${link.label}-${i}`}>{link.label || "Link"}</Chip>
              ))
            ) : (
              <div className="w-full space-y-2">
                <div className="h-11 rounded-control bg-tapit-soft-surface" />
                <div className="h-11 rounded-control bg-tapit-soft-surface" />
              </div>
            )}
          </div>
        </section>
        <div className="flex flex-col gap-3">
          {sections.map(({ title, step, lines }) => (
            <section
              className="flex flex-col gap-3 rounded-card bg-tapit-surface p-4 shadow-card"
              key={String(title)}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-tapit-ink">{title}</h2>
                <Button onClick={() => onEdit(step)} variant="quiet">
                  <Icon name="edit" size={17} />
                  Edit
                </Button>
              </div>
              {lines.map((line, index) => (
                <p className="text-sm text-tapit-muted" key={index}>
                  {line}
                </p>
              ))}
            </section>
          ))}
          {!editMode ? (
            <Notice>
              Next you&apos;ll get a temporary link to share. You can keep editing until it&apos;s
              claimed.
            </Notice>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-3">
        <Button onClick={onBack} variant="secondary">
          Back
        </Button>
        <Button loading={busy} onClick={onSave}>
          {editMode ? "Save changes" : "Create account"}
        </Button>
      </div>
    </main>
  );
}
