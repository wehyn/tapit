export type LinkKind = "link" | "email" | "phone";

export function linkKind(destination: string): LinkKind {
  if (destination.toLowerCase().startsWith("mailto:")) return "email";
  if (destination.toLowerCase().startsWith("tel:")) return "phone";
  return "link";
}

export function displayDestination(destination: string): string {
  const kind = linkKind(destination);
  return kind === "email"
    ? destination.slice(7)
    : kind === "phone"
      ? destination.slice(4)
      : destination;
}

export function formatDestination(kind: LinkKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind === "email") return `mailto:${trimmed.replace(/^mailto:/i, "")}`;
  if (kind === "phone") return `tel:${trimmed.replace(/^tel:/i, "")}`;
  return /^https:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
