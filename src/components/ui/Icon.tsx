"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartLineIcon,
  CheckIcon,
  ClipboardTextIcon,
  CreditCardIcon,
  DotsThreeIcon,
  FingerprintIcon,
  GearSixIcon,
  IdentificationCardIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  QuestionIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  type IconProps,
  type IconWeight,
  UserIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";

const icons = {
  audit: ClipboardTextIcon,
  caretDown: CaretDownIcon,
  caretRight: CaretRightIcon,
  caretUp: CaretUpIcon,
  card: CreditCardIcon,
  chart: ChartLineIcon,
  check: CheckIcon,
  close: XIcon,
  fingerprint: FingerprintIcon,
  gear: GearSixIcon,
  help: QuestionIcon,
  link: LinkIcon,
  more: DotsThreeIcon,
  profiles: IdentificationCardIcon,
  search: MagnifyingGlassIcon,
  settings: GearSixIcon,
  signOut: SignOutIcon,
  sliders: SlidersHorizontalIcon,
  user: UserIcon,
  users: UsersThreeIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" {...props} />;
}

export type { IconWeight };
