const MEDIA_URLS_KEY = "__tapitMediaDataUrls";
const MEDIA_REFERENCE_PREFIX = "\u0001tapit-media:";

/** Store each demo image once, even when draft, published, and legacy profiles share it. */
export function serializeDemoState(state: unknown): string {
  const mediaUrls: string[] = [];
  const indexes = new Map<string, number>();
  const compact = JSON.parse(
    JSON.stringify(state, (_key, value: unknown) => {
      if (typeof value !== "string" || !value.startsWith("data:image/")) return value;
      let index = indexes.get(value);
      if (index === undefined) {
        index = mediaUrls.length;
        indexes.set(value, index);
        mediaUrls.push(value);
      }
      return `${MEDIA_REFERENCE_PREFIX}${index}`;
    }),
  ) as Record<string, unknown>;
  return JSON.stringify(mediaUrls.length ? { ...compact, [MEDIA_URLS_KEY]: mediaUrls } : compact);
}

export function deserializeDemoState(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const mediaUrls = parsed[MEDIA_URLS_KEY];
  if (mediaUrls === undefined) return parsed;
  if (!Array.isArray(mediaUrls) || !mediaUrls.every((url) => typeof url === "string")) {
    throw new Error("Saved demo media is invalid.");
  }
  const urls = mediaUrls as string[];
  delete parsed[MEDIA_URLS_KEY];
  function restore(value: unknown): unknown {
    if (typeof value === "string" && value.startsWith(MEDIA_REFERENCE_PREFIX)) {
      const index = Number(value.slice(MEDIA_REFERENCE_PREFIX.length));
      if (!Number.isInteger(index) || typeof urls[index] !== "string") {
        throw new Error("Saved demo media is incomplete.");
      }
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
