import Link from "next/link";

import { Icon } from "../ui/Icon";

export function Brand({ href = "/", showMark = true }: { href?: string; showMark?: boolean }) {
  return (
    <Link
      aria-label="Tapit home"
      className={`tapit-display inline-flex min-h-11 items-center text-tapit-ink ${showMark ? "gap-2 text-[1.05rem] font-semibold tracking-[-0.04em]" : "text-[1.7rem] font-semibold tracking-[-0.04em]"}`}
      href={href}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-[11px] bg-gradient-to-br from-tapit-accent to-[#168a7a] text-white shadow-[0_5px_12px_rgba(16,84,63,0.18)]"
        >
          <Icon name="fingerprint" size={17} weight="bold" />
        </span>
      ) : null}
      tapit
    </Link>
  );
}
