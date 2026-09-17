export const CLAIM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLAIM_CODE_LENGTH = 8;

/** Normalizes user-entered claim codes without making an authorization decision. */
export function normalizeClaimCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{8}$/.test(normalized) ? normalized : null;
}

export function generateClaimCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < CLAIM_CODE_LENGTH; index += 1) {
    code += CLAIM_CODE_ALPHABET[Math.floor(random() * CLAIM_CODE_ALPHABET.length)] ?? "";
  }
  return code;
}
