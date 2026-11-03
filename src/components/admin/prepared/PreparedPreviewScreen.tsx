"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { PublicProfileProjection } from "@/lib/domain";
import { WorkspacePreview } from "@/components/workspace/WorkspacePreview";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import type { PreparedFormValues, PreparedStep } from "./types";

function preparedProfileProjection(values: PreparedFormValues): PublicProfileProjection {
  const bio = values.bio?.trim();
  const email = values.contactEmail?.trim();
  const phone = values.phone?.trim();
  const website = values.website?.trim();

  return {
    id: "prepared-preview",
    slug: values.slug.trim(),
    name: values.name.trim(),
    ...(bio ? { bio } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(website ? { website } : {}),
    theme: "paper",
    links: values.links
      .filter((link) => link.label.trim() || link.url.trim())
      .map((link, index) => ({
        id: `prepared-${index}`,
        label: link.label.trim(),
        destination: link.url.trim(),
        enabled: true,
      })),
  };
}

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
  const profile = useMemo(() => preparedProfileProjection(values), [values]);
  const host = "tapit.com";
  const firstName = values.name.trim().split(/\s+/)[0] || "their";
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
          This is how {firstName}&apos;s profile will look. Nothing is published until they claim
          it.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card">
          <Chip tone="warn">Not published</Chip>
          <p className="rounded-control bg-tapit-soft-surface p-3 text-sm text-tapit-muted">
            <Icon name="shield" size={17} /> {host}/
            <strong className="text-tapit-ink">{values.slug}</strong>
          </p>
          <WorkspacePreview
            preview={profile}
            profileLayout="slug"
            profileUrl={`/${profile.slug}`}
            theme="paper"
          />
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
