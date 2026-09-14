"use client";

import { FingerprintIcon, type IconProps, type IconWeight } from "@phosphor-icons/react";

const icons = {
  fingerprint: FingerprintIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" {...props} />;
}

export type { IconWeight };
