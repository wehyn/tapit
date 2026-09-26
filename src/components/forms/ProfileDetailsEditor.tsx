"use client";

import { useId, useState, type ReactNode } from "react";
import { CaretDownIcon, CaretUpIcon, CopyIcon } from "@phosphor-icons/react";

import type { ProfileContent, ProfileLink } from "@/lib/domain";
import type { ProfileCustomization, ProfileSection } from "@/lib/profile-customization";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
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
  links: readonly ProfileLink[];
  copyMessage: string;
  slugLocked: boolean;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
  onCustomizationChange: (next: ProfileCustomization | undefined) => void;
  onCopyUrl: () => void;
};

type DetailsSectionName = "contact" | "about";

const sectionLabels: Record<DetailsSectionName, string> = {
  contact: "Contact and links",
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
  onCopyUrl,
  copyMessage,
  slugLocked,
}: {
  draft: ProfileContent;
  imageContent?: ReactNode;
  message?: ReactNode;
  onboarding?: ReactNode;
  onChange: ProfileFieldChange;
  onCopyUrl: () => void;
  copyMessage: string;
  slugLocked: boolean;
}) {
  return (
    <Panel className="shadow-none" title="Profile identity">
      <div className="mt-6 grid gap-5">
        {message}
        {onboarding}
        {imageContent}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="profile-name"
            label="Name"
            onChange={(event) => onChange("name", event.target.value)}
            placeholder="e.g. Alex Morgan"
            value={draft.name}
          />
          <TextareaField
            id="profile-bio"
            label="Bio or role"
            help="A short introduction people can scan quickly."
            maxLength={140}
            onChange={(event) => onChange("bio", event.target.value || undefined)}
            placeholder="e.g. Designer helping small teams"
            value={draft.bio ?? ""}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="profile-email"
            help="This appears as a contact option on your published profile."
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
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-tapit border border-tapit-line/70 bg-tapit-paper px-4 py-3 text-sm">
          <span className="font-semibold text-tapit-ink">Public URL</span>
          <code className="min-w-0 flex-1 truncate text-xs text-tapit-muted">
            {typeof window === "undefined"
              ? `/${draft.slug}`
              : `${window.location.origin}/${draft.slug}`}
          </code>
          <Button onClick={onCopyUrl} type="button" variant="secondary">
            <CopyIcon aria-hidden="true" className="mr-2" size={17} weight="bold" />
            {copyMessage || "Copy"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

export function ProfileDetailsEditor({
  customization,
  draft,
  errors = [],
  links,
  copyMessage,
  slugLocked,
  imageContent,
  message,
  onboarding,
  onChange,
  onCustomizationChange,
  onCopyUrl,
}: ProfileDetailsEditorProps) {
  const baseId = useId();
  const [openSections, setOpenSections] = useState<Record<DetailsSectionName, boolean>>({
    contact: true,
    about: true,
  });

  function toggle(name: DetailsSectionName) {
    setOpenSections((current) => ({ ...current, [name]: !current[name] }));
  }

  function update(patch: Partial<ProfileCustomization>) {
    if (customization) onCustomizationChange({ ...copyCustomization(customization), ...patch });
  }

  function updateSection(section: ProfileSection | undefined) {
    if (!customization) return;
    const nextSection =
      section?.kind === "services"
        ? {
            ...section,
            items: section.items ? [...section.items] : undefined,
          }
        : section;
    onCustomizationChange({ ...copyCustomization(customization), section: nextSection });
  }

  const section = customization?.section;
  const featuredLink = customization?.featuredLinkId
    ? links.find((link) => link.id === customization.featuredLinkId)
    : undefined;
  const featuredUnavailable = Boolean(customization?.featuredLinkId && !featuredLink?.enabled);
  const errorId = (name: string) => `${baseId}-${name}-error`;
  const findError = (...needles: string[]) =>
    errors.find((error) => needles.some((needle) => error.toLowerCase().includes(needle)));
  const featuredError = featuredUnavailable
    ? "The selected featured link is missing or disabled. It will appear as a normal link."
    : undefined;
  const kindError = findError("section kind", "section is invalid");
  const bodyError = findError("section body", "about section body", "services section body");
  const itemError = findError("service item", "services items");

  function setKind(kind: "about" | "services") {
    if (!customization) return;
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
    <div className="grid gap-3">
      <ProfileIdentityForm
        copyMessage={copyMessage}
        draft={draft}
        imageContent={imageContent}
        message={message}
        onChange={onChange}
        onCopyUrl={onCopyUrl}
        onboarding={onboarding}
        slugLocked={slugLocked}
      />

      {customization ? (
        <>
          <SectionRow
            id={`${baseId}-contact`}
            name="contact"
            onToggle={() => toggle("contact")}
            open={openSections.contact}
          >
            <div className="grid gap-4">
              <p className="text-sm leading-6 text-tapit-muted">
                Email, phone, and website are managed in Identity. They appear automatically when
                populated.
              </p>
              <SelectField
                aria-describedby={featuredError ? errorId("featured-link") : undefined}
                id={`${baseId}-featured-link`}
                label="Featured link"
                onChange={(event) => update({ featuredLinkId: event.target.value || undefined })}
                value={customization.featuredLinkId ?? ""}
              >
                <option value="">No featured link</option>
                {customization.featuredLinkId && !featuredLink ? (
                  <option value={customization.featuredLinkId}>Unavailable featured link</option>
                ) : null}
                {links.map((link) => (
                  <option disabled={!link.enabled} key={link.id} value={link.id}>
                    {link.label}
                    {!link.enabled ? " (disabled)" : ""}
                  </option>
                ))}
              </SelectField>
              {featuredUnavailable ? (
                <div id={errorId("featured-link")} role="alert">
                  <Notice>
                    The selected featured link is missing or disabled. It will appear as a normal
                    link, and this will not block publication.
                    <span className="mt-3 block">
                      <Button
                        onClick={() => update({ featuredLinkId: undefined })}
                        type="button"
                        variant="quiet"
                      >
                        Clear featured link
                      </Button>
                    </span>
                  </Notice>
                </div>
              ) : null}
            </div>
          </SectionRow>

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
        </>
      ) : (
        <Notice>
          Featured link and About/Services become available after choosing Warm Studio in Customize.
        </Notice>
      )}
    </div>
  );
}
