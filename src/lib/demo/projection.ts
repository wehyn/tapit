import type {
  ProfileContent,
  PublicProfileProjection,
  PublicProfileProjectionOptions,
} from "../domain";
import { projectPublicProfile, type PublishedProfileSnapshot } from "../domain";
import type { DemoProfile, ProfileTheme } from "./fixtures";

/** Projects demo content, using the legacy theme only when the published snapshot has none. */
export function projectDemoPublicProfile(
  profile: DemoProfile,
  content: ProfileContent | PublishedProfileSnapshot | null = profile.published,
  legacyTheme?: ProfileTheme,
  options: PublicProfileProjectionOptions = {},
): PublicProfileProjection | null {
  if (content === null || profile.status !== "published") return null;
  return projectPublicProfile(
    {
      ...profile,
      status: "published",
      published: {
        ...content,
        theme: content.theme ?? legacyTheme ?? profile.theme,
        publishedAt: "publishedAt" in content ? content.publishedAt : new Date().toISOString(),
      },
    },
    options,
  );
}
