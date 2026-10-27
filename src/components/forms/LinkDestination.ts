export type LinkKind = "link" | "email" | "phone";

export function linkKind(destination: string): LinkKind {
  if (destination.toLowerCase().startsWith("mailto:")) return "email";
  if (destination.toLowerCase().startsWith("tel:")) return "phone";
  return "link";
}

export function displayDestination(destination: string): string {
  const kind = linkKind(destination);
  return kind === "email"
    ? destination.replace(/^(?:mailto:)+/i, "")
    : kind === "phone"
      ? destination.replace(/^(?:tel:)+/i, "")
      : destination;
}

export function formatDestination(kind: LinkKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind === "email") {
    if (/^mailto:/i.test(trimmed)) return `mailto:${trimmed.replace(/^(?:mailto:)+/i, "")}`;
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
    return `mailto:${trimmed}`;
  }
  if (kind === "phone") {
    if (/^tel:/i.test(trimmed)) return `tel:${trimmed.replace(/^(?:tel:)+/i, "")}`;
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
    return `tel:${trimmed}`;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
