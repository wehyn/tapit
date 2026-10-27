import Link from "next/link";
import type { MouseEventHandler } from "react";

import { Icon } from "../ui/Icon";

export function Brand({
  href = "/",
  onClick,
  showMark = true,
}: {
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  showMark?: boolean;
}) {
  return (
    <Link
      aria-label="Tapit home"
      className={`tapit-display inline-flex min-h-11 items-center font-semibold tracking-tight text-tapit-ink ${showMark ? "gap-2 text-lg" : "text-xl"}`}
      href={href}
      onClick={onClick}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-control bg-tapit-accent text-white"
        >
          <Icon name="fingerprint" size={18} weight="bold" />
        </span>
      ) : null}
      tapit
    </Link>
  );
}
