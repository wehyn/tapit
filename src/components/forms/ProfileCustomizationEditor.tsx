"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { ProfileTheme } from "@/lib/domain";
import {
  DEFAULT_CUSTOM_PROFILE_COLORS,
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
  IDENTITY_COLOR_PALETTE,
  defaultProfileLayoutOrder,
  isProfileIdentityHex,
  type ProfileCustomization,
  type ProfileContactDisplay,
  type ProfileIdentityColor,
  type ProfileIdentityField,
  type ProfileThemeColors,
} from "@/lib/profile-customization";
import {
  PROFILE_CUSTOMIZATION_CATEGORIES,
  classifyProfileWorkspaceError,
  type ProfileCustomizationCategory,
  type ProfileCustomizationFocusRequest,
} from "@/lib/profile-workspace";
import type { ProfileMediaImage, ProfileMediaPresentation } from "@/lib/profile-media";
import type { PendingProfileMediaUpload } from "@/lib/profile-media-preview";
import { ProfileIdentityColorPicker } from "@/components/forms/ProfileIdentityColorPicker";
import { ProfileMediaEditor } from "@/components/forms/ProfileMediaEditor";
import { ProfileLayoutOrderEditor } from "@/components/forms/ProfileLayoutOrderEditor";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { segmentedClass, segmentedItemClass } from "@/components/ui/Segmented";

export type ProfileCustomizationEditorProps = {
  barePanels?: boolean;
  customization?: ProfileCustomization;
  errors?: readonly string[];
  categoryFocusRequest?: ProfileCustomizationFocusRequest;
  media?: ProfileMediaPresentation;
  mediaBusy?: boolean;
  mediaError?: string;
  onChange: (next: ProfileCustomization | undefined) => void;
  onMediaChange?: (next: ProfileMediaPresentation | undefined) => void;
  onMediaPendingPreviewChange?: (pending: PendingProfileMediaUpload[]) => void;
  onMediaErrorClear?: () => void;
  onMediaUploadCancel?: () => void;
  onMediaUpload?: (file: File, target: "background" | "slideshow") => Promise<ProfileMediaImage>;
  onThemeChange?: (theme: ProfileTheme) => void;
  theme?: ProfileTheme;
};

const categoryLabels: Record<ProfileCustomizationCategory, string> = {
  overview: "Overview",
  identity: "Identity",
  media: "Media",
  slideshow: "Slideshow",
  layout: "Layout",
};

const PROFILE_CUSTOMIZATION_PANEL_CATEGORIES = PROFILE_CUSTOMIZATION_CATEGORIES.filter(
  (category) => category !== "slideshow",
);

function groupClass(barePanels: boolean) {
  return barePanels
    ? "flex min-w-0 flex-col gap-4 rounded-card bg-tapit-surface p-6 shadow-card"
    : "flex min-w-0 flex-col gap-4";
}

const groupLegendClass = "pb-4 text-lg font-semibold text-tapit-ink";
const groupDescriptionClass = "-mt-2 text-sm text-tapit-muted";
const hintClass = "text-xs text-tapit-muted";
const keyboardFocusRingClass =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tapit-focus has-[:focus-visible]:ring-offset-2";

function SelectedCheck() {
  return (
    <span className="grid size-5 place-items-center rounded-full bg-tapit-surface text-tapit-ink">
      <Icon className="size-3" name="check" weight="bold" />
    </span>
  );
}

type ProfileAppearancePreset = ProfileTheme | "warm-studio";

