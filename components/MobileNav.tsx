"use client";

import { useEffect, useState } from "react";
import type { Tag } from "@/lib/schema";
import { Sidebar } from "./Sidebar";

type Props = {
  open: boolean;
  onClose: () => void;
  topTags: Tag[];
  uncategorizedCount?: number;
  onAddLink: () => void;
};

/**
 * Desktop: always-visible sidebar.
 * Mobile: slide-in drawer + fading backdrop with exit animation.
 */
export function MobileNav({
  open,
  onClose,
  topTags,
  uncategorizedCount = 0,
  onAddLink,
}: Props) {
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const timeout = window.setTimeout(() => setRendered(false), 280);
    return () => window.clearTimeout(timeout);
  }, [open]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          topTags={topTags}
          uncategorizedCount={uncategorizedCount}
          onAddLink={onAddLink}
        />
      </div>

      {/* Mobile drawer */}
      {rendered && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            aria-label="Close menu"
            className={`nav-backdrop absolute inset-0 bg-on-surface/35 ${
              entered ? "nav-backdrop-open" : ""
            }`}
            onClick={onClose}
          />
          <div
            className={`nav-drawer relative z-50 h-full shadow-xl ${
              entered ? "nav-drawer-open" : ""
            }`}
          >
            <Sidebar
              topTags={topTags}
              uncategorizedCount={uncategorizedCount}
              onAddLink={onAddLink}
              onNavigate={onClose}
            />
          </div>
        </div>
      )}
    </>
  );
}
