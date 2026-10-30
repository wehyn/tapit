"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { cardTokenFromUrl } from "@/lib/card-url";
import { generateQrPng, generateQrSvg } from "@/lib/qr";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";

type QrResult =
  | { url: string; retryCount: number; svg: string; png: string }
  | { url: string; retryCount: number; error: true };

export function QrControls({ cardUrl, label }: { cardUrl: string; label: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [generated, setGenerated] = useState<QrResult | null>(null);
  const generationId = useRef(0);
  const token = cardTokenFromUrl(cardUrl);
  const currentResult =
    generated?.url === cardUrl && generated.retryCount === retryCount ? generated : null;
  const readyQr = currentResult && "svg" in currentResult ? currentResult : null;
  const error = currentResult && "error" in currentResult;
  const isLoading = isOpen && token !== null && currentResult === null;

  useEffect(() => {
    if (!isOpen || token === null) return;
    const requestId = ++generationId.current;
    let cancelled = false;
    Promise.all([generateQrSvg(cardUrl), generateQrPng(cardUrl)])
      .then(([svg, png]) => {
        if (!cancelled && requestId === generationId.current)
          setGenerated({ url: cardUrl, retryCount, svg, png });
      })
      .catch(() => {
        if (!cancelled && requestId === generationId.current)
          setGenerated({ url: cardUrl, retryCount, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cardUrl, isOpen, retryCount, token]);

  function downloadSvg() {
    if (readyQr === null || isLoading) return;
    const anchor = document.createElement("a");
    anchor.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(readyQr.svg)}`;
    anchor.download = `${token}.svg`;
    anchor.click();
  }

  return (
    <details
      className="mt-4 rounded-card bg-tapit-soft-surface p-6"
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setIsOpen(open);
        if (!open) setGenerated(null);
      }}
    >
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-tapit-muted [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          if (event.currentTarget.parentElement?.matches("details[open]")) {
            generationId.current += 1;
            setIsOpen(false);
            setGenerated(null);
          }
        }}
      >
        <Icon name="qrCode" size={18} /> QR fallback
      </summary>
      {isOpen && token === null ? (
        <div className="mt-3">
          <Notice tone="error">
            This card has no valid permanent production URL at /c/&lt;token&gt;. Check the saved
            card URL before generating a QR code.
          </Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 grid gap-2">
          <Notice tone="error">
            QR output could not be generated. Check the card URL and retry.
          </Notice>
          <Button
            onClick={() => setRetryCount((count) => count + 1)}
            type="button"
            variant="secondary"
          >
            Retry QR generation
          </Button>
        </div>
      ) : null}
      {readyQr ? (
        <Image
          alt={`QR code for ${label}`}
          className="mt-4 size-44 rounded-control bg-white p-2 shadow-card"
          height={176}
          src={readyQr.png}
          unoptimized
          width={176}
        />
      ) : isOpen && token !== null ? (
        <p className="mt-4 text-sm text-tapit-muted">
          {isLoading ? "Preparing preview…" : error ? "Preview unavailable." : "Preparing preview…"}
        </p>
      ) : null}
      {isOpen && token !== null ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            aria-disabled={!readyQr || isLoading}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold ${readyQr && !isLoading ? "bg-tapit-accent text-white hover:bg-tapit-accent-strong" : "pointer-events-none bg-tapit-line text-tapit-muted"}`}
            download={`${token}.png`}
            href={readyQr ? readyQr.png : undefined}
            tabIndex={readyQr && !isLoading ? undefined : -1}
          >
            <Icon name="download" size={18} />
            Download PNG
          </a>
          <Button
            className="transition-none"
            disabled={!readyQr || isLoading}
            onClick={downloadSvg}
            type="button"
            variant="secondary"
          >
            <Icon name="download" size={18} />
            Download SVG
          </Button>
        </div>
      ) : null}
      {isOpen && token !== null ? (
        <p className="mt-3 break-all text-xs text-tapit-muted">Encodes {cardUrl}</p>
      ) : null}
    </details>
  );
}
