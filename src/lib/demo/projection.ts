import type { ProfileContent, PublicProfileProjection } from "../domain";
import { projectPublicProfile, type PublishedProfileSnapshot } from "../domain";
import type { DemoProfile, ProfileTheme } from "./fixtures";

/** Projects demo content while retaining the legacy theme stored beside the profile. */
export function projectDemoPublicProfile(
  profile: DemoProfile,
  content: ProfileContent | PublishedProfileSnapshot | null = profile.published,
  legacyTheme?: ProfileTheme,
): PublicProfileProjection | null {
  if (content === null) return null;
  return projectPublicProfile({
    ...profile,
    status: "published",
    published: {
      ...content,
      theme: legacyTheme ?? content.theme ?? profile.theme,
      publishedAt: "publishedAt" in content ? content.publishedAt : new Date().toISOString(),
    },
  });
}