const appearancePresets: readonly {
  value: ProfileAppearancePreset;
  label: string;
  description: string;
  colors: ProfileThemeColors;
}[] = [
  {
    value: "paper",
    label: "Soft Precision (Paper)",
    description: "Cool neutrals, rounded surfaces, and a clear blue accent.",
    colors: {
      canvas: "#f4f6fa",
      surface: "#ffffff",
      ink: "#1b2433",
      accent: "#3f6de8",
    },
  },
  {
    value: "moss",
    label: "Moss",
    description: "Soft green surfaces with a deep botanical accent.",
    colors: {
      canvas: "#e8f1eb",
      surface: "#f7fbf8",
      ink: "#17352b",
      accent: "#176b57",
    },
  },
  {
    value: "night",
    label: "Night",
    description: "Deep evergreen surfaces and calm, high-contrast details.",
    colors: {
      canvas: "#17211f",
      surface: "#22302b",
      ink: "#f2f6f1",
      accent: "#7bc2a9",
    },
  },
  {
    value: "warm-studio",
    label: "Warm Studio",
    description: "Warm editorial tones and an edge-to-edge profile layout.",
    colors: {
      canvas: "#fbf6ef",
      surface: "#fffdf9",
      ink: "#2c2420",
      accent: "#3e806d",
    },
  },
  {
    value: "custom",
    label: "Custom",
    description: "Choose your own page, surface, text, and link colors, plus profile settings.",
    colors: DEFAULT_CUSTOM_PROFILE_COLORS,
  },
];

function PresetRadio({
  value,
  label,
  description,
  colors,
  checked,
  disabled,
  name,
  ariaDescribedBy,
  onChange,
}: {
  value: ProfileAppearancePreset;
  label: string;
  description: string;
  colors: (typeof appearancePresets)[number]["colors"];
  checked: boolean;
  disabled: boolean;
  name: string;
  ariaDescribedBy?: string;
  onChange: (value: ProfileAppearancePreset) => void;
}) {
  return (
    <label
      className={`relative flex cursor-pointer flex-col gap-3 rounded-control p-3 transition-colors ${keyboardFocusRingClass} ${
        disabled ? "cursor-not-allowed opacity-55" : ""
      } ${checked ? "bg-tapit-accent-soft text-tapit-accent-strong" : "bg-tapit-soft-surface text-tapit-ink"}`}
    >
      <input
        aria-describedby={ariaDescribedBy}
        aria-label={label}
        checked={checked}
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        name={name}
        onChange={() => onChange(value)}
        type="radio"
        value={value}
      />
      <span
        aria-hidden="true"
        className="flex h-24 flex-col items-center justify-center gap-2 rounded-control"
        style={{ backgroundColor: colors.canvas }}
      >
        <span className="size-7 rounded-full" style={{ backgroundColor: colors.accent }} />
        <span className="h-2 w-14 rounded-full" style={{ backgroundColor: colors.ink }} />
        <span className="h-3 w-18 rounded-full" style={{ backgroundColor: colors.surface }} />
      </span>
      <span className="flex flex-col gap-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {checked ? <Icon className="size-4 shrink-0" name="check" weight="bold" /> : null}
        </span>
        <span className="text-xs text-tapit-muted">{description}</span>
      </span>
    </label>
  );
}

function ChoiceGroup<T extends string>({
  barePanels,
  error,
  hint,
  label,
  name,
  onChange,
  options,
  value,
}: {
  barePanels: boolean;
  error?: string;
  hint?: string;
  label: string;
  name: string;
  onChange: (value: T) => void;
  options: readonly (readonly [value: T, label: string, swatch?: string])[];
  value: T;
}) {
  const swatches = options.some(([, , swatch]) => swatch !== undefined);
  return (
    <div className={groupClass(barePanels)}>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className={groupLegendClass}>{label}</legend>
        {error ? (
          <p className="text-sm font-medium text-tapit-danger" id={`${name}-error`} role="alert">
            {error}
          </p>
        ) : null}
        <div
          className={
            swatches ? "flex flex-wrap gap-3" : `${segmentedClass("soft")} flex-wrap self-start`
          }
        >
          {options.map(([option, text, swatch]) => {
            const checked = value === option;
            return (
              <label
                className={`relative cursor-pointer ${keyboardFocusRingClass} ${
                  swatches
                    ? "grid size-11 place-items-center rounded-full shadow-card"
                    : segmentedItemClass(checked)
                }`}
                key={option}
                style={swatch ? { backgroundColor: swatch } : undefined}
                title={swatches ? text : undefined}
              >
                <input
                  aria-describedby={error ? `${name}-error` : undefined}
                  checked={checked}
                  className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                  name={name}
                  onChange={() => onChange(option)}
                  type="radio"
                  value={option}
                />
                <span className={swatches ? "sr-only" : undefined}>{text}</span>
                {swatches && checked ? <SelectedCheck /> : null}
              </label>
            );
          })}
        </div>
        {hint ? <p className={hintClass}>{hint}</p> : null}
      </fieldset>
    </div>
  );
}

