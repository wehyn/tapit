"use client";

import { useId, useState, type ReactNode } from "react";
import { CaretDownIcon, CaretUpIcon, CopyIcon } from "@phosphor-icons/react";
import Link from "next/link";

import type { ProfileContent, ProfileLink } from "@/lib/domain";
import {
  defaultProfileCustomizationForTheme,
  type ProfileCustomization,
  type ProfileSection,
} from "@/lib/profile-customization";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

export type ProfileFieldChange = <K extends keyof ProfileContent>(
  field: K,
  value: ProfileContent[K],
) => void;

export type ProfileDetailsEditorProps = {
  draft: ProfileContent;
  customization?: ProfileCustomization;
  errors?: readonly string[];
  customizationErrors?: readonly string[];
  links: readonly ProfileLink[];
  copyMessage: string;
  slugLocked: boolean;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
  onCustomizationChange: (next: ProfileCustomization | undefined) => void;
  onCopyUrl: () => void;
  onOpenCustomize?: ReactNode;
};

type DetailsSectionName = "about";

const sectionLabels: Record<DetailsSectionName, string> = {
  about: "About or Services",
};

const radioClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-tapit border px-3.5 py-3 text-sm transition focus-within:ring-2 focus-within:ring-tapit-accent/30";

function RadioChoice({
  ariaDescribedBy,
  checked,
  children,
  name,
  onChange,
  value,
}: {
  ariaDescribedBy?: string;
  checked: boolean;
  children: React.ReactNode;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label
      className={`${radioClass} ${checked ? "border-tapit-accent bg-tapit-accent-soft" : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"}`}
    >
      <input
        checked={checked}
        aria-describedby={ariaDescribedBy}
        className="size-4 accent-tapit-accent"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span className="font-medium text-tapit-ink">{children}</span>
    </label>
  );
}

function SectionRow({
  children,
  id,
  name,
  onToggle,
  open,
}: {
  children: React.ReactNode;
  id: string;
  name: DetailsSectionName;
  onToggle: () => void;
  open: boolean;
}) {
  const panelId = `${id}-panel`;
  return (
    <section className="overflow-hidden rounded-tapit border border-tapit-line bg-tapit-surface">
      <h2>
        <button
          aria-controls={panelId}
          aria-expanded={open}
          className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left text-sm font-semibold text-tapit-ink outline-none transition hover:bg-tapit-paper focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-accent sm:px-5"
          onClick={onToggle}
          type="button"
        >
          <span>{sectionLabels[name]}</span>
          <span aria-hidden="true" className="text-xl font-normal text-tapit-muted">
            {open ? (
              <CaretUpIcon size={18} weight="bold" />
            ) : (
              <CaretDownIcon size={18} weight="bold" />
            )}
          </span>
        </button>
      </h2>
      <div
        aria-hidden={!open}
        className="border-t border-tapit-line/70 px-4 py-5 sm:px-5"
        hidden={!open}
        id={panelId}
      >
        {children}
      </div>
    </section>
  );
}

function copyCustomization(customization: ProfileCustomization): ProfileCustomization {
  return {
    ...customization,
    ...(customization.layoutOrder ? { layoutOrder: [...customization.layoutOrder] } : {}),
    ...(customization.identityColors
      ? { identityColors: { ...customization.identityColors } }
      : {}),
    ...(customization.section
      ? {
          section: {
            ...customization.section,
            ...(customization.section.kind === "services"
              ? {
                  items: customization.section.items ? [...customization.section.items] : undefined,
                }
              : {}),
          },
        }
      : {}),
  };
}

function ProfileIdentityForm({
  draft,
  imageContent,
  message,
  onboarding,
  onChange,
}: {
  draft: ProfileContent;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
}) {
  return (
    <Panel className="shadow-none" title="Basics">
      <div className="mt-6 grid grid-cols-1 gap-5">
        {message}
        {onboarding}
        {imageContent}
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <Field
            id="profile-name"
            label="Name"
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Alex Morgan"
            value={draft.name}
          />
          <TextareaField
            compact
            id="profile-bio"
            label="Bio or role"
            help="A short introduction people can scan quickly."
            maxLength={140}
            onChange={(event) => onChange("bio", event.target.value || undefined)}
            placeholder="e.g. Designer helping small teams"
            value={draft.bio ?? ""}
          />
        </div>
      </div>
    </Panel>
  );
}

