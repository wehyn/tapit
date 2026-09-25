import type { MutationCtx } from "./_generated/server";
import {
  normalizeProfileSlug,
  validateProfileSlugValue,
  MAX_PROFILE_SLUG_LENGTH,
} from "./validators";

type SlugCtx = Pick<MutationCtx, "db">;

function seedToSlug(seed: string): string {
  const ascii = seed.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const words = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return words || "profile";
}

export async function allocateProfileSlug(
  ctx: SlugCtx,
  seed: string,
  requestedSlug?: string,
): Promise<string> {
  if (requestedSlug !== undefined) {
    const slug = normalizeProfileSlug(requestedSlug);
    const error = validateProfileSlugValue(slug);
    if (error !== null) throw new Error(error);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing !== null) throw new Error("That profile slug is already in use.");
    return slug;
  }

  const base = seedToSlug(seed);
  for (let suffix = 1; ; suffix += 1) {
    const suffixText = suffix === 1 ? "" : `-${suffix}`;
    const maxBaseLength = MAX_PROFILE_SLUG_LENGTH - suffixText.length;
    const candidateBase = base.slice(0, maxBaseLength).replace(/-+$/, "") || "profile";
    const candidate = `${candidateBase}${suffixText}`;
    if (validateProfileSlugValue(candidate) !== null) continue;
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (existing === null) return candidate;
  }
}
