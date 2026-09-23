import type { IconName } from "../ui/Icon";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: IconName;
};

export type ShellNavGroup = {
  label: string;
  items: ShellNavItem[];
};
