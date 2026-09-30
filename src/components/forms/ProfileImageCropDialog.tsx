"use client";

/* eslint-disable @next/next/no-img-element -- The local blob is shown only inside the crop dialog before upload. */

import { useEffect, useRef, useState } from "react";

import type { Crop } from "@/lib/profile-image";

type ProfileImageCropDialogProps = {
  busy?: boolean;
  error?: string;
  file: File;
  onApply: (crop: Crop) => void;
  onCancel: () => void;
};

export function ProfileImageCropDialog({
  busy = false,
  error: uploadError = "",
  file,
  onApply,
  onCancel,
}: ProfileImageCropDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDimensions, setSourceDimensions] = useState({ width: 384, height: 384 });
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, size: 1 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [sourceReady, setSourceReady] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
    let objectUrl: string | undefined;
    let cancelled = false;
    if (typeof URL.createObjectURL === "function") {
      objectUrl = URL.createObjectURL(file);
      queueMicrotask(() => {
        if (!cancelled && objectUrl) setSourceUrl(objectUrl);
      });
    } else {
      const reader = new FileReader();
      reader.onerror = () => {
        if (!cancelled) setError("That image could not be read. Choose another file.");
      };
      reader.onload = () => {
        if (!cancelled && typeof reader.result === "string") setSourceUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  function moveCrop(axis: "x" | "y", amount: number) {
    setCrop((current) => {
      const extent = axis === "x" ? sourceDimensions.width : sourceDimensions.height;
      const next = Math.max(0, Math.min(extent - current.size, current[axis] + amount));
      return axis === "x" ? { ...current, x: next } : { ...current, y: next };
    });
  }

  function updateZoom(nextZoom: number) {
    const nextSize = Math.min(sourceDimensions.width, sourceDimensions.height) / nextZoom;
    setZoom(nextZoom);
    setCrop((current) => ({
      size: nextSize,
      x: Math.max(0, Math.min(sourceDimensions.width - nextSize, current.x)),
      y: Math.max(0, Math.min(sourceDimensions.height - nextSize, current.y)),
    }));
  }

  function startDrag(clientX: number, clientY: number) {
    dragStartRef.current = { x: clientX, y: clientY };
  }

  function dragTo(clientX: number, clientY: number, surfaceSize: number) {
    const start = dragStartRef.current;
    if (!start) return;
    const scale = crop.size / (surfaceSize > 0 ? surfaceSize : 280);
    moveCrop("x", (start.x - clientX) * scale);
    moveCrop("y", (start.y - clientY) * scale);
    dragStartRef.current = { x: clientX, y: clientY };
  }

  const canApply =
    sourceReady &&
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.size) &&
    crop.size > 0 &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.x + crop.size <= sourceDimensions.width &&
    crop.y + crop.size <= sourceDimensions.height;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tapit-ink/60 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        aria-labelledby="profile-image-crop-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-tapit bg-tapit-surface p-6 shadow-2xl"
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="profile-image-crop-title" className="text-xl font-semibold text-tapit-ink">
          Adjust profile photo
        </h2>
        <p className="mt-1 text-sm text-tapit-muted">
          Drag with the arrow keys, then choose the crop.
        </p>

        <div
          aria-label="Crop profile photo"
          className="relative mx-auto mt-5 grid aspect-square w-[min(280px,calc(100vw-5rem))] place-items-center overflow-hidden border-4 border-white bg-[length:16px_16px] [background-image:linear-gradient(45deg,#e7e4dc_25%,transparent_25%),linear-gradient(-45deg,#e7e4dc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e7e4dc_75%),linear-gradient(-45deg,transparent_75%,#e7e4dc_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0] focus:outline-2 focus:outline-offset-4 focus:outline-tapit-accent"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") moveCrop("x", -1);
            if (event.key === "ArrowRight") moveCrop("x", 1);
            if (event.key === "ArrowUp") moveCrop("y", -1);
            if (event.key === "ArrowDown") moveCrop("y", 1);
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              event.preventDefault();
            }
          }}
          onPointerDown={(event) => {
            startDrag(event.clientX, event.clientY);
            if (event.currentTarget.setPointerCapture) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) =>
            dragTo(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect().width)
          }
          onPointerUp={() => {
            dragStartRef.current = null;
          }}
          onMouseDown={(event) => startDrag(event.clientX, event.clientY)}
          onMouseMove={(event) =>
            dragTo(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect().width)
          }
          onMouseUp={() => {
            dragStartRef.current = null;
          }}
          role="application"
          tabIndex={0}
        >
          {sourceUrl ? (
            <img
              alt="Profile photo crop preview"
              className="pointer-events-none absolute max-w-none rounded-full"
              onError={() => setError("That image could not be decoded. Choose another file.")}
              onLoad={(event) => {
                const image = event.currentTarget;
                const width = image.naturalWidth || 1;
                const height = image.naturalHeight || 1;
                const size = Math.min(width, height);
                setSourceDimensions({ width, height });
                setCrop({ x: (width - size) / 2, y: (height - size) / 2, size });
                setSourceReady(true);
              }}
              src={sourceUrl}
              style={{
                width: `${(sourceDimensions.width / crop.size) * 100}%`,
                height: `${(sourceDimensions.height / crop.size) * 100}%`,
                left: `${-(crop.x / crop.size) * 100}%`,
                top: `${-(crop.y / crop.size) * 100}%`,
              }}
            />
          ) : null}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => updateZoom(Math.max(1, zoom - 0.25))}
          >
            −
          </button>
          <input
            aria-label="Zoom"
            className="w-full accent-tapit-accent"
            max="2"
            min="1"
            onChange={(event) => updateZoom(Number(event.target.value))}
            step="0.25"
            type="range"
            value={zoom}
          />
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => updateZoom(Math.min(2, zoom + 0.25))}
          >
            +
          </button>
        </div>

        {error || uploadError ? (
          <p aria-live="assertive" className="mt-3 text-sm text-tapit-danger" role="alert">
            {error || uploadError}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded-tapit border border-tapit-line px-4 py-2.5 text-sm font-semibold text-tapit-ink"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-full bg-tapit-accent px-4 py-2.5 text-sm font-semibold text-white"
            disabled={!canApply || busy}
            onClick={() => {
              if (!canApply) {
                setError("Choose a valid square crop before applying.");
                return;
              }
              onApply(crop);
            }}
            type="button"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
                />
                Applying...
              </span>
            ) : (
              "Apply"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
