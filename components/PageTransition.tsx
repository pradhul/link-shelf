"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Soft fade + rise when the route (or remounted shell) changes.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
