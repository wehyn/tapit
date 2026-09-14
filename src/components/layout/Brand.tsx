import Link from "next/link";

import { Icon } from "../ui/Icon";

export function Brand({ href = "/", showMark = true }: { href?: string; showMark?: boolean }) {
  return (
    <Link
      aria-label="Tapit home"
      className={`inline-flex min-h-11 items-center text-tapit-ink ${showMark ? "gap-2 text-sm font-semibold tracking-[0.18em] uppercase" : "text-[1.7rem] font-semibold tracking-[-0.06em]"}`}
      href={href}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-tapit bg-tapit-accent text-white"
        >
          <Icon name="fingerprint" size={17} weight="bold" />
        </span>
      ) : null}
      Tapit
    </Link>
  );
}
