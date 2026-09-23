import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getProfileImageMapping, resolveProfileImageUrl } from "./profileImages";

type ProjectionContext = Pick<QueryCtx, "db" | "storage">;

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
    links: profile.published.links.filter((link) => link.enabled),
  };
}

export async function projectOwnedProfile(ctx: ProjectionContext, profile: Doc<"profiles">) {
  const draftImageUrl = await resolveProfileImageUrl(ctx, profile, profile.draft);
  const publishedImageUrl =
    profile.published === undefined
      ? undefined
      : await resolveProfileImageUrl(ctx, profile, profile.published);
  return {
    ...profile,
    draft: {
      ...profile.draft,
      ...(draftImageUrl === undefined ? {} : { imageUrl: draftImageUrl }),
    },
    ...(profile.published === undefined
      ? {}
      : {
          published: {
            ...profile.published,
            ...(publishedImageUrl === undefined ? {} : { imageUrl: publishedImageUrl }),
          },
        }),
  };
}
