import { ProfileEditor } from "@/components/forms/ProfileEditor";
import {
  PROFILE_CUSTOMIZATION_CATEGORIES,
  type ProfileCustomizationCategory,
} from "@/lib/profile-workspace";

function parseCustomizationCategory(
  value: string | string[] | undefined,
): ProfileCustomizationCategory | undefined {
  return typeof value === "string"
    ? PROFILE_CUSTOMIZATION_CATEGORIES.find((category) => category === value)
    : undefined;
}

export default async function CustomerCustomizePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { section } = await searchParams;
  return (
    <ProfileEditor
      initialCustomizationCategory={parseCustomizationCategory(section)}
      view="customize"
    />
  );
}
