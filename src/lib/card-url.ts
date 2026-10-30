export const CANONICAL_CARD_ORIGIN = "https://tapit-eosin.vercel.app";

const cardPath = /^\/c\/([A-Za-z0-9_-]{1,160})$/;

export function normalizeCardUrl(value: string): string | null {
  const trimmed = value.trim();
  const isAbsolute = /^https?:\/\//i.test(trimmed);
  if (
    !trimmed ||
    trimmed.includes("#") ||
    (!isAbsolute && (!trimmed.startsWith("/") || trimmed.startsWith("//")))
  )
    return null;
  const rawAuthority = isAbsolute ? trimmed.match(/^https?:\/\/([^/?#]*)/i)?.[1] : undefined;
  const rawPath = isAbsolute
    ? trimmed.match(/^https?:\/\/[^/?#]*(\/[^?#]*)?(?:\?[^#]*)?$/i)?.[1]
    : trimmed.match(/^([^?#]*)(?:\?[^#]*)?$/)?.[1];
  if (rawAuthority?.includes("@") || !rawPath || !cardPath.test(rawPath)) return null;

  try {
    const url = isAbsolute ? new URL(trimmed) : new URL(trimmed, CANONICAL_CARD_ORIGIN);
    if (
      url.protocol !== "https:" ||
      url.origin !== CANONICAL_CARD_ORIGIN ||
      url.username ||
      url.password ||
      url.pathname !== rawPath
    )
      return null;
    return isAbsolute ? trimmed : url.toString();
  } catch {
    return null;
  }
}

export function cardTokenFromUrl(value: string): string | null {
  if (normalizeCardUrl(value) !== value) return null;
  return new URL(value).pathname.match(cardPath)?.[1] ?? null;
}

export function cardUrlFromToken(token: string): string {
  return `${CANONICAL_CARD_ORIGIN}/c/${encodeURIComponent(token)}`;
}
