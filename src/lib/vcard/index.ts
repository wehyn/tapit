export type VCardFields = {
  name: string;
  email?: string;
  website?: string;
  profileUrl: string;
};

export function resolveProfileUrl(profileUrl: string, origin: string): string {
  return new URL(profileUrl, origin).toString();
}

function escapeVCard(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/[\r\n]/g, "\\n");
}

export function buildVCard(fields: VCardFields): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(fields.name)}`,
    `URL:${escapeVCard(fields.profileUrl)}`,
  ];
  if (fields.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(fields.email.trim())}`);
  if (fields.website?.trim()) lines.push(`item1.URL:${escapeVCard(fields.website.trim())}`);
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}
