import type { ProfileContent } from "@/lib/domain";

export type ProfileChecklistStep = {
  id: string;
  label: string;
  done: boolean;
  href?: string;
};

export function profileChecklistSteps(
  draft: ProfileContent,
  published: boolean,
): ProfileChecklistStep[] {
  return [
    {
      id: "photo",
      label: "Add a photo",
      done: Boolean(draft.imageUrl || draft.imageStorageId),
    },
    {
      id: "name",
      label: "Name and headline",
      done: draft.name.trim() !== "" && (draft.bio ?? "").trim() !== "",
    },
    {
      id: "links",
      label: "Add three links",
      done: draft.links.filter((link) => link.enabled).length >= 3,
      href: "/app/links",
    },
    {
      id: "look",
      label: "Choose a look",
      done: draft.customization !== undefined,
      href: "/app/customize",
    },
    {
      id: "publish",
      label: "Publish your profile",
      done: published,
    },
  ];
}
