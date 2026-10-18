const RESERVED_PROFILE_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "build-card",
  "c",
  "login",
  "onboarding",
  "privacy",
  "setup",
  "terms",
]);

export function isReservedProfileSlug(slug: string): boolean {
  return RESERVED_PROFILE_SLUGS.has(slug);
}