function copyCustomization(customization: ProfileCustomization): ProfileCustomization {
  return {
    ...customization,
    ...(customization.layoutOrder ? { layoutOrder: [...customization.layoutOrder] } : {}),
    ...(customization.customColors ? { customColors: { ...customization.customColors } } : {}),
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
  barePanels,
  onChange,
}: {
  customization: ProfileCustomization;
  errorFor: (field: ProfileIdentityField) => string | undefined;
  allowWhite: boolean;
  barePanels: boolean;
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
    <div className={groupClass(barePanels)}>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className={groupLegendClass}>Identity colors</legend>
        <p className={groupDescriptionClass}>
          Set the name and bio / role independently for this profile preset.
        </p>
        {(["name", "bio"] as const).map((field) => (
          <ProfileIdentityColorPicker
            allowWhite={allowWhite}
            barePanels={barePanels}
            error={errorFor(field)}
            field={field}
            key={field}
            onChange={(color) => setColor(field, color)}
            value={customization.identityColors?.[field]}
          />
        ))}
      </fieldset>
    </div>
  );
}

const customColorFields: readonly (readonly [keyof ProfileThemeColors, string])[] = [
  ["canvas", "Page background"],
  ["surface", "Profile surface"],
  ["ink", "Profile text"],
  ["accent", "Profile accent"],
];