export function ProfileDetailsEditor({
  customization,
  draft,
  errors = [],
  customizationErrors = [],
  copyMessage,
  slugLocked,
  imageContent,
  message,
  onboarding,
  onChange,
  onCustomizationChange,
  onCopyUrl,
  onOpenCustomize,
}: ProfileDetailsEditorProps) {
  const baseId = useId();
  const [openSections, setOpenSections] = useState<Record<DetailsSectionName, boolean>>(() => {
    const section = customization?.section;
    return {
      about: Boolean(
        section &&
        (section.body.trim() ||
          (section.kind === "services" && section.items?.some((item) => item.trim()))),
      ),
    };
  });
  const activeCustomization: ProfileCustomization =
    customization ?? defaultProfileCustomizationForTheme(draft.theme);

  function toggle(name: DetailsSectionName) {
    setOpenSections((current) => ({ ...current, [name]: !current[name] }));
  }

  function update(patch: Partial<ProfileCustomization>) {
    onCustomizationChange({ ...copyCustomization(activeCustomization), ...patch });
  }

  function updateSection(section: ProfileSection | undefined) {
    const nextSection =
      section?.kind === "services"
        ? {
            ...section,
            items: section.items ? [...section.items] : undefined,
          }
        : section;
    onCustomizationChange({ ...copyCustomization(activeCustomization), section: nextSection });
  }

  const section = activeCustomization.section;
  const errorId = (name: string) => `${baseId}-${name}-error`;
  const findError = (...needles: string[]) =>
    errors.find((error) => needles.some((needle) => error.toLowerCase().includes(needle)));
  const redirect = draft.redirect ?? { enabled: false, destination: "" };
  const redirectError = redirect.enabled ? findError("redirect destination") : undefined;
  const kindError = findError("section kind", "section is invalid");
  const bodyError = findError("section body", "about section body", "services section body");
  const itemError = findError("service item", "services items");

  function setKind(kind: "about" | "services") {
    updateSection(
      kind === "about"
        ? { kind, body: section?.kind === "about" ? section.body : "" }
        : {
            kind,
            body: section?.kind === "services" ? section.body : "",
            items: section?.kind === "services" ? [...(section.items ?? [])] : [],
          },
    );
  }

  return (
    <div className="grid gap-4 sm:gap-5">
      {errors.length > 0 ? (
        <Notice tone="error">
          <ul className="grid gap-2">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {customizationErrors.length > 0 ? (
        <Notice tone="error">
          Some customization settings need attention before you can publish.
          {onOpenCustomize ? <span className="mt-3 block">{onOpenCustomize}</span> : null}
        </Notice>
      ) : null}
      <ProfileIdentityForm
        draft={draft}
        imageContent={imageContent}
        message={message}
        onChange={onChange}
        onboarding={onboarding}
      />

      <Panel className="shadow-none" title="Contact">
        <p className="mt-4 text-sm leading-6 text-tapit-muted">
          These details appear as contact options on your published profile.
        </p>
        <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2">
          <Field
            id="profile-email"
            label="Email"
            onChange={(event) => onChange("email", event.target.value || undefined)}
            placeholder="you@example.com"
            type="email"
            value={draft.email ?? ""}
          />
          <Field
            id="profile-phone"
            label="Phone"
            onChange={(event) => onChange("phone", event.target.value || undefined)}
            placeholder="+63 917 555 0184"
            type="tel"
            value={draft.phone ?? ""}
          />
          <Field
            id="profile-website"
            label="Website"
            onChange={(event) => onChange("website", event.target.value || undefined)}
            placeholder="https://yourwebsite.com"
            type="url"
            value={draft.website ?? ""}
          />
        </div>
      </Panel>

      <Panel className="shadow-none" title="Profile link">
        <Field
          disabled={slugLocked}
          help={
            slugLocked
              ? "The slug is immutable after first publication."
              : "Use lowercase letters, numbers, and hyphens."
          }
          id="profile-slug"
          label="Stable profile slug"
          onChange={(event) => onChange("slug", event.target.value)}
          placeholder="alex-morgan"
          value={draft.slug}
        />
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-tapit border border-tapit-line/70 bg-tapit-paper px-4 py-3 text-sm sm:flex sm:flex-wrap sm:gap-3">
          <span className="font-semibold text-tapit-ink">Public URL</span>
          <Link
            aria-label={`Open public profile /${draft.slug}`}
            className="col-span-2 flex min-h-11 min-w-0 items-center break-all text-xs text-tapit-accent-strong underline-offset-4 hover:underline focus-visible:rounded-sm sm:flex-1"
            href={`/${draft.slug}`}
          >
            <code className="break-all">
              {typeof window === "undefined"
                ? `/${draft.slug}`
                : `${window.location.origin}/${draft.slug}`}
            </code>
          </Link>
          <Button onClick={onCopyUrl} type="button" variant="secondary">
            <CopyIcon aria-hidden="true" className="mr-2" size={17} weight="bold" />
            {copyMessage || "Copy"}
          </Button>
        </div>
        <p className="mt-4 text-sm leading-6 text-tapit-muted">
          Choose what visitors see when they open your profile link or tap or scan your card.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <RadioChoice
            checked={!redirect.enabled}
            name={`${baseId}-profile-destination`}
            onChange={() => onChange("redirect", { ...redirect, enabled: false })}
            value="profile"
          >
            Show my Tapit profile
          </RadioChoice>
          <RadioChoice
            checked={redirect.enabled}
            name={`${baseId}-profile-destination`}
            onChange={() => onChange("redirect", { ...redirect, enabled: true })}
            value="website"
          >
            Redirect to website
          </RadioChoice>
        </div>
        {redirect.enabled ? (
          <div className="mt-4">
            <Field
              error={redirectError}
              help="When published, your Tapit profile link and card taps or scans will send visitors here."
              id="profile-redirect-destination"
              label="HTTPS destination URL"
              onChange={(event) =>
                onChange("redirect", { ...redirect, destination: event.target.value })
              }
              placeholder="https://www.yourwebsite.com"
              type="url"
              value={redirect.destination}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-tapit-muted">
            Visitors see your contact details and profile links.
          </p>
        )}
      </Panel>

      <SectionRow
        id={`${baseId}-about`}
        name="about"
        onToggle={() => toggle("about")}
        open={openSections.about}
      >
        <div className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-tapit-ink">Section kind</legend>
            {kindError ? (
              <p className="sr-only" id={errorId("kind")} role="alert">
                {kindError}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <RadioChoice
                ariaDescribedBy={kindError ? errorId("kind") : undefined}
                checked={section?.kind === "about"}
                name={`${baseId}-kind`}
                onChange={() => setKind("about")}
                value="about"
              >
                About
              </RadioChoice>
              <RadioChoice
                ariaDescribedBy={kindError ? errorId("kind") : undefined}
                checked={section?.kind === "services"}
                name={`${baseId}-kind`}
                onChange={() => setKind("services")}
                value="services"
              >
                Services
              </RadioChoice>
            </div>
          </fieldset>
          {section?.kind === "about" ? (
            <TextareaField
              error={bodyError}
              id={`${baseId}-about-copy`}
              label="About copy"
              maxLength={280}
              onChange={(event) => updateSection({ kind: "about", body: event.target.value })}
              value={section.body}
            />
          ) : null}
          {section?.kind === "services" ? (
            <div className="grid gap-4">
              <TextareaField
                error={bodyError}
                id={`${baseId}-services-intro`}
                label="Services intro"
                maxLength={160}
                onChange={(event) => updateSection({ ...section, body: event.target.value })}
                value={section.body}
              />
              <div className="grid gap-3">
                {section.items?.map((item, index) => (
                  <div className="flex items-end gap-2" key={`${baseId}-service-${index}`}>
                    <Field
                      error={itemError}
                      id={`${baseId}-service-${index}`}
                      label={`Service ${index + 1}`}
                      maxLength={60}
                      onChange={(event) => {
                        const items = [...(section.items ?? [])];
                        items[index] = event.target.value;
                        updateSection({ ...section, items });
                      }}
                      value={item}
                    />
                    <Button
                      aria-label={`Remove Service ${index + 1}`}
                      className="shrink-0"
                      onClick={() =>
                        updateSection({
                          ...section,
                          items: section.items?.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                      type="button"
                      variant="quiet"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                {(section.items?.length ?? 0) < 3 ? (
                  <Button
                    onClick={() =>
                      updateSection({ ...section, items: [...(section.items ?? []), ""] })
                    }
                    type="button"
                    variant="secondary"
                  >
                    Add service
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {section ? (
            <Button onClick={() => updateSection(undefined)} type="button" variant="quiet">
              Remove {section.kind === "about" ? "About" : "Services"} section
            </Button>
          ) : (
            <Button onClick={() => setKind("about")} type="button" variant="secondary">
              Add About or Services section
            </Button>
          )}
        </div>
      </SectionRow>
    </div>
  );
}
