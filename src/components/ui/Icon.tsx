"use client";

import {
  ChartLineIcon,
  ClipboardTextIcon,
  CreditCardIcon,
  FingerprintIcon,
  GearSixIcon,
  IdentificationCardIcon,
  LinkIcon,
  type IconProps,
  type IconWeight,
  UserIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";

const icons = {
  audit: ClipboardTextIcon,
  card: CreditCardIcon,
  chart: ChartLineIcon,
  fingerprint: FingerprintIcon,
  gear: GearSixIcon,
  link: LinkIcon,
  profiles: IdentificationCardIcon,
  settings: GearSixIcon,
  user: UserIcon,
  users: UsersThreeIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" {...props} />;
}

export type { IconWeight };
