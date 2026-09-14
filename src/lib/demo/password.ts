const DEMO_PASSWORD_HASH_PREFIX = "sha256:";

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const INITIAL_HASH = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function wordAt(words: Uint32Array, index: number): number {
  return words[index] ?? 0;
}

function hashAt(hash: number[], index: number): number {
  return hash[index] ?? 0;
}

function sha256(password: string): string {
  const input = new TextEncoder().encode(password);
  const blockLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(blockLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(blockLength - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(blockLength - 4, bitLength >>> 0);

  const hash: number[] = [...INITIAL_HASH];
  for (let offset = 0; offset < blockLength; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const first =
        rotateRight(wordAt(words, index - 15), 7) ^
        rotateRight(wordAt(words, index - 15), 18) ^
        (wordAt(words, index - 15) >>> 3);
      const second =
        rotateRight(wordAt(words, index - 2), 17) ^
        rotateRight(wordAt(words, index - 2), 19) ^
        (wordAt(words, index - 2) >>> 10);
      words[index] = (wordAt(words, index - 16) + first + wordAt(words, index - 7) + second) >>> 0;
    }

    let a = hashAt(hash, 0);
    let b = hashAt(hash, 1);
    let c = hashAt(hash, 2);
    let d = hashAt(hash, 3);
    let e = hashAt(hash, 4);
    let f = hashAt(hash, 5);
    let g = hashAt(hash, 6);
    let h = hashAt(hash, 7);
    for (let index = 0; index < 64; index += 1) {
      const choose = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const first = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const second = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const temporary1 =
        (h + first + choose + (SHA256_CONSTANTS[index] ?? 0) + wordAt(words, index)) >>> 0;
      const temporary2 = (second + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hashAt(hash, 0) + a) >>> 0;
    hash[1] = (hashAt(hash, 1) + b) >>> 0;
    hash[2] = (hashAt(hash, 2) + c) >>> 0;
    hash[3] = (hashAt(hash, 3) + d) >>> 0;
    hash[4] = (hashAt(hash, 4) + e) >>> 0;
    hash[5] = (hashAt(hash, 5) + f) >>> 0;
    hash[6] = (hashAt(hash, 6) + g) >>> 0;
    hash[7] = (hashAt(hash, 7) + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

// This is only a browser-local demo adapter. Production passwords are handled by Convex Auth.
export const DEFAULT_DEMO_PASSWORD_HASH = `${DEMO_PASSWORD_HASH_PREFIX}7563be880203cab6bd49f40ff0493b0aabf155340d8cc2c0e1a0230142e19f14`;

export async function hashDemoPassword(password: string): Promise<string> {
  return `${DEMO_PASSWORD_HASH_PREFIX}${sha256(password)}`;
}

export async function verifyDemoPassword(
  password: string,
  passwordHash: string | undefined,
): Promise<boolean> {
  // Preserve login for state created by an older local demo build; a successful setup or
  // password change upgrades the record to a digest.
  if (passwordHash === undefined) return password === "tapit-demo";
  return (await hashDemoPassword(password)) === passwordHash;
}
