"use client";

import { useId, useState, type ReactNode } from "react";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";

import type { ProfileCustomization, ProfileSection } from "@/lib/profile-customization";
import { DEFAULT_WARM_STUDIO_CUSTOMIZATION } from "@/lib/profile-customization";
import type { ProfileLink } from "@/lib/domain";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ProfileMediaEditor } from "@/components/forms/ProfileMediaEditor";
import type { ProfileMediaImage, ProfileMediaPresentation } from "@/lib/profile-media";

export type ProfileCustomizationEditorProps = {
  customization?: ProfileCustomization;
  links: readonly ProfileLink[];
  onChange: (next: ProfileCustomization | undefined) => void;
  errors?: readonly string[];
  identityContent?: ReactNode;
  media?: ProfileMediaPresentation;
  onMediaChange?: (next: ProfileMediaPresentation | undefined) => void;
  onMediaUpload?: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  mediaBusy?: boolean;
  mediaError?: string;
};

type SectionName = "identity" | "contact" | "about" | "style" | "media" | "review";

const sectionLabels: Record<SectionName, string> = {
  identity: "Identity",
  contact: "Contact and links",
  about: "About or Services",
  style: "Style",
  media: "Media",
  review: "Review and publish",
};

const radioClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-tapit border px-3.5 py-3 text-sm transition focus-within:ring-2 focus-within:ring-tapit-accent/30";

