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
  DEFAULT_CUSTOM_PROFILE_COLORS,
  DEFAULT_CUSTOM_PROFILE_CUSTOMIZATION,
  DEFAULT_WARM_STUDIO_CUSTOMIZATION,
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
} from "@/lib/profile-workspace";
import type { ProfileMediaImage, ProfileMediaPresentation } from "@/lib/profile-media";
import type { PendingProfileMediaUpload } from "@/lib/profile-media-preview";
import { ProfileIdentityColorPicker } from "@/components/forms/ProfileIdentityColorPicker";
import { ProfileMediaEditor } from "@/components/forms/ProfileMediaEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Notice } from "@/components/ui/Notice";

export type ProfileCustomizationEditorProps = {
  customization?: ProfileCustomization;
  errors?: readonly string[];
  media?: ProfileMediaPresentation;
  mediaBusy?: boolean;
  mediaError?: string;
  onChange: (next: ProfileCustomization | undefined) => void;
  onMediaChange?: (next: ProfileMediaPresentation | undefined) => void;
  onMediaPendingPreviewChange?: (pending: PendingProfileMediaUpload | null) => void;
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
  layout: "Layout",
};

const radioClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-tapit border px-3.5 py-3 text-sm transition focus-within:ring-2 focus-within:ring-tapit-accent/30";

type ProfileAppearancePreset = ProfileTheme | "warm-studio";

