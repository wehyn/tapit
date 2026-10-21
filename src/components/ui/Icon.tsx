"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartLineIcon,
  CheckIcon,
  ClipboardTextIcon,
  CopyIcon,
  CreditCardIcon,
  DotsSixVerticalIcon,
  DotsThreeIcon,
  EyeIcon,
  FingerprintIcon,
  FloppyDiskIcon,
  GearSixIcon,
  GoogleLogoIcon,
  IdentificationCardIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  QuestionIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  type IconProps,
  type IconWeight,
  UploadSimpleIcon,
  UserIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";

const icons = {
  arrowDown: ArrowDownIcon,
  arrowLeft: ArrowLeftIcon,
  arrowUp: ArrowUpIcon,
  audit: ClipboardTextIcon,
  caretDown: CaretDownIcon,
  caretRight: CaretRightIcon,
  caretUp: CaretUpIcon,
  card: CreditCardIcon,
  chart: ChartLineIcon,
  check: CheckIcon,
  close: XIcon,
  copy: CopyIcon,
  dragHandle: DotsSixVerticalIcon,
  eye: EyeIcon,
  fingerprint: FingerprintIcon,
  gear: GearSixIcon,
  google: GoogleLogoIcon,
  help: QuestionIcon,
  link: LinkIcon,
  more: DotsThreeIcon,
  plus: PlusIcon,
  profiles: IdentificationCardIcon,
  save: FloppyDiskIcon,
  search: MagnifyingGlassIcon,
  settings: GearSixIcon,
  signOut: SignOutIcon,
  sliders: SlidersHorizontalIcon,
  trash: TrashIcon,
  upload: UploadSimpleIcon,
  user: UserIcon,
  users: UsersThreeIcon,
  warning: WarningCircleIcon,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, ...props }: IconProps & { name: IconName }) {
  const IconComponent = icons[name];
  return <IconComponent aria-hidden="true" {...props} />;
}

export type { IconWeight };
