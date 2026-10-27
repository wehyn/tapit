"use client";

import { useId, useState, type ReactNode } from "react";

import { validateProfileRedirect, type ProfileContent, type ProfileLink } from "@/lib/domain";
import {
  defaultProfileCustomizationForTheme,
  type ProfileCustomization,
  type ProfileSection,
} from "@/lib/profile-customization";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Card } from "@/components/ui/Card";

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
  slugLocked: boolean;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
  onCustomizationChange: (next: ProfileCustomization | undefined) => void;
  onOpenCustomize?: ReactNode;
};

type DetailsSectionName = "about";

const sectionLabels: Record<DetailsSectionName, string> = {
  about: "About or Services",
};

const radioClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-4 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-tapit-focus";

const bioMaxLength = 140;

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
      className={`${radioClass} ${checked ? "bg-tapit-accent-soft text-tapit-accent-strong" : "bg-tapit-soft-surface text-tapit-ink hover:text-tapit-accent-strong"}`}
    >
      <input
        checked={checked}
        aria-describedby={ariaDescribedBy}
        className="sr-only"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span className="flex-1 font-medium">{children}</span>
      {checked ? <Icon className="size-4" name="check" weight="bold" /> : null}
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
    <section className="rounded-card bg-tapit-surface shadow-card">
      <h2>
        <button
          aria-controls={panelId}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-4 rounded-card p-6 text-left text-lg font-semibold text-tapit-ink outline-none transition-colors hover:text-tapit-accent-strong focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-accent"
          onClick={onToggle}
          type="button"
        >
          <span>{sectionLabels[name]}</span>
          <span aria-hidden="true" className="text-tapit-muted">
            <Icon className="size-4" name={open ? "caretUp" : "caretDown"} weight="bold" />
          </span>
        </button>
      </h2>
      <div aria-hidden={!open} className="px-6 pb-6" hidden={!open} id={panelId}>
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
    <Card title="Basics">
      {message}
      {onboarding}
      {imageContent}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
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
          help={`${(draft.bio ?? "").length} of ${bioMaxLength} characters`}
          maxLength={bioMaxLength}
          onChange={(event) => onChange("bio", event.target.value || undefined)}
          placeholder="e.g. Designer helping small teams"
          value={draft.bio ?? ""}
        />
      </div>
    </Card>
  );
}

export function ProfileDetailsEditor({
  customization,
  draft,
  errors = [],
  customizationErrors = [],
  slugLocked,
  imageContent,
  message,
  onboarding,
  onChange,
  onCustomizationChange,
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
  const hasInvalidRedirect = validateProfileRedirect(draft.redirect) !== null;

  function toggle(name: DetailsSectionName) {
    setOpenSections((current) => ({ ...current, [name]: !current[name] }));
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
    <div className="grid gap-4">
      {errors.length > 0 ? (
        <Notice tone="error">
          <ul className="grid gap-2">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          {hasInvalidRedirect ? (
            <p className="mt-3">Fix the redirect destination on the Links tab.</p>
          ) : null}
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

      <Card
        description="These details appear as contact options on your published profile."
        title="Contact"
      >
        <div className="grid min-w-0 gap-4 sm:grid-cols-3">
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
      </Card>

      <Card title="Profile link">
        <Field
          disabled={slugLocked}
          help={slugLocked ? undefined : "Use lowercase letters, numbers, and hyphens."}
          id="profile-slug"
          label="Stable profile slug"
          onChange={(event) => onChange("slug", event.target.value)}
          placeholder="alex-morgan"
          value={draft.slug}
        />
      </Card>

      <SectionRow
        id={`${baseId}-about`}
        name="about"
        onToggle={() => toggle("about")}
        open={openSections.about}
      >
        <div className="grid gap-4">
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