function CustomPaletteColorField({
  field,
  label,
  value,
  barePanels,
  onChange,
}: {
  field: keyof ProfileThemeColors;
  label: string;
  value: string;
  barePanels: boolean;
  onChange: (field: keyof ProfileThemeColors, value: string) => void;
}) {
  const [draftHex, setDraftHex] = useState(value);
  const color = barePanels
    ? (isProfileIdentityHex(draftHex) ? draftHex : value).toLowerCase()
    : isProfileIdentityHex(draftHex)
      ? draftHex
      : value;

  function commit(next: string) {
    setDraftHex(next);
    if (isProfileIdentityHex(next)) onChange(field, next.toLowerCase());
  }

  return (
    <label
      className={
        barePanels
          ? "grid min-w-0 gap-2"
          : "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      }
    >
      <span className="text-sm font-semibold text-tapit-ink">{label}</span>
      <span className="flex items-center gap-3">
        {barePanels ? (
          <span className="relative size-11 shrink-0">
            <input
              aria-label={`${label} color`}
              className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 focus-visible:outline-none"
              onChange={(event) => commit(event.target.value)}
              type="color"
              value={color}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-tapit-focus peer-focus-visible:ring-offset-2"
              style={{ backgroundColor: color }}
            />
          </span>
        ) : (
          <input
            aria-label={`${label} color`}
            className="size-11 shrink-0 cursor-pointer rounded-control bg-tapit-soft-surface p-1"
            onChange={(event) => commit(event.target.value)}
            type="color"
            value={color}
          />
        )}
        <input
          aria-label={`${label} hex`}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-h-11 w-32 rounded-control bg-tapit-soft-surface px-4 font-mono text-sm uppercase text-tapit-ink transition-colors focus:bg-tapit-surface focus:outline-3 focus:outline-offset-2 focus:outline-tapit-accent"
          maxLength={7}
          onChange={(event) => commit(event.target.value)}
          pattern="^#[0-9a-fA-F]{6}$"
          spellCheck={false}
          value={draftHex}
        />
      </span>
      {!isProfileIdentityHex(draftHex) ? (
        <span className="text-xs text-tapit-danger sm:col-span-2">Enter a 6-digit hex color.</span>
      ) : null}
    </label>
  );
}

function CustomPaletteControls({
  customization,
  error,
  barePanels,
  onChange,
}: {
  customization: ProfileCustomization;
  error?: string;
  barePanels: boolean;
  onChange: (next: ProfileCustomization) => void;
}) {
  const colors = customization.customColors ?? DEFAULT_CUSTOM_PROFILE_COLORS;

  function updateColor(field: keyof ProfileThemeColors, color: string) {
    onChange({
      ...copyCustomization(customization),
      customColors: { ...colors, [field]: color },
    });
  }

  return (
    <div className={`${groupClass(barePanels)} @2xl:col-span-2`}>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className={groupLegendClass}>Custom palette</legend>
        <p className={groupDescriptionClass}>
          Choose the page, profile card, text, and outlined link colors. Text and links must stay
          readable against their surfaces.
        </p>
        <div className={barePanels ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
          {customColorFields.map(([field, label]) => (
            <CustomPaletteColorField
              barePanels={barePanels}
              field={field}
              key={field}
              label={label}
              onChange={updateColor}
              value={colors[field]}
            />
          ))}
        </div>
        {error ? (
          <p className="text-sm font-medium text-tapit-danger" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
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
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-tapit-danger">
      <Icon className="size-4" name="warning" weight="bold" />
      <span id={errorId}>Needs attention</span>
      <span className="sr-only"> in {categoryLabels[category]}</span>
    </span>
  );
}

function CategoryErrorList({ errors }: { errors: readonly string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul
      className="grid gap-2 rounded-control bg-tapit-danger-soft p-4 text-sm text-tapit-danger"
      role="alert"
    >
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

export function ProfileCustomizationEditor({
  barePanels = false,
  customization,
  errors = [],
  categoryFocusRequest,
  media,
  mediaBusy,
  mediaError,
  onChange,
  onMediaChange,
  onMediaPendingPreviewChange,
  onMediaErrorClear,
  onMediaUploadCancel,
  onMediaUpload,
  onThemeChange,
  theme,
}: ProfileCustomizationEditorProps) {
  type CategoryFocusTarget = "panel" | "tab";
  type CategorySelection = {
    category: ProfileCustomizationCategory;
    categoryFocusSequence: number;
  };

  const baseId = useId();
  const panelRefs = useRef<Partial<Record<ProfileCustomizationCategory, HTMLElement | null>>>({});
  const tabRefs = useRef<Partial<Record<ProfileCustomizationCategory, HTMLButtonElement | null>>>(
    {},
  );
  const focusTargetRef = useRef<CategoryFocusTarget | null>(null);
  const handledCategoryFocusRequestRef = useRef(0);
  const focusOverviewAfterTransitionRef = useRef(false);
  const [categorySelection, setCategorySelection] = useState<CategorySelection>(() => ({
    category: categoryFocusRequest?.category ?? "overview",
    categoryFocusSequence: categoryFocusRequest?.sequence ?? 0,
  }));
  const [mediaErrorTarget, setMediaErrorTarget] = useState<"background" | "slideshow">(
    "background",
  );
  const selectedPreset: ProfileAppearancePreset =
    customization?.preset === "warm-studio" ? "warm-studio" : (theme ?? "paper");
  const activeCustomization: ProfileCustomization =
    customization?.preset === selectedPreset
      ? customization
      : {
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          preset: selectedPreset,
          ...(customization?.customColors ? { customColors: customization.customColors } : {}),
        };
  const activeCategory =
    categoryFocusRequest !== undefined &&
    categorySelection.categoryFocusSequence !== categoryFocusRequest.sequence
      ? categoryFocusRequest.category
      : categorySelection.category;
  const mediaPanelIsActive = activeCategory === "media" || activeCategory === "slideshow";
  const mediaPanelCategory = mediaPanelIsActive ? activeCategory : "media";
  const mediaEditorSection = activeCategory === "slideshow" ? "slideshow" : "background";
  const visibleMediaError = mediaErrorTarget === mediaEditorSection ? mediaError : undefined;

  useEffect(() => {
    const focusTarget = focusTargetRef.current;
    focusTargetRef.current = null;
    if (focusTarget === "panel") panelRefs.current[activeCategory]?.focus();
    return;
  }, [activeCategory]);

  useEffect(() => {
    if (
      categoryFocusRequest === undefined ||
      categoryFocusRequest.sequence <= handledCategoryFocusRequestRef.current ||
      activeCategory !== categoryFocusRequest.category
    )
      return;
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRefs.current[categoryFocusRequest.category];
      if (!panel) return;
      panel.focus();
      handledCategoryFocusRequestRef.current = categoryFocusRequest.sequence;
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeCategory, categoryFocusRequest]);

  useEffect(() => {
    if (!focusOverviewAfterTransitionRef.current) return;
    focusOverviewAfterTransitionRef.current = false;
    panelRefs.current.overview?.focus();
  }, [selectedPreset]);

  const errorsFor = (category: ProfileCustomizationCategory) =>
    errors.filter((error) => classifyProfileWorkspaceError(error) === category);
  const categoryErrors = Object.fromEntries(
    PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => [category, errorsFor(category)]),
  ) as Record<ProfileCustomizationCategory, string[]>;
  const mediaCategoryErrors = categoryErrors.media.filter((error) => error !== mediaError);
  const slideshowCategoryErrors = categoryErrors.slideshow.filter((error) => error !== mediaError);
  const categoryHasErrors: Record<ProfileCustomizationCategory, boolean> = {
    overview: categoryErrors.overview.length > 0,
    identity: categoryErrors.identity.length > 0,
    media:
      categoryErrors.media.length > 0 || Boolean(mediaError && mediaErrorTarget === "background"),
    slideshow:
      categoryErrors.slideshow.length > 0 ||
      Boolean(mediaError && mediaErrorTarget === "slideshow"),
    layout: categoryErrors.layout.length > 0,
  };

  function update(patch: Partial<ProfileCustomization>) {
    onChange(copyCustomization({ ...activeCustomization, ...patch }));
  }

  const errorId = (name: string) => `${baseId}-${name}-error`;
  const findError = (...needles: string[]) =>
    errors.find((error) => needles.some((needle) => error.toLowerCase().includes(needle)));
  const presetError = findError("profile customization preset");
  const accentError = findError("profile customization accent");
  const scaleError = findError("profile customization type scale");
  const treatmentError = findError("profile customization link treatment");
  const customColorError = findError(
    "custom profile palette",
    "custom profile text",
    "custom profile accent",
  );
  const orderError = findError(
    "profile customization content order",
    "profile customization layout order",
  );
  const contactDisplayError = findError("profile customization contact display");
  const identityColorError = (field: ProfileIdentityField) =>
    field === "name"
      ? findError("profile name color", "profile name custom color")
      : findError("profile bio color", "profile bio custom color");

  function setCategory(category: ProfileCustomizationCategory) {
    setCategorySelection({
      category,
      categoryFocusSequence: categoryFocusRequest?.sequence ?? 0,
    });
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    category: ProfileCustomizationCategory,
  ) {
    const enabledCategories = PROFILE_CUSTOMIZATION_CATEGORIES;
    const currentIndex = enabledCategories.indexOf(category);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    const movesForward = event.key === "ArrowRight";
    const movesBackward = event.key === "ArrowLeft";
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

  function applyPreset(preset: ProfileAppearancePreset) {
    setCategory("overview");
    focusOverviewAfterTransitionRef.current = true;
    onChange(
      copyCustomization({
        ...activeCustomization,
        preset,
        ...(preset === "custom"
          ? { customColors: activeCustomization.customColors ?? DEFAULT_CUSTOM_PROFILE_COLORS }
          : {}),
      }),
    );
    onThemeChange?.(preset === "warm-studio" ? "paper" : preset);
  }

  function choosePreset(preset: ProfileAppearancePreset) {
    if (preset === selectedPreset) return;
    applyPreset(preset);
  }

  const panelStackClass = barePanels ? "grid min-w-0 gap-4" : "grid min-w-0 gap-8";
  const selectedPresetColors =
    selectedPreset === "custom" && customization?.customColors
      ? customization.customColors
      : appearancePresets.find((preset) => preset.value === selectedPreset)?.colors;
  const { coral, ink, jade } = IDENTITY_COLOR_PALETTE;

  return (
    <div className="grid min-w-0 gap-6">
      <nav
        aria-label="Customization categories"
        aria-orientation="horizontal"
        className={`${segmentedClass(barePanels ? "white" : "soft")} min-w-0 max-w-full justify-self-start overflow-x-auto`}
        role="tablist"
      >
        {PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => {
          const selected = activeCategory === category;
          const tabStatusId = `${baseId}-tab-${category}-status`;
          return (
            <button
              aria-controls={`${baseId}-panel-${category === "slideshow" ? "media" : category}`}
              aria-describedby={categoryHasErrors[category] ? tabStatusId : undefined}
              aria-label={categoryLabels[category]}
              aria-selected={selected}
              className={`${segmentedItemClass(selected)} shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tapit-focus`}
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

      {PROFILE_CUSTOMIZATION_PANEL_CATEGORIES.map((category) => (
        <section
          aria-labelledby={`${baseId}-tab-${category === "media" ? mediaPanelCategory : category}`}
          aria-label={`${categoryLabels[category === "media" ? mediaPanelCategory : category]} settings`}
          className={`min-w-0 rounded-card outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent focus-visible:ring-offset-4 ${barePanels ? "focus-visible:ring-offset-tapit-paper" : ""}`}
          hidden={category === "media" ? !mediaPanelIsActive : activeCategory !== category}
          id={`${baseId}-panel-${category}`}
          key={category}
          ref={(element) => {
            panelRefs.current[category] = element;
            if (category === "media") panelRefs.current.slideshow = element;
          }}
          role="tabpanel"
          tabIndex={-1}
        >
          {category === "overview" ? (
            <div className={panelStackClass}>
              <div className={groupClass(barePanels)}>
                <fieldset className="flex min-w-0 flex-col gap-4">
                  <legend className={groupLegendClass}>Profile preset</legend>
                  <p className={groupDescriptionClass}>
                    Presets set every colour at once. You can change any of them after.
                  </p>
                  {presetError ? (
                    <p className="sr-only" id={errorId("preset")} role="alert">
                      {presetError}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {appearancePresets.map((preset) => (
                      <PresetRadio
                        ariaDescribedBy={presetError ? errorId("preset") : undefined}
                        checked={selectedPreset === preset.value}
                        colors={
                          preset.value === "custom" && customization?.customColors
                            ? customization.customColors
                            : preset.colors
                        }
                        description={preset.description}
                        disabled={preset.value !== "warm-studio" && onThemeChange === undefined}
                        key={preset.value}
                        label={preset.label}
                        name={`${baseId}-preset`}
                        onChange={choosePreset}
                        value={preset.value}
                      />
                    ))}
                  </div>
                </fieldset>
              </div>
              <details className="group">
                <summary
                  className={`flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-6 py-4 text-base font-semibold text-tapit-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tapit-focus [&::-webkit-details-marker]:hidden ${
                    barePanels ? "bg-tapit-surface shadow-card" : "bg-tapit-soft-surface"
                  }`}
                >
                  Fine tune
                  <Icon
                    className="size-4 text-tapit-muted transition-transform group-open:rotate-180"
                    name="caretDown"
                    weight="bold"
                  />
                </summary>
                <div className="mt-4 @container">
                  <div className={barePanels ? "grid gap-4 @2xl:grid-cols-2" : "grid gap-8"}>
                    {selectedPreset === "custom" ? (
                      <CustomPaletteControls
                        barePanels={barePanels}
                        customization={activeCustomization}
                        error={customColorError}
                        onChange={onChange}
                      />
                    ) : null}
                    <ChoiceGroup
                      barePanels={barePanels}
                      error={accentError}
                      label="Accent colour"
                      name={`${baseId}-accent`}
                      onChange={(value) => update({ accent: value })}
                      options={
                        selectedPreset === "custom"
                          ? [
                              ["ink", "Palette accent", selectedPresetColors?.accent],
                              ["coral", "Coral", coral.name],
                              ["jade", "Jade", jade.name],
                            ]
                          : [
                              [
                                "jade",
                                selectedPreset === "warm-studio" ? "Jade" : "Preset accent",
                                selectedPresetColors?.accent,
                              ],
                              ["coral", "Coral", coral.name],
                              ["ink", "Ink", ink.name],
                            ]
                      }
                      value={activeCustomization.accent}
                    />
                    <ChoiceGroup
                      barePanels={barePanels}
                      error={scaleError}
                      label="Type scale"
                      name={`${baseId}-scale`}
                      onChange={(value) => update({ typeScale: value })}
                      options={[
                        ["compact", "Compact"],
                        ["comfortable", "Comfortable"],
                        ["editorial", "Editorial"],
                      ]}
                      value={activeCustomization.typeScale}
                    />
                    <ChoiceGroup
                      barePanels={barePanels}
                      error={treatmentError}
                      hint="Filled uses your accent colour."
                      label="Save contact button"
                      name={`${baseId}-treatment`}
                      onChange={(value) => update({ linkTreatment: value })}
                      options={[
                        ["filled", "Filled"],
                        ["outlined", "Outlined"],
                      ]}
                      value={activeCustomization.linkTreatment}
                    />
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {category === "identity" ? (
            <IdentityColorControls
              allowWhite={media?.background !== undefined || selectedPreset === "night"}
              barePanels={barePanels}
              customization={activeCustomization}
              errorFor={identityColorError}
              onChange={onChange}
            />
          ) : null}

          {category === "media" ? (
            <div className={panelStackClass}>
              <CategoryErrorList
                errors={
                  activeCategory === "slideshow" ? slideshowCategoryErrors : mediaCategoryErrors
                }
              />
              {onMediaChange && onMediaUpload ? (
                <div className={groupClass(barePanels)}>
                  <ProfileMediaEditor
                    barePanels={barePanels}
                    busy={mediaBusy}
                    error={visibleMediaError}
                    media={media}
                    onChange={onMediaChange}
                    onMediaErrorClear={onMediaErrorClear}
                    onPendingPreviewChange={onMediaPendingPreviewChange}
                    onMediaUploadCancel={onMediaUploadCancel}
                    onUpload={(file, target) => {
                      setMediaErrorTarget(target);
                      return onMediaUpload(file, target);
                    }}
                    section={mediaEditorSection}
                  />
                </div>
              ) : (
                <Notice tone={visibleMediaError ? "error" : "neutral"}>
                  {visibleMediaError ? <span className="block">{visibleMediaError}</span> : null}
                  <span>
                    Media controls are unavailable because both media change and upload handlers are
                    required.
                  </span>
                </Notice>
              )}
            </div>
          ) : null}

          {category === "layout" ? (
            <div className={panelStackClass}>
              <div className={groupClass(barePanels)}>
                <ProfileLayoutOrderEditor
                  barePanels={barePanels}
                  error={orderError}
                  onChange={(layoutOrder) =>
                    update({
                      layoutOrder,
                      contentOrder:
                        layoutOrder.indexOf("section") < layoutOrder.indexOf("links")
                          ? "section-first"
                          : "links-first",
                    })
                  }
                  value={
                    activeCustomization.layoutOrder ??
                    defaultProfileLayoutOrder(activeCustomization.contentOrder)
                  }
                />
              </div>
              <ChoiceGroup<ProfileContactDisplay>
                barePanels={barePanels}
                error={contactDisplayError}
                hint="Icons keep the top of your profile short."
                label="Contact info"
                name={`${baseId}-contact-display`}
                onChange={(value) => update({ contactDisplay: value })}
                options={[
                  ["labels", "Icon + label"],
                  ["icons-circle", "Icons · circles"],
                  ["icons-soft-square", "Icons · soft squares"],
                ]}
                value={activeCustomization.contactDisplay ?? "labels"}
              />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
