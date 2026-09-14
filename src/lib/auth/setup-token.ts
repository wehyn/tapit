const DEFAULT_TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createSetupToken(byteLength = DEFAULT_TOKEN_BYTES): string {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error("Setup tokens must contain at least 16 random bytes.");
  }
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashSetupToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toBase64Url(new Uint8Array(digest));
}

export function isSetupTokenUsable(expiresAt: number, now = Date.now()): boolean {
  return expiresAt > now;
}
