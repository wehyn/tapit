export function sanitizeReturnPath(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0 || !value.startsWith("/")) return undefined;
  if (
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    /%(?![0-9a-fA-F]{2})/.test(value)
  )
    return undefined;
  try {
    const parsed = new URL(value, "https://tapit.invalid");
    return parsed.origin === "https://tapit.invalid" ? value : undefined;
  } catch {
    return undefined;
  }
}
