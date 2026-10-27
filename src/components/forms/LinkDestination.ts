export type LinkKind = "link" | "email" | "phone";

export function linkKind(destination: string): LinkKind {
  if (destination.toLowerCase().startsWith("mailto:")) return "email";
  if (destination.toLowerCase().startsWith("tel:")) return "phone";
  return "link";
}

// The https:// prefix is hidden in the field, as HttpsUrlField does, so the
// implied scheme never appears mid-typing.
export function displayDestination(destination: string): string {
  const kind = linkKind(destination);
  if (kind === "email") return destination.replace(/^(?:mailto:)+/i, "");
  if (kind === "phone") return destination.replace(/^(?:tel:)+/i, "");
  return destination.replace(/^https:\/\//i, "");
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const KNOWN_SCHEME = /^(?:https?:\/\/|mailto:|tel:)/i;
// `localhost:3000` and `example.com:8080/path` are host and port, not schemes.
const HOST_WITH_PORT = /^[a-z\d.-]+:\d+(?:[/?#]|$)/i;

/**
 * Known schemes are kept as typed. Other `scheme:` values, including
 * unsupported ones like ftp:// or javascript:, are also kept so strict
 * validation rejects them instead of wrapping them in https://.
 */
function hasExplicitScheme(value: string): boolean {
  if (KNOWN_SCHEME.test(value)) return true;
  return SCHEME.test(value) && !HOST_WITH_PORT.test(value);
}

export function formatDestination(kind: LinkKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind === "email") {
    if (/^mailto:/i.test(trimmed)) return `mailto:${trimmed.replace(/^(?:mailto:)+/i, "")}`;
    return hasExplicitScheme(trimmed) ? trimmed : `mailto:${trimmed}`;
  }
  if (kind === "phone") {
    if (/^tel:/i.test(trimmed)) return `tel:${trimmed.replace(/^(?:tel:)+/i, "")}`;
    return hasExplicitScheme(trimmed) ? trimmed : `tel:${trimmed}`;
  }
  return hasExplicitScheme(trimmed) ? trimmed : `https://${trimmed}`;
}
