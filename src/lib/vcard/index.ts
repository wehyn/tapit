export type VCardFields = {
  name: string;
  email?: string;
  phone?: string;
  links?: readonly VCardLink[];
  photo?: VCardPhoto;
};

export type VCardLink = { label: string; destination: string };
export type VCardPhoto = { type: "JPEG" | "PNG"; base64: string };

function escapeVCard(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/[\r\n]/g, "\\n");
}

function normalizedDestination(value: string): string {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).toString();
  } catch {
    return trimmed;
  }
}

function foldVCardLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let byteLength = 0;

  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (byteLength + characterBytes > 75) {
      parts.push(current);
      current = " ";
      byteLength = 1;
    }
    current += character;
    byteLength += characterBytes;
  }

  parts.push(current);
  return parts.join("\r\n");
}

export function buildVCard(fields: VCardFields): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(fields.name)}`];
  if (fields.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(fields.email.trim())}`);
  if (fields.phone?.trim()) lines.push(`TEL;TYPE=VOICE:${escapeVCard(fields.phone.trim())}`);
  if (fields.photo) {
    lines.push(`PHOTO;ENCODING=b;TYPE=${fields.photo.type}:${fields.photo.base64}`);
  }

  const seenDestinations = new Set<string>();
  let group = 1;
  for (const link of fields.links ?? []) {
    const destination = link.destination.trim();
    const label = link.label.trim();
    const normalized = normalizedDestination(destination);
    if (!destination || !label || seenDestinations.has(normalized)) continue;
    seenDestinations.add(normalized);
    lines.push(`item${group}.URL:${escapeVCard(destination)}`);
    lines.push(`item${group}.X-ABLabel:${escapeVCard(label)}`);
    group += 1;
  }

  lines.push("END:VCARD");
  return `${lines.map(foldVCardLine).join("\r\n")}\r\n`;
}
