"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";

import type { ProfileTheme } from "@/lib/domain";
import {
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  type ProfileCustomization,
  type ProfileContactDisplay,
  type ProfileIdentityColor,
  type ProfileIdentityField,
} from "@/lib/profile-customization";
import {
  PROFILE_CUSTOMIZATION_CATEGORIES,
  classifyProfileWorkspaceError,
  type ProfileCustomizationCategory,
} from "@/lib/profile-workspace";
import type { ProfileMediaImage, ProfileMediaPresentation } from "@/lib/profile-media";
import { ProfileIdentityColorPicker } from "@/components/forms/ProfileIdentityColorPicker";
import { ProfileMediaEditor } from "@/components/forms/ProfileMediaEditor";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type ProfileCustomizationEditorProps = {
  customization?: ProfileCustomization;
  errors?: readonly string[];
  media?: ProfileMediaPresentation;
  mediaBusy?: boolean;
  mediaError?: string;
  onChange: (next: ProfileCustomization | undefined) => void;
  onMediaChange?: (next: ProfileMediaPresentation | undefined) => void;
  onMediaUpload?: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  onThemeChange?: (theme: ProfileTheme) => void;
  theme?: ProfileTheme;
};

const categoryLabels: Record<ProfileCustomizationCategory, string> = {
  overview: "Overview",
  identity: "Identity",
  media: "Media",
  layout: "Layout",
};

const radioClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-tapit border px-3.5 py-3 text-sm transition focus-within:ring-2 focus-within:ring-tapit-accent/30";
const LARGE_VIEWPORT_QUERY = "(min-width: 1024px)";

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

function IdentityColorControls({
  customization,
  errorFor,
  allowWhite,
  onChange,
}: {
  customization: ProfileCustomization;
  errorFor: (field: ProfileIdentityField) => string | undefined;
  allowWhite: boolean;
  onChange: (next: ProfileCustomization) => void;
}) {
  function setColor(field: ProfileIdentityField, color: ProfileIdentityColor | undefined) {
    const identityColors = { ...(customization.identityColors ?? {}) };
    if (color === undefined) delete identityColors[field];
    else identityColors[field] = color;
    onChange({
      ...copyCustomization(customization),
      identityColors: Object.keys(identityColors).length > 0 ? identityColors : undefined,
    });
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-tapit-ink">Identity colors</legend>
      <p className="text-sm leading-6 text-tapit-muted">
        Set the name and bio / role independently. These colors affect Warm Studio identity text
        only.
      </p>
      <div className="grid gap-4 rounded-tapit border border-tapit-line/70 bg-tapit-paper/60 p-3.5 sm:p-4">
        {(["name", "bio"] as const).map((field) => (
          <ProfileIdentityColorPicker
            allowWhite={allowWhite}
            error={errorFor(field)}
            field={field}
            key={field}
            onChange={(color) => setColor(field, color)}
            value={customization.identityColors?.[field]}
          />
        ))}
      </div>
    </fieldset>
  );
}

