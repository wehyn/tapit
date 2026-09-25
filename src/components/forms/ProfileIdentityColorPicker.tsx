"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  IDENTITY_COLOR_PALETTE,
  PROFILE_IDENTITY_COLOR_PRESETS,
  isProfileIdentityHex,
  resolveProfileIdentityColor,
  validateProfileIdentityColor,
  type ProfileIdentityColor,
  type ProfileIdentityColorValidationOptions,
  type ProfileIdentityColorPreset,
  type ProfileIdentityField,
} from "@/lib/profile-customization";

const fieldLabels: Record<ProfileIdentityField, string> = {
  name: "Name",
  bio: "Bio / role",
};

const presetLabels: Record<ProfileIdentityColorPreset, string> = {
  default: "Default",
  coral: "Coral",
  jade: "Jade",
  ink: "Ink",
};

type Hsv = { hue: number; saturation: number; value: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToHsv(hex: string): Hsv {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: max === 0 ? 0 : (delta / max) * 100,
    value: max * 100,
  };
}

function hsvToHex({ hue, saturation, value }: Hsv): string {
  const saturationRatio = saturation / 100;
  const valueRatio = value / 100;
  const chroma = valueRatio * saturationRatio;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = valueRatio - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (sector < 1) [red, green, blue] = [chroma, x, 0];
  else if (sector < 2) [red, green, blue] = [x, chroma, 0];
  else if (sector < 3) [red, green, blue] = [0, chroma, x];
  else if (sector < 4) [red, green, blue] = [0, x, chroma];
  else if (sector < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + match) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function colorForPreset(field: ProfileIdentityField, preset: ProfileIdentityColorPreset): string {
  return IDENTITY_COLOR_PALETTE[preset][field];
}

function isPresetSelected(
  value: ProfileIdentityColor | undefined,
  preset: ProfileIdentityColorPreset,
): boolean {
  return value === undefined
    ? preset === "default"
    : value.kind === "preset" && value.value === preset;
}

export function ProfileIdentityColorPicker({
  field,
  value,
  error,
  allowWhite = false,
  onChange,
}: {
  field: ProfileIdentityField;
  value?: ProfileIdentityColor;
  error?: string;
  allowWhite?: ProfileIdentityColorValidationOptions["allowWhite"];
  onChange: (next: ProfileIdentityColor | undefined) => void;
}) {
  const label = fieldLabels[field];
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(() =>
    resolveProfileIdentityColor({ [field]: value }, field),
  );
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(draftHex));
  const [pickerError, setPickerError] = useState<string | undefined>();
  const errorId = useId();

  function syncFromHex(hex: string) {
    setDraftHex(hex);
    setHsv(hexToHsv(hex));
  }

  function commitCustomHex(hex: string) {
    const validationError = validateProfileIdentityColor(field, hex, { allowWhite });
    setPickerError(validationError);
    if (validationError === undefined) onChange({ kind: "custom", hex: hex.toLowerCase() });
  }

  function setHsvValue(next: Hsv) {
    const normalized = {
      hue: clamp(next.hue, 0, 360),
      saturation: clamp(next.saturation, 0, 100),
      value: clamp(next.value, 0, 100),
    };
    const hex = hsvToHex(normalized);
    setHsv(normalized);
    setDraftHex(hex);
    commitCustomHex(hex);
  }

  function closePicker() {
    setOpen(false);
    setPickerError(undefined);
    triggerRef.current?.focus();
  }

  function openPicker() {
    const hex = resolveProfileIdentityColor({ [field]: value }, field);
    syncFromHex(hex);
    setPickerError(undefined);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePicker();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    const focusTimer = window.setTimeout(() => hexInputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function updatePad(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const saturation = ((event.clientX - bounds.left) / bounds.width) * 100;
    const valueAtPoint = 100 - ((event.clientY - bounds.top) / bounds.height) * 100;
    setHsvValue({ ...hsv, saturation, value: valueAtPoint });
  }

  const visibleError = pickerError ?? error;
  const pickerErrorId = `${errorId}-picker-error`;
  const safeDraftHex = isProfileIdentityHex(draftHex) ? draftHex : "#fbf6ef";

  return (
    <div className="relative grid gap-2" ref={rootRef}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-semibold text-tapit-ink" id={`${errorId}-label`}>
          {label}
        </span>
        <div
          aria-describedby={`${errorId}-label`}
          aria-label="Color choices"
          className="flex items-center gap-3"
          role="group"
        >
          {PROFILE_IDENTITY_COLOR_PRESETS.map((preset) => {
            const selected = isPresetSelected(value, preset);
            const presetLabel = presetLabels[preset];
            return (
              <span className="group relative" key={preset}>
                <button
                  aria-pressed={selected}
                  className={`size-9 min-h-0 shrink-0 rounded-full border border-[#2c2420]/15 shadow-sm transition hover:scale-105 focus-visible:outline-none ${selected ? "ring-2 ring-tapit-accent ring-offset-2" : ""}`}
                  onClick={() => {
                    setPickerError(undefined);
                    onChange(preset === "default" ? undefined : { kind: "preset", value: preset });
                  }}
                  style={{ backgroundColor: colorForPreset(field, preset) }}
                  title={`${presetLabel} ${label.toLowerCase()} color`}
                  type="button"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-tapit-ink px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                >
                  {presetLabel}
                </span>
              </span>
            );
          })}
          <span className="group relative">
            <button
              aria-expanded={open}
              aria-haspopup="dialog"
              className={`grid size-9 min-h-0 shrink-0 place-items-center rounded-full border border-[#2c2420]/15 shadow-sm transition hover:scale-105 focus-visible:outline-none ${value?.kind === "custom" ? "ring-2 ring-tapit-accent ring-offset-2" : ""}`}
              onClick={() => (open ? closePicker() : openPicker())}
              ref={triggerRef}
              style={{
                background:
                  "conic-gradient(from 30deg, #a84431, #e0a43a, #3e806d, #4d74b6, #a84431)",
              }}
              title={`Choose custom ${label.toLowerCase()} color`}
              type="button"
            >
              <span className="grid size-5 place-items-center rounded-full bg-[#fffdf9]/90 text-tapit-ink">
                <PlusIcon aria-hidden="true" size={13} weight="bold" />
              </span>
            </button>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-tapit-ink px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
            >
              Custom
            </span>
          </span>
        </div>
      </div>
      {!open && error ? (
        <p className="text-xs font-medium text-tapit-danger" id={pickerErrorId} role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <div
          aria-label={`${label} custom color picker`}
          className="z-20 grid gap-4 rounded-tapit border border-tapit-line bg-tapit-surface p-4 shadow-[0_18px_42px_rgba(21,25,24,0.14)]"
          role="dialog"
        >
          <div className="flex items-stretch gap-3">
            <div
              aria-label={`${label} saturation and value area`}
              className="relative min-h-40 flex-1 cursor-crosshair overflow-hidden rounded-tapit border border-[#2c2420]/15"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                updatePad(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePad(event);
              }}
              role="img"
              style={{
                backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.hue} 100% 50%))`,
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(44,36,32,0.7)]"
                style={{
                  left: `${hsv.saturation}%`,
                  top: `${100 - hsv.value}%`,
                  backgroundColor: safeDraftHex,
                }}
              />
            </div>
            <label className="relative block w-8 shrink-0" title={`${label} hue`}>
              <span className="sr-only">{label} hue</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full border border-[#2c2420]/15"
                style={{
                  background:
                    "linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
                }}
              />
              <input
                aria-label={`${label} hue`}
                className="relative z-10 h-40 w-8 cursor-pointer appearance-none bg-transparent [writing-mode:vertical-lr] [direction:rtl]"
                max="360"
                min="0"
                onChange={(event) => setHsvValue({ ...hsv, hue: Number(event.target.value) })}
                type="range"
                value={hsv.hue}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-tapit-muted">
              <span>Saturation</span>
              <input
                aria-label={`${label} saturation`}
                className="h-5 w-full accent-tapit-accent"
                max="100"
                min="0"
                onChange={(event) =>
                  setHsvValue({ ...hsv, saturation: Number(event.target.value) })
                }
                type="range"
                value={hsv.saturation}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-tapit-muted">
              <span>Value</span>
              <input
                aria-label={`${label} value`}
                className="h-5 w-full accent-tapit-accent"
                max="100"
                min="0"
                onChange={(event) => setHsvValue({ ...hsv, value: Number(event.target.value) })}
                type="range"
                value={hsv.value}
              />
            </label>
          </div>

          <div className="grid gap-2">
            <label className="sr-only" htmlFor={`${errorId}-hex`}>
              {label} custom hex color
            </label>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-10 shrink-0 rounded-full border border-[#2c2420]/15 shadow-inner"
                style={{ backgroundColor: safeDraftHex }}
              />
              <input
                aria-describedby={visibleError ? pickerErrorId : undefined}
                aria-invalid={Boolean(visibleError)}
                className="min-h-11 min-w-0 flex-1 rounded-tapit border border-tapit-line bg-tapit-paper px-3 text-sm font-semibold uppercase tracking-[0.08em] text-tapit-ink outline-none transition focus:border-tapit-accent focus:ring-2 focus:ring-tapit-accent/20"
                id={`${errorId}-hex`}
                inputMode="text"
                onBlur={() => commitCustomHex(draftHex)}
                onChange={(event) => {
                  const next = event.target.value;
                  setDraftHex(next);
                  if (validateProfileIdentityColor(field, next, { allowWhite }) === undefined) {
                    syncFromHex(next.toLowerCase());
                    commitCustomHex(next);
                  } else {
                    setPickerError(validateProfileIdentityColor(field, next, { allowWhite }));
                  }
                }}
                placeholder="#a84431"
                ref={hexInputRef}
                type="text"
                value={draftHex}
              />
            </div>
            {visibleError ? (
              <p className="text-xs font-medium text-tapit-danger" id={pickerErrorId} role="alert">
                {visibleError}
              </p>
            ) : (
              <p className="text-xs leading-5 text-tapit-muted">
                Use a six-digit hex color with enough contrast.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
