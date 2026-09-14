"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { generateQrPng, generateQrSvg } from "@/lib/qr";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export function QrControls({ cardUrl, label }: { cardUrl: string; label: string }) {
  const [svg, setSvg] = useState("");
  const [png, setPng] = useState("");
  const [error, setError] = useState("");
  const absoluteUrl =
    typeof window === "undefined" ? cardUrl : new URL(cardUrl, window.location.origin).toString();

  useEffect(() => {
    let cancelled = false;
    Promise.all([generateQrSvg(absoluteUrl), generateQrPng(absoluteUrl)])
      .then(([nextSvg, nextPng]) => {
        if (cancelled) return;
        setError("");
        setSvg(nextSvg);
        setPng(nextPng);
      })
      .catch(() => {
        if (!cancelled) setError("QR output could not be generated.");
      });
    return () => {
      cancelled = true;
    };
  }, [absoluteUrl]);

  function downloadSvg() {
    if (!svg) return;
    const anchor = document.createElement("a");
    anchor.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    anchor.download = `${label}.svg`;
    anchor.click();
  }

  return (
    <div className="mt-5 rounded-2xl border border-tapit-line bg-tapit-paper p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
        QR fallback
      </p>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      {png ? (
        <Image
          alt={`QR code for ${label}`}
          className="mt-4 size-44 rounded-xl bg-white p-2"
          height={176}
          src={png}
          unoptimized
          width={176}
        />
      ) : (
        <p className="mt-4 text-sm text-tapit-muted">Preparing preview…</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${png ? "bg-tapit-accent text-white hover:bg-tapit-accent-strong" : "pointer-events-none bg-tapit-line text-tapit-muted"}`}
          download={`${label}.png`}
          href={png || undefined}
        >
          Download PNG
        </a>
        <Button disabled={!svg} onClick={downloadSvg} type="button" variant="secondary">
          Download SVG
        </Button>
      </div>
      <p className="mt-3 break-all text-xs text-tapit-muted">Encodes {absoluteUrl}</p>
    </div>
  );
}
