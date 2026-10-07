"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const revealDelayMs = Math.max(0, Math.min(delayMs, 120));

  useEffect(() => {
    const element = elementRef.current;
    if (
      element === null ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    ) {
      return;
    }

    if (element.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    element.dataset.revealed = "false";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.dataset.revealed = "true";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={className}
      data-revealed="true"
      data-scroll-reveal
      ref={elementRef}
      onFocusCapture={(event) => {
        event.currentTarget.dataset.revealed = "true";
      }}
      style={{ "--reveal-delay": `${revealDelayMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
