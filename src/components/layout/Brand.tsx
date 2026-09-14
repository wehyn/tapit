import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      aria-label="Tapit home"
      className="inline-flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-tapit-ink uppercase"
      href={href}
    >
      <span
        aria-hidden="true"
        className="grid size-7 place-items-center rounded-full bg-tapit-accent text-xs text-white"
      >
        T
      </span>
      Tapit
    </Link>
  );
}
