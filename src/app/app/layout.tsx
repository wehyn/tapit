import { WorkspaceShell } from "@/components/layout/WorkspaceShell";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceShell audience="customer">{children}</WorkspaceShell>;
}