function RadioChoice({
  checked,
  children,
  name,
  onChange,
  value,
  ariaDescribedBy,
}: {
  checked: boolean;
  children: React.ReactNode;
  name: string;
  onChange: () => void;
  value: string;
  ariaDescribedBy?: string;
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
  panelDescription,
}: {
  children: React.ReactNode;
  id: string;
  name: SectionName;
  onToggle: () => void;
  open: boolean;
  panelDescription?: string;
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
        {panelDescription ? (
          <p className="sr-only" id={panelDescription}>
            {sectionLabels[name]} guidance
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function copyCustomization(customization: ProfileCustomization): ProfileCustomization {
  return {
    ...customization,
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

export function ProfileCustomizationEditor({
  customization,
  errors = [],
  links,
  onChange,
  identityContent,
  media,
  onMediaChange,
  onMediaUpload,
  mediaBusy,
  mediaError,
}: ProfileCustomizationEditorProps) {
  const baseId = useId();
  const [openSections, setOpenSections] = useState<Record<SectionName, boolean>>({
    identity: true,
    contact: true,
    about: true,
    style: true,
    media: false,
    review: true,
  });

  function toggle(name: SectionName) {
    setOpenSections((current) => ({ ...current, [name]: !current[name] }));
  }

  function update(patch: Partial<ProfileCustomization>) {
    if (customization) onChange({ ...copyCustomization(customization), ...patch });
  }

  function updateSection(section: ProfileSection | undefined) {
    if (customization) onChange({ ...copyCustomization(customization), section });
  }

  if (!customization) {
    return (
      <div className="grid gap-3">
        {identityContent ? (
          <SectionRow
            id={`${baseId}-identity`}
            name="identity"
            onToggle={() => toggle("identity")}
            open={openSections.identity}
          >
            {identityContent}
          </SectionRow>
        ) : null}
        <div className="grid gap-4 rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5">
          <Notice>
            This profile still uses its legacy appearance. Choose Warm Studio when you are ready to
            use the guided customization controls. Media controls appear after you opt in.
          </Notice>
          <Button
            onClick={() => onChange(copyCustomization(DEFAULT_WARM_STUDIO_CUSTOMIZATION))}
            type="button"
            variant="secondary"
          >
            Use Warm Studio
          </Button>
        </div>
      </div>
    );
  }

  const section = customization.section;
  const featuredLink = customization.featuredLinkId
    ? links.find((link) => link.id === customization.featuredLinkId)
    : undefined;
  const featuredUnavailable = Boolean(customization.featuredLinkId && !featuredLink?.enabled);
  const errorId = (name: string) => `${baseId}-${name}-error`;
  const findError = (...needles: string[]) =>
    errors.find((error) => needles.some((needle) => error.toLowerCase().includes(needle)));
  const featuredError = featuredUnavailable
    ? "The selected featured link is missing or disabled. It will appear as a normal link."
    : undefined;
  const presetError = findError("preset");
  const accentError = findError("accent");
  const scaleError = findError("type scale");
  const treatmentError = findError("link treatment");
  const orderError = findError("content order");
  const kindError = findError("section kind", "section is invalid");
  const bodyError = findError("section body", "about section body", "services section body");
  const itemError = findError("service item", "services items");
  const setKind = (kind: "about" | "services") => {
    updateSection(
      kind === "about"
        ? { kind, body: section?.kind === "about" ? section.body : "" }
        : {
            kind,
            body: section?.kind === "services" ? section.body : "",
            items: section?.kind === "services" ? [...(section.items ?? [])] : [],
          },
    );
  };

  return (
    <div className="grid gap-3">
      {identityContent ? (
        <SectionRow
          id={`${baseId}-identity`}
          name="identity"
          onToggle={() => toggle("identity")}
          open={openSections.identity}
        >
          {identityContent}
        </SectionRow>
      ) : null}
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
                The selected featured link is missing or disabled. It will appear as a normal link,
                and this will not block publication.
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
                checked={section?.kind === "about"}
                aria-describedby={kindError ? errorId("kind") : undefined}
                name={`${baseId}-kind`}
                onChange={() => setKind("about")}
                value="about"
              >
                About
              </RadioChoice>
              <RadioChoice
                checked={section?.kind === "services"}
                aria-describedby={kindError ? errorId("kind") : undefined}
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
              id={`${baseId}-about-copy`}
              error={bodyError}
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

      <SectionRow
        id={`${baseId}-style`}
        name="style"
        onToggle={() => toggle("style")}
        open={openSections.style}
      >
        <div className="grid gap-5">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-tapit-ink">Preset</legend>
            {presetError ? (
              <p className="sr-only" id={errorId("preset")} role="alert">
                {presetError}
              </p>
            ) : null}
            <RadioChoice
              ariaDescribedBy={presetError ? errorId("preset") : undefined}
              checked
              name={`${baseId}-preset`}
              onChange={() => undefined}
              value="warm-studio"
            >
              Warm Studio
            </RadioChoice>
          </fieldset>
          <ChoiceGroup
            label="Accent"
            name={`${baseId}-accent`}
            options={[
              ["coral", "Coral"],
              ["jade", "Jade"],
              ["ink", "Ink"],
            ]}
            value={customization.accent}
            onChange={(value) => update({ accent: value })}
            error={accentError}
          />
          <ChoiceGroup
            label="Type scale"
            name={`${baseId}-scale`}
            options={[
              ["compact", "Compact"],
              ["comfortable", "Comfortable"],
              ["editorial", "Editorial"],
            ]}
            value={customization.typeScale}
            onChange={(value) => update({ typeScale: value })}
            error={scaleError}
          />
          <ChoiceGroup
            label="Link/button treatment"
            name={`${baseId}-treatment`}
            options={[
              ["filled", "Filled"],
              ["outlined", "Outlined"],
            ]}
            value={customization.linkTreatment}
            onChange={(value) => update({ linkTreatment: value })}
            error={treatmentError}
          />
          <ChoiceGroup
            label="Content order"
            name={`${baseId}-order`}
            options={[
              ["links-first", "Links first"],
              ["section-first", "About/Services first"],
            ]}
            value={customization.contentOrder}
            onChange={(value) => update({ contentOrder: value })}
            error={orderError}
          />
        </div>
      </SectionRow>

      {onMediaChange && onMediaUpload ? (
        <SectionRow
          id={`${baseId}-media`}
          name="media"
          onToggle={() => toggle("media")}
          open={openSections.media}
          panelDescription={`${baseId}-media-guidance`}
        >
          <ProfileMediaEditor
            busy={mediaBusy}
            error={mediaError}
            media={media}
            onChange={onMediaChange}
            onUpload={onMediaUpload}
          />
        </SectionRow>
      ) : null}

      <SectionRow
        id={`${baseId}-review`}
        name="review"
        onToggle={() => toggle("review")}
        open={openSections.review}
      >
        {errors.length > 0 ? (
          <ul className="grid gap-2 text-sm text-tapit-muted">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-6 text-tapit-muted">
            Review your changes, then use the page actions to save a draft or publish.
          </p>
        )}
        {featuredUnavailable ? (
          <p className="mt-3 text-sm text-tapit-danger">
            Your featured link needs attention, but publication remains available.
          </p>
        ) : null}
      </SectionRow>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  options: readonly (readonly [T, string])[];
  value: T;
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-semibold text-tapit-ink">{label}</legend>
      {error ? (
        <p className="text-sm font-medium text-tapit-danger" id={`${name}-error`} role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map(([option, text]) => (
          <RadioChoice
            checked={value === option}
            ariaDescribedBy={error ? `${name}-error` : undefined}
            key={option}
            name={name}
            onChange={() => onChange(option)}
            value={option}
          >
            {text}
          </RadioChoice>
        ))}
      </div>
    </fieldset>
  );
}
