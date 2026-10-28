"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Field, HttpsUrlField, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { slugFromName } from "./validation";
import { previousStep } from "./state";
import type { PreparedFormValues, PreparedStep } from "./types";

export function WizardScreen({
  values,
  errors,
  step,
  reached,
  mode,
  host,
  busy,
  onChange,
  onJump,
  onCancel,
  onAdvance,
}: {
  values: PreparedFormValues;
  errors: Partial<Record<string, string>>;
  step: PreparedStep;
  reached: PreparedStep[];
  mode: "create" | "edit";
  host: string;
  busy: boolean;
  onChange: (values: PreparedFormValues) => void;
  onJump: (step: PreparedStep) => void;
  onCancel: () => void;
  onAdvance: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof PreparedFormValues>(key: K, value: PreparedFormValues[K]) =>
    onChange({ ...values, [key]: value });
  const steps: { number: PreparedStep; label: string }[] = [
    { number: 1, label: "Profile" },
    { number: 2, label: "Contact" },
    { number: 3, label: "Links" },
  ];
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);
  return (
    <main className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6 pt-2 pb-16">
      <Link className="text-sm font-semibold text-tapit-muted" href="/admin/customers">
        ← Customers
      </Link>
      <div className="flex flex-col gap-2">
        <div className="self-start">
          <Chip tone="accent">Admin</Chip>
        </div>
        <h1 className="text-2xl font-semibold text-tapit-ink">
          {mode === "edit" ? "Edit prepared account" : "Set up for someone"}
        </h1>
        <p className="text-sm text-tapit-muted">
          {mode === "edit"
            ? "Changes apply when they open the link. Their Google account is still unlinked."
            : "Prepare the profile now. They link their own Google account later. Yours is not linked."}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {steps.map(({ number, label }) => (
          <button
            type="button"
            key={label}
            disabled={!reached.includes(number)}
            onClick={() => onJump(number)}
            aria-current={number === step ? "step" : undefined}
            className={`min-h-11 rounded-control px-2 text-sm font-semibold ${number === step ? "bg-tapit-accent-soft text-tapit-accent-strong" : "bg-tapit-soft-surface text-tapit-muted"}`}
          >
            {number} {label}
          </button>
        ))}
      </div>
      <section className="flex flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card">
        <h2 className="text-xl font-semibold text-tapit-ink" ref={headingRef} tabIndex={-1}>
          {step === 1
            ? "Who is this profile for?"
            : step === 2
              ? "How can people reach them?"
              : "Add links (optional)"}
        </h2>
        {step === 1 ? (
          <>
            <Field
              id="prepared-name"
              label="Display name"
              value={values.name}
              error={errors.name}
              onChange={(event) =>
                onChange({
                  ...values,
                  name: event.target.value,
                  ...(values.slug === slugFromName(values.name) || values.slug === ""
                    ? { slug: slugFromName(event.target.value) }
                    : {}),
                })
              }
            />
            <Field
              id="prepared-slug"
              label="Profile URL"
              help={`${host}/${values.slug || "your-name"} is available`}
              error={errors.slug}
              value={values.slug}
              disabled={mode === "edit"}
              onChange={(event) => set("slug", event.target.value)}
            />
            <TextareaField
              id="prepared-bio"
              label="Role or bio"
              value={values.bio ?? ""}
              onChange={(event) => set("bio", event.target.value)}
            />
          </>
        ) : null}
        {step === 2 ? (
          <>
            <Field
              id="prepared-email"
              label="Email"
              type="email"
              value={values.contactEmail ?? ""}
              error={errors.contactEmail}
              onChange={(event) => set("contactEmail", event.target.value)}
            />
            <Field
              id="prepared-phone"
              label="Phone"
              type="tel"
              value={values.phone ?? ""}
              onChange={(event) => set("phone", event.target.value)}
            />
            <HttpsUrlField
              id="prepared-website"
              label="Website"
              value={values.website ?? ""}
              error={errors.website}
              onValueChange={(value) => set("website", value)}
            />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <p className="text-sm text-tapit-muted">
              You can skip this. They can add links after they sign in.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Instagram", url: "https://instagram.com/" },
                { label: "LinkedIn", url: "https://linkedin.com/in/" },
                { label: "Booking", url: "https://" },
                { label: "Other", url: "https://" },
              ].map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="secondary"
                  onClick={() => set("links", [...values.links, item])}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {values.links.length === 0 ? (
              <p className="rounded-control bg-tapit-soft-surface p-4 text-sm text-tapit-muted">
                No links yet. Pick a shortcut above or continue without links.
              </p>
            ) : (
              values.links.map((link, index) => (
                <div
                  className="grid gap-3 rounded-control bg-tapit-soft-surface p-4 sm:grid-cols-[1fr_1fr_auto]"
                  key={`${index}-${link.label}`}
                >
                  <Field
                    id={`prepared-link-label-${index}`}
                    label="Label"
                    value={link.label}
                    error={errors[`links.${index}.label`]}
                    onChange={(event) =>
                      set(
                        "links",
                        values.links.map((item, i) =>
                          i === index ? { ...item, label: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <HttpsUrlField
                    id={`prepared-link-url-${index}`}
                    label="URL"
                    value={link.url}
                    error={errors[`links.${index}.url`]}
                    onValueChange={(url) =>
                      set(
                        "links",
                        values.links.map((item, i) => (i === index ? { ...item, url } : item)),
                      )
                    }
                  />
                  <Button
                    className="self-end"
                    type="button"
                    variant="quiet"
                    onClick={() =>
                      set(
                        "links",
                        values.links.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </>
        ) : null}
      </section>
      <div className="flex flex-wrap justify-between gap-3">
        <Button
          onClick={step === 1 ? onCancel : () => onJump(previousStep[step])}
          variant="secondary"
        >
          {step === 1 ? "Cancel" : "Back"}
        </Button>
        <Button loading={busy} onClick={onAdvance} type="button">
          {step === 3 ? "Continue to preview" : "Continue"}
          <Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </main>
  );
}
