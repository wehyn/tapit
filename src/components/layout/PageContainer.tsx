import type { ReactNode } from "react";

export function PageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto min-w-0 w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8 ${className}`}>
      {children}
    </div>
  );
}
