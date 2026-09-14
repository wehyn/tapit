import { v } from "convex/values";

export const linkValidator = v.object({
  id: v.string(),
  label: v.string(),
  destination: v.string(),
  enabled: v.boolean(),
  icon: v.optional(v.string()),
});

export const profileContentValidator = v.object({
  name: v.string(),
  slug: v.string(),
  bio: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  website: v.optional(v.string()),
  links: v.array(linkValidator),
});

export const profileStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("unpublished"),
  v.literal("suspended"),
);

export function isSafeDestination(destination: string): boolean {
  if (!destination.trim()) return false;
  try {
    const parsed = new URL(destination);
    if (parsed.protocol === "https:") return parsed.hostname.length > 0;
    if (parsed.protocol === "mailto:")
      return parsed.pathname.length > 0 && !/[\s<>]/.test(parsed.pathname);
    return parsed.protocol === "tel:" && /^[0-9+().\- x#*]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function validateProfileContent(content: {
  name: string;
  slug: string;
  links: Array<{ label: string; destination: string; enabled: boolean }>;
}): string[] {
  const errors: string[] = [];
  if (!content.name.trim()) errors.push("A nonblank profile name is required.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.slug)) errors.push("The profile slug is invalid.");
  const seen = new Set<string>();
  for (const link of content.links) {
    if (!link.enabled) continue;
    if (!link.label.trim() || !isSafeDestination(link.destination))
      errors.push("Every enabled link needs a label and safe destination.");
    const normalizedDestination = link.destination.trim().toLowerCase();
    if (normalizedDestination && seen.has(normalizedDestination))
      errors.push("Duplicate link destinations are not allowed.");
    if (normalizedDestination) seen.add(normalizedDestination);
  }
  if (
    content.links.filter(
      (link) => link.enabled && link.label.trim() && isSafeDestination(link.destination),
    ).length === 0
  ) {
    errors.push("At least one valid enabled link is required.");
  }
  return errors;
}
