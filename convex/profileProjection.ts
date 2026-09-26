import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getProfileImageMapping, resolveProfileImageUrl } from "./profileImages";
import { resolveOwnedProfileMedia, resolvePublishedProfileMedia } from "./profileMedia";

type ProjectionContext = Pick<QueryCtx, "db" | "storage">;

function replaceProjectedMedia<T extends { media?: unknown }>(content: T, media: unknown) {
  const withoutMedia = { ...content };
  delete withoutMedia.media;
  return media === undefined ? withoutMedia : { ...withoutMedia, media };
}

export async function projectPublicProfile(ctx: ProjectionContext, profile: Doc<"profiles">) {
  if (profile.status !== "published" || profile.published === undefined) return null;
  const imageUrl = await resolveProfileImageUrl(ctx, profile, profile.published);
  let imageSrcSet: string | undefined;
  if (imageUrl !== undefined && profile.published.imageStorageId !== undefined) {
    const mapping = await getProfileImageMapping(ctx, profile.published.imageStorageId);
    if (
      mapping?.profileId === profile._id &&
      mapping.ownerId === profile.ownerId &&
      mapping.smallStorageId !== undefined
    ) {
      const smallUrl = await ctx.storage.getUrl(mapping.smallStorageId);
      if (smallUrl !== null) imageSrcSet = `${smallUrl} 192w, ${imageUrl} 384w`;
    }
  }
  const media = await resolvePublishedProfileMedia(ctx, profile, profile.published.media);
  return {
    id: profile._id,
    slug: profile.published.slug,
    name: profile.published.name,
    ...(profile.published.bio === undefined ? {} : { bio: profile.published.bio }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
    ...(imageSrcSet === undefined ? {} : { imageSrcSet }),
    ...(profile.published.email === undefined ? {} : { email: profile.published.email }),
    ...(profile.published.phone === undefined ? {} : { phone: profile.published.phone }),
    ...(profile.published.website === undefined ? {} : { website: profile.published.website }),
    theme: profile.published.theme ?? "paper",
    ...(profile.published.customization === undefined
      ? {}
      : { customization: profile.published.customization }),
    ...(media === undefined ? {} : { media }),
    links: profile.published.links.filter((link) => link.enabled),
  };
}

export async function projectOwnedProfile(ctx: ProjectionContext, profile: Doc<"profiles">) {
  const draftImageUrl = await resolveProfileImageUrl(ctx, profile, profile.draft);
  const publishedImageUrl =
    profile.published === undefined
      ? undefined
      : await resolveProfileImageUrl(ctx, profile, profile.published);
  const draftMedia = await resolveOwnedProfileMedia(ctx, profile, profile.draft.media);
  const publishedMedia =
    profile.published === undefined
      ? undefined
      : await resolveOwnedProfileMedia(ctx, profile, profile.published.media);
  return {
    ...profile,
    draft: replaceProjectedMedia(
      {
        ...profile.draft,
        ...(draftImageUrl === undefined ? {} : { imageUrl: draftImageUrl }),
      },
      draftMedia,
    ),
    ...(profile.published === undefined
      ? {}
      : {
          published: replaceProjectedMedia(
            {
              ...profile.published,
              ...(publishedImageUrl === undefined ? {} : { imageUrl: publishedImageUrl }),
            },
            publishedMedia,
          ),
        }),
  };
}
