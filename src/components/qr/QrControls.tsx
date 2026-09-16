"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { DownloadSimpleIcon, QrCodeIcon } from "@phosphor-icons/react";

import { generateQrPng, generateQrSvg } from "@/lib/qr";

import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export function QrControls({ cardUrl, label }: { cardUrl: string; label: string }) {
  const [svg, setSvg] = useState("");
  const [png, setPng] = useState("");
  const [error, setError] = useState("");
  const absoluteUrl = (() => {
    const url = new URL(
      cardUrl,
      typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
    );
    url.searchParams.set("source", "qr");
    return typeof window === "undefined" && url.origin === "http://localhost:3000"
      ? cardUrl.replace(/([?#].*)?$/, "?source=qr")
      : url.toString();
  })();

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
    <div className="mt-5 rounded-tapit border border-tapit-line bg-tapit-surface p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted">
        <QrCodeIcon aria-hidden="true" size={18} /> QR fallback
      </p>
      {error ? (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      {png ? (
        <Image
          alt={`QR code for ${label}`}
          className="mt-4 size-44 rounded-tapit bg-white p-2"
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
          <DownloadSimpleIcon aria-hidden="true" className="mr-2" size={18} />
          Download PNG
        </a>
        <Button disabled={!svg} onClick={downloadSvg} type="button" variant="secondary">
          <DownloadSimpleIcon aria-hidden="true" className="mr-2" size={18} />
          Download SVG
        </Button>
      </div>
      <p className="mt-3 break-all text-xs text-tapit-muted">Encodes {absoluteUrl}</p>
    </div>
  );
}
