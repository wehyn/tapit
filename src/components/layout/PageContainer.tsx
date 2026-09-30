import type { ReactNode } from "react";

export function PageContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-9 ${className}`}>
      {children}
    </div>
  );
}