function LegacyThemeCards({
  onThemeChange,
  theme,
}: {
  onThemeChange?: (theme: ProfileTheme) => void;
  theme?: ProfileTheme;
}) {
  const options: readonly [ProfileTheme, string][] = [
    ["paper", "Paper"],
    ["moss", "Moss"],
    ["night", "Night"],
  ];

  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-tapit-muted">
        This profile still uses its legacy appearance. Choose Warm Studio when you are ready to use
        the guided customization controls.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map(([value, label]) => (
          <button
            aria-pressed={(theme ?? "paper") === value}
            className={`rounded-tapit border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent ${
              (theme ?? "paper") === value
                ? "border-tapit-accent bg-tapit-accent-soft"
                : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"
            }`}
            key={value}
            onClick={() => onThemeChange?.(value)}
            type="button"
          >
            <span
              className={`block h-12 rounded-tapit ${
                value === "paper"
                  ? "bg-tapit-paper"
                  : value === "moss"
                    ? "bg-[#e8f1eb]"
                    : "bg-[#17211f]"
              }`}
            />
            <span className="mt-3 block text-sm font-semibold text-tapit-ink">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CategoryErrorIndicator({
  category,
  errorId,
}: {
  category: ProfileCustomizationCategory;
  errorId: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-tapit-danger">
      <WarningCircleIcon aria-hidden="true" size={16} weight="bold" />
      <span id={errorId}>Needs attention</span>
      <span className="sr-only"> in {categoryLabels[category]}</span>
    </span>
  );
}

function CategoryErrorList({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul
      className="grid gap-2 rounded-tapit border border-tapit-danger/30 bg-[#fff1f0] px-4 py-3 text-sm text-tapit-danger"
      role="alert"
    >
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

export function ProfileCustomizationEditor({
  customization,
  errors = [],
  media,
  mediaBusy,
  mediaError,
  onChange,
  onMediaChange,
  onMediaUpload,
  onThemeChange,
  theme,
}: ProfileCustomizationEditorProps) {
  type CategoryFocusTarget = "panel" | "tab";

  const baseId = useId();
  const panelRefs = useRef<Partial<Record<ProfileCustomizationCategory, HTMLElement | null>>>({});
  const tabRefs = useRef<Partial<Record<ProfileCustomizationCategory, HTMLButtonElement | null>>>(
    {},
  );
  const focusTargetRef = useRef<CategoryFocusTarget | null>(null);
  const focusOverviewAfterTransitionRef = useRef(false);
  const [selectedCategory, setSelectedCategory] =
    useState<ProfileCustomizationCategory>("overview");
  const [tablistOrientation, setTablistOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  );
  const activeCategory = customization ? selectedCategory : "overview";

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(LARGE_VIEWPORT_QUERY);
    const updateOrientation = () =>
      setTablistOrientation(query.matches ? "vertical" : "horizontal");
    updateOrientation();
    query.addEventListener?.("change", updateOrientation);
    return () => query.removeEventListener?.("change", updateOrientation);
  }, []);

  useEffect(() => {
    const focusTarget = focusTargetRef.current;
    focusTargetRef.current = null;
    if (focusTarget === "panel") panelRefs.current[activeCategory]?.focus();
  }, [activeCategory]);

  useEffect(() => {
    if (!customization || !focusOverviewAfterTransitionRef.current) return;
    focusOverviewAfterTransitionRef.current = false;
    panelRefs.current.overview?.focus();
  }, [customization]);

  const errorsFor = (category: ProfileCustomizationCategory) =>
    errors.filter((error) => classifyProfileWorkspaceError(error) === category);
  const categoryErrors = Object.fromEntries(
    PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => [category, errorsFor(category)]),
  ) as Record<ProfileCustomizationCategory, string[]>;
  const mediaCategoryErrors = categoryErrors.media.filter((error) => error !== mediaError);
  const categoryHasErrors: Record<ProfileCustomizationCategory, boolean> = {
    overview: categoryErrors.overview.length > 0,
    identity: categoryErrors.identity.length > 0,
    media: categoryErrors.media.length > 0 || Boolean(mediaError),
    layout: categoryErrors.layout.length > 0,
  };

  function update(patch: Partial<ProfileCustomization>) {
    if (customization) onChange(copyCustomization({ ...customization, ...patch }));
  }

  const errorId = (name: string) => `${baseId}-${name}-error`;
  const findError = (...needles: string[]) =>
    errors.find((error) => needles.some((needle) => error.toLowerCase().includes(needle)));
  const presetError = findError("profile customization preset");
  const accentError = findError("profile customization accent");
  const scaleError = findError("profile customization type scale");
  const treatmentError = findError("profile customization link treatment");
  const orderError = findError("profile customization content order");
  const contactDisplayError = findError("profile customization contact display");
  const identityColorError = (field: ProfileIdentityField) =>
    field === "name"
      ? findError("profile name color", "profile name custom color")
      : findError("profile bio color", "profile bio custom color");

  function setCategory(category: ProfileCustomizationCategory) {
    if (customization || category === "overview") setSelectedCategory(category);
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    category: ProfileCustomizationCategory,
  ) {
    const enabledCategories = PROFILE_CUSTOMIZATION_CATEGORIES.filter(
      (candidate) => customization || candidate === "overview",
    );
    const currentIndex = enabledCategories.indexOf(category);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    const movesForward =
      (tablistOrientation === "horizontal" && event.key === "ArrowRight") ||
      (tablistOrientation === "vertical" && event.key === "ArrowDown");
    const movesBackward =
      (tablistOrientation === "horizontal" && event.key === "ArrowLeft") ||
      (tablistOrientation === "vertical" && event.key === "ArrowUp");
    if (movesForward) {
      nextIndex = (currentIndex + 1) % enabledCategories.length;
    } else if (movesBackward) {
      nextIndex = (currentIndex - 1 + enabledCategories.length) % enabledCategories.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledCategories.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextCategory = enabledCategories[nextIndex];
    if (!nextCategory) return;
    focusTargetRef.current = "tab";
    setCategory(nextCategory);
    tabRefs.current[nextCategory]?.focus();
  }

  function handleTabClick(category: ProfileCustomizationCategory) {
    focusTargetRef.current = "panel";
    setCategory(category);
    if (activeCategory === category) {
      panelRefs.current[category]?.focus();
      focusTargetRef.current = null;
    }
  }

  function optIntoWarmStudio() {
    focusOverviewAfterTransitionRef.current = true;
    setSelectedCategory("overview");
    onChange(copyCustomization(DEFAULT_WARM_STUDIO_CUSTOMIZATION));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[9rem_minmax(0,1fr)]">
      <nav
        aria-label="Customization categories"
        aria-orientation={tablistOrientation}
        className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:grid lg:content-start"
        role="tablist"
      >
        {PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => {
          const selected = activeCategory === category;
          const tabStatusId = `${baseId}-tab-${category}-status`;
          const disabled = !customization && category !== "overview";
          return (
            <button
              aria-controls={`${baseId}-panel-${category}`}
              aria-describedby={categoryHasErrors[category] ? tabStatusId : undefined}
              aria-label={categoryLabels[category]}
              aria-selected={selected}
              className={`flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-tapit border px-3 text-left text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-tapit-accent lg:w-full ${
                selected
                  ? "border-tapit-accent bg-tapit-accent-soft text-tapit-ink"
                  : "border-tapit-line bg-tapit-surface text-tapit-muted hover:border-tapit-accent hover:text-tapit-ink"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              disabled={disabled}
              id={`${baseId}-tab-${category}`}
              key={category}
              onClick={() => handleTabClick(category)}
              onKeyDown={(event) => handleTabKeyDown(event, category)}
              ref={(element) => {
                tabRefs.current[category] = element;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              <span>{categoryLabels[category]}</span>
              {categoryHasErrors[category] ? (
                <CategoryErrorIndicator category={category} errorId={tabStatusId} />
              ) : null}
            </button>
          );
        })}
      </nav>

      {PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => (
        <section
          aria-labelledby={`${baseId}-tab-${category}`}
          aria-label={`${categoryLabels[category]} settings`}
          className="outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent focus-visible:ring-offset-4"
          hidden={activeCategory !== category}
          id={`${baseId}-panel-${category}`}
          key={category}
          ref={(element) => {
            panelRefs.current[category] = element;
          }}
          role="tabpanel"
          tabIndex={-1}
        >
          {category === "overview" ? (
            <div className="grid gap-5">
              {customization ? (
                <>
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
                    error={accentError}
                    label="Accent"
                    name={`${baseId}-accent`}
                    onChange={(value) => update({ accent: value })}
                    options={[
                      ["coral", "Coral"],
                      ["jade", "Jade"],
                      ["ink", "Ink"],
                    ]}
                    value={customization.accent}
                  />
                  <ChoiceGroup
                    error={scaleError}
                    label="Type scale"
                    name={`${baseId}-scale`}
                    onChange={(value) => update({ typeScale: value })}
                    options={[
                      ["compact", "Compact"],
                      ["comfortable", "Comfortable"],
                      ["editorial", "Editorial"],
                    ]}
                    value={customization.typeScale}
                  />
                  <ChoiceGroup
                    error={treatmentError}
                    label="Link/button treatment"
                    name={`${baseId}-treatment`}
                    onChange={(value) => update({ linkTreatment: value })}
                    options={[
                      ["filled", "Filled"],
                      ["outlined", "Outlined"],
                    ]}
                    value={customization.linkTreatment}
                  />
                </>
              ) : (
                <div className="grid gap-5 rounded-tapit border border-tapit-line bg-tapit-surface p-4 sm:p-5">
                  <LegacyThemeCards onThemeChange={onThemeChange} theme={theme} />
                  <Notice>
                    Media and the guided visual controls become available after you opt into Warm
                    Studio.
                  </Notice>
                  <Button onClick={optIntoWarmStudio} type="button" variant="secondary">
                    Use Warm Studio
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {category === "identity" && customization ? (
            <div className="grid gap-5">
              <IdentityColorControls
                allowWhite={media?.background !== undefined}
                customization={customization}
                errorFor={identityColorError}
                onChange={onChange}
              />
            </div>
          ) : null}

          {category === "media" ? (
            <div className="grid gap-5">
              <CategoryErrorList errors={mediaCategoryErrors} />
              {onMediaChange && onMediaUpload ? (
                <ProfileMediaEditor
                  busy={mediaBusy}
                  error={mediaError}
                  media={media}
                  onChange={onMediaChange}
                  onUpload={onMediaUpload}
                />
              ) : (
                <Notice tone={mediaError ? "error" : "neutral"}>
                  {mediaError ? <span className="block">{mediaError}</span> : null}
                  <span>
                    Media controls are unavailable because both media change and upload handlers are
                    required.
                  </span>
                </Notice>
              )}
            </div>
          ) : null}

          {category === "layout" && customization ? (
            <div className="grid gap-5">
              <ChoiceGroup
                error={orderError}
                label="Content order"
                name={`${baseId}-order`}
                onChange={(value) => update({ contentOrder: value })}
                options={[
                  ["links-first", "Links first"],
                  ["section-first", "About/Services first"],
                ]}
                value={customization.contentOrder}
              />
              <ChoiceGroup<ProfileContactDisplay>
                error={contactDisplayError}
                label="Contact info display"
                name={`${baseId}-contact-display`}
                onChange={(value) => update({ contactDisplay: value })}
                options={[
                  ["labels", "Icon + label"],
                  ["icons-circle", "Icons · circles"],
                  ["icons-soft-square", "Icons · soft squares"],
                ]}
                value={customization.contactDisplay ?? "labels"}
              />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
