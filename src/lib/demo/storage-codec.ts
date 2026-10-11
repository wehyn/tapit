const MEDIA_URLS_KEY = "__tapitMediaDataUrls";
const MEDIA_CODEC_VERSION_KEY = "__tapitMediaCodecVersion";
const MEDIA_REFERENCE_PREFIX = "\u0001tapit-media:";
const MEDIA_CODEC_VERSION = 2;

export class UnsupportedDemoStorageVersionError extends Error {
  constructor() {
    super("Saved demo media uses an unsupported format.");
    this.name = "UnsupportedDemoStorageVersionError";
  }
}

/** Store each demo image once, even when draft, published, and legacy profiles share it. */
export function serializeDemoState(state: unknown): string {
  const mediaUrls: string[] = [];
  const indexes = new Map<string, number>();
  let hasEscapedText = false;
  const compact = JSON.parse(
    JSON.stringify(state, (_key, value: unknown) => {
      if (typeof value !== "string") return value;
      if (value.startsWith(MEDIA_REFERENCE_PREFIX)) {
        hasEscapedText = true;
        return `${MEDIA_REFERENCE_PREFIX}${value}`;
      }
      if (!value.startsWith("data:image/")) return value;
      let index = indexes.get(value);
      if (index === undefined) {
        index = mediaUrls.length;
        indexes.set(value, index);
        mediaUrls.push(value);
      }
      return `${MEDIA_REFERENCE_PREFIX}${index}`;
    }),
  ) as Record<string, unknown>;
  return JSON.stringify(
    mediaUrls.length || hasEscapedText
      ? {
          ...compact,
          [MEDIA_URLS_KEY]: mediaUrls,
          [MEDIA_CODEC_VERSION_KEY]: MEDIA_CODEC_VERSION,
        }
      : compact,
  );
}

export function deserializeDemoState(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const version = parsed[MEDIA_CODEC_VERSION_KEY];
  if (version !== undefined && version !== 1 && version !== MEDIA_CODEC_VERSION) {
    throw new UnsupportedDemoStorageVersionError();
  }
  const mediaUrls = parsed[MEDIA_URLS_KEY];
  const escapedReferences = version === MEDIA_CODEC_VERSION;
  const urls =
    Array.isArray(mediaUrls) && mediaUrls.every((url) => typeof url === "string") ? mediaUrls : [];
  delete parsed[MEDIA_URLS_KEY];
  delete parsed[MEDIA_CODEC_VERSION_KEY];
  function restore(value: unknown): unknown {
    if (
      typeof value === "string" &&
      escapedReferences &&
      value.startsWith(MEDIA_REFERENCE_PREFIX + MEDIA_REFERENCE_PREFIX)
    ) {
      return value.slice(MEDIA_REFERENCE_PREFIX.length);
    }
    if (typeof value === "string" && value.startsWith(MEDIA_REFERENCE_PREFIX)) {
      const reference = value.slice(MEDIA_REFERENCE_PREFIX.length);
      if (!/^(0|[1-9]\d*)$/.test(reference)) return value;
      const index = Number(reference);
      if (!Number.isSafeInteger(index) || typeof urls[index] !== "string") return value;
      return urls[index];
    }
    if (Array.isArray(value)) return value.map(restore);
    if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        (value as Record<string, unknown>)[key] = restore(entry);
      }
    }
    return value;
  }
  return restore(parsed);
}