const appearancePresets: readonly {
  value: ProfileAppearancePreset;
  label: string;
  description: string;
  colors: {
    canvas: string;
    surface: string;
    border: string;
    ink: string;
    muted: string;
    accent: string;
  };
}[] = [
  {
    value: "paper",
    label: "Soft Precision (Paper)",
    description: "Cool neutrals, rounded surfaces, and a clear blue accent.",
    colors: {
      canvas: "#f4f6fa",
      surface: "#ffffff",
      border: "#e0e5ed",
      ink: "#1b2433",
      muted: "#687487",
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
      border: "#b9d1c0",
      ink: "#17352b",
      muted: "#4f6d5c",
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
      border: "#40534d",
      ink: "#f2f6f1",
      muted: "#b7c9c0",
      accent: "#7bc2a9",
    },
  },
  {
    value: "warm-studio",
    label: "Warm Studio",
    description: "Warm editorial tones with extra identity, media, and layout controls.",
    colors: {
      canvas: "#fbf6ef",
      surface: "#fffdf9",
      border: "#e5d6c5",
      ink: "#2c2420",
      muted: "#74665d",
      accent: "#3e806d",
    },
  },
  {
    value: "custom",
    label: "Custom",
    description: "Choose your own page, surface, text, and link colors.",
    colors: {
      canvas: DEFAULT_CUSTOM_PROFILE_COLORS.canvas,
      surface: DEFAULT_CUSTOM_PROFILE_COLORS.surface,
      border: "#e0e5ed",
      ink: DEFAULT_CUSTOM_PROFILE_COLORS.ink,
      muted: "#687487",
      accent: DEFAULT_CUSTOM_PROFILE_COLORS.accent,
    },
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
      className={`grid cursor-pointer gap-2.5 rounded-tapit border p-3.5 transition focus-within:ring-2 focus-within:ring-tapit-accent/30 ${
        disabled ? "cursor-not-allowed opacity-55" : ""
      } ${
        checked
          ? "border-tapit-accent bg-tapit-accent-soft/50"
          : "border-tapit-line bg-tapit-surface hover:border-tapit-accent"
      }`}
    >
      <span className="flex items-start gap-3">
        <input
          aria-describedby={ariaDescribedBy}
          aria-label={label}
          checked={checked}
          className="mt-0.5 size-4 shrink-0 accent-tapit-accent"
          disabled={disabled}
          name={name}
          onChange={() => onChange(value)}
          type="radio"
          value={value}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-tapit-ink">{label}</span>
            {checked ? (
              <span className="shrink-0 text-xs font-semibold text-tapit-accent-strong">
                Selected
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-xs leading-5 text-tapit-muted">{description}</span>
        </span>
      </span>
      <span
        aria-hidden="true"
        className="rounded-[0.9rem] border p-2.5"
        style={{ backgroundColor: colors.canvas, borderColor: colors.border }}
      >
        <span
          className="block rounded-[0.7rem] border p-2.5"
          style={{ backgroundColor: colors.surface, borderColor: colors.border }}
        >
          <span className="flex items-center gap-2">
            <span
              className="size-5 rounded-full border"
              style={{ backgroundColor: colors.accent, borderColor: colors.border }}
            />
            <span className="h-1.5 w-16 rounded-full" style={{ backgroundColor: colors.ink }} />
          </span>
          <span
            className="mt-2 block h-1 w-24 max-w-full rounded-full"
            style={{ backgroundColor: colors.muted }}
          />
          <span
            className="mt-2 block rounded-lg border px-2 py-1 text-[10px] font-semibold"
            style={{ borderColor: colors.accent, color: colors.accent }}
          >
            Profile link
          </span>
        </span>
      </span>
    </label>
  );
}

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
  onChange,
}: {
  field: keyof ProfileThemeColors;
  label: string;
  value: string;
  onChange: (field: keyof ProfileThemeColors, value: string) => void;
}) {
  const [draftHex, setDraftHex] = useState(value);

  function commit(next: string) {
    setDraftHex(next);
    if (isProfileIdentityHex(next)) onChange(field, next.toLowerCase());
  }

  return (
    <label className="grid gap-2 rounded-tapit border border-tapit-line/70 bg-tapit-surface p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <span className="text-sm font-semibold text-tapit-ink">{label}</span>
      <span className="flex items-center gap-3">
        <input
          aria-label={`${label} color`}
          className="size-11 shrink-0 cursor-pointer rounded-xl border border-tapit-line bg-tapit-surface p-1"
          onChange={(event) => commit(event.target.value)}
          type="color"
          value={isProfileIdentityHex(draftHex) ? draftHex : value}
        />
        <input
          aria-label={`${label} hex`}
          autoCapitalize="characters"
          autoComplete="off"
          className="min-h-11 w-32 rounded-tapit border border-tapit-line bg-tapit-surface px-3 font-mono text-sm uppercase text-tapit-ink outline-none transition focus:border-tapit-accent focus:ring-2 focus:ring-tapit-accent/20"
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
  onChange,
}: {
  customization: ProfileCustomization;
  error?: string;
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
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-tapit-ink">Custom palette</legend>
      <p className="text-sm leading-6 text-tapit-muted">
        Choose the page, profile card, text, and outlined link colors. Text and links must stay
        readable against their surfaces.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {customColorFields.map(([field, label]) => (
          <CustomPaletteColorField
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
  onMediaPendingPreviewChange,
  onMediaErrorClear,
  onMediaUploadCancel,
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
  const [pendingPreset, setPendingPreset] = useState<ProfileAppearancePreset | null>(null);
  const selectedPreset: ProfileAppearancePreset =
    customization?.preset === "warm-studio" ? "warm-studio" : (theme ?? "paper");
  const warmStudioCustomization =
    selectedPreset === "warm-studio" && customization?.preset === "warm-studio"
      ? customization
      : undefined;
  const activeCategory = warmStudioCustomization ? selectedCategory : "overview";

  useEffect(() => {
    const focusTarget = focusTargetRef.current;
    focusTargetRef.current = null;
    if (focusTarget === "panel") panelRefs.current[activeCategory]?.focus();
  }, [activeCategory]);

  useEffect(() => {
    if (!warmStudioCustomization || !focusOverviewAfterTransitionRef.current) return;
    focusOverviewAfterTransitionRef.current = false;
    panelRefs.current.overview?.focus();
  }, [warmStudioCustomization]);

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
    if (warmStudioCustomization) {
      onChange(copyCustomization({ ...warmStudioCustomization, ...patch }));
    }
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
  const orderError = findError("profile customization content order");
  const contactDisplayError = findError("profile customization contact display");
  const identityColorError = (field: ProfileIdentityField) =>
    field === "name"
      ? findError("profile name color", "profile name custom color")
      : findError("profile bio color", "profile bio custom color");

  function setCategory(category: ProfileCustomizationCategory) {
    if (warmStudioCustomization || category === "overview") setSelectedCategory(category);
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    category: ProfileCustomizationCategory,
  ) {
    const enabledCategories = PROFILE_CUSTOMIZATION_CATEGORIES.filter(
      (candidate) => warmStudioCustomization || candidate === "overview",
    );
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
    setPendingPreset(null);
    setSelectedCategory("overview");
    const savedCustomColors = customization?.customColors;
    if (preset === "warm-studio") {
      focusOverviewAfterTransitionRef.current = true;
      onThemeChange?.("paper");
      onChange(
        copyCustomization({
          ...DEFAULT_WARM_STUDIO_CUSTOMIZATION,
          ...(savedCustomColors ? { customColors: savedCustomColors } : {}),
        }),
      );
      return;
    }

    focusOverviewAfterTransitionRef.current = false;
    if (preset === "custom") {
      onChange(
        copyCustomization({
          ...DEFAULT_CUSTOM_PROFILE_CUSTOMIZATION,
          customColors: savedCustomColors ?? DEFAULT_CUSTOM_PROFILE_COLORS,
        }),
      );
    } else {
      onChange(
        savedCustomColors
          ? copyCustomization({
              ...DEFAULT_CUSTOM_PROFILE_CUSTOMIZATION,
              customColors: savedCustomColors,
            })
          : undefined,
      );
    }
    onThemeChange?.(preset);
  }

  function choosePreset(preset: ProfileAppearancePreset) {
    if (preset === selectedPreset) return;
    if (selectedPreset === "warm-studio" && preset !== "warm-studio") {
      setPendingPreset(preset);
      return;
    }
    applyPreset(preset);
  }

  return (
    <div className="grid min-w-0 gap-5">
      <nav
        aria-label="Customization categories"
        aria-orientation="horizontal"
        className="flex min-w-0 gap-2 overflow-x-auto pb-1"
        role="tablist"
      >
        {PROFILE_CUSTOMIZATION_CATEGORIES.map((category) => {
          const selected = activeCategory === category;
          const tabStatusId = `${baseId}-tab-${category}-status`;
          const disabled = !warmStudioCustomization && category !== "overview";
          return (
            <button
              aria-controls={`${baseId}-panel-${category}`}
              aria-describedby={categoryHasErrors[category] ? tabStatusId : undefined}
              aria-label={categoryLabels[category]}
              aria-selected={selected}
              className={`flex min-h-12 shrink-0 items-center justify-between gap-3 rounded-tapit border px-4 text-left text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-tapit-accent ${
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
          className="rounded-tapit border border-tapit-line bg-tapit-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-tapit-accent focus-visible:ring-offset-4 sm:p-5"
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
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold text-tapit-ink">Profile preset</legend>
                {presetError ? (
                  <p className="sr-only" id={errorId("preset")} role="alert">
                    {presetError}
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {appearancePresets.map((preset) => {
                    const colors =
                      preset.value === "custom" && customization?.customColors
                        ? {
                            ...preset.colors,
                            canvas: customization.customColors.canvas,
                            surface: customization.customColors.surface,
                            ink: customization.customColors.ink,
                            accent: customization.customColors.accent,
                          }
                        : preset.colors;
                    return (
                      <PresetRadio
                        ariaDescribedBy={presetError ? errorId("preset") : undefined}
                        checked={selectedPreset === preset.value}
                        colors={colors}
                        description={preset.description}
                        disabled={preset.value !== "warm-studio" && onThemeChange === undefined}
                        key={preset.value}
                        label={preset.label}
                        name={`${baseId}-preset`}
                        onChange={choosePreset}
                        value={preset.value}
                      />
                    );
                  })}
                </div>
              </fieldset>
              {selectedPreset === "custom" ? (
                <CustomPaletteControls
                  customization={
                    customization?.preset === "custom"
                      ? customization
                      : DEFAULT_CUSTOM_PROFILE_CUSTOMIZATION
                  }
                  error={customColorError}
                  onChange={onChange}
                />
              ) : warmStudioCustomization ? (
                <>
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
                    value={warmStudioCustomization.accent}
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
                    value={warmStudioCustomization.typeScale}
                  />
                  <ChoiceGroup
                    error={treatmentError}
                    label="Save contact button treatment"
                    name={`${baseId}-treatment`}
                    onChange={(value) => update({ linkTreatment: value })}
                    options={[
                      ["filled", "Filled"],
                      ["outlined", "Outlined"],
                    ]}
                    value={warmStudioCustomization.linkTreatment}
                  />
                </>
              ) : (
                <Notice>
                  Choose Warm Studio for identity, media, and layout controls, or Custom to set a
                  color palette.
                </Notice>
              )}
            </div>
          ) : null}

          {category === "identity" && warmStudioCustomization ? (
            <div className="grid gap-5">
              <IdentityColorControls
                allowWhite={media?.background !== undefined}
                customization={warmStudioCustomization}
                errorFor={identityColorError}
                onChange={onChange}
              />
            </div>
          ) : null}

          {category === "media" && warmStudioCustomization ? (
            <div className="grid gap-5">
              <CategoryErrorList errors={mediaCategoryErrors} />
              {onMediaChange && onMediaUpload ? (
                <ProfileMediaEditor
                  busy={mediaBusy}
                  error={mediaError}
                  media={media}
                  onChange={onMediaChange}
                  onMediaErrorClear={onMediaErrorClear}
                  onPendingPreviewChange={onMediaPendingPreviewChange}
                  onMediaUploadCancel={onMediaUploadCancel}
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

          {category === "layout" && warmStudioCustomization ? (
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
                value={warmStudioCustomization.contentOrder}
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
                value={warmStudioCustomization.contactDisplay ?? "labels"}
              />
            </div>
          ) : null}
        </section>
      ))}
      <ConfirmDialog
        confirmLabel={
          pendingPreset === null
            ? "Switch preset"
            : `Switch to ${appearancePresets.find((preset) => preset.value === pendingPreset)?.label.replace(" (Paper)", "") ?? "selected preset"}`
        }
        description={
          media?.background || (media?.slideshow.length ?? 0) > 0
            ? `Warm Studio's visual settings and optional content will be removed from this draft. Uploaded media will remain saved but inactive.${customization?.customColors ? " Your custom palette will remain saved." : ""}`
            : `Warm Studio's visual settings and optional content will be removed from this draft.${customization?.customColors ? " Your custom palette will remain saved." : ""}`
        }
        onCancel={() => setPendingPreset(null)}
        onConfirm={() => {
          if (pendingPreset !== null) applyPreset(pendingPreset);
        }}
        open={pendingPreset !== null}
        title="Switch profile preset?"
      />
    </div>
  );
}
