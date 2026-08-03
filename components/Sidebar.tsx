"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Tag } from "@/lib/schema";

type Props = {
  topTags: Tag[];
  uncategorizedCount?: number;
  onAddLink: () => void;
};

export function Sidebar({
  topTags,
  uncategorizedCount = 0,
  onAddLink,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const navItem = (
    href: string,
    label: string,
    icon: string,
    active: boolean,
    badge?: number,
  ) => (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-secondary-container text-on-secondary-container"
          : "text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span className="flex-1">{label}</span>
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-tertiary-fixed-dim/20 px-2 py-0.5 text-[10px] font-bold text-on-surface">
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-outline-variant/40 bg-surface-container-lowest px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="material-symbols-outlined text-primary text-[28px]">
          shelves
        </span>
        <span className="text-lg font-bold text-on-surface">The Link Shelf</span>
      </div>

      <div className="mb-6">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-outline">
          Collections
        </p>
        <nav className="flex flex-col gap-1">
          {navItem("/", "All Items", "view_agenda", pathname === "/")}
          {navItem(
            "/today",
            "Today's eats",
            "restaurant",
            pathname === "/today",
          )}
          {navItem(
            "/movies",
            "Friday movie",
            "movie",
            pathname === "/movies",
          )}
          {navItem(
            "/favorites",
            "Favorites",
            "star",
            pathname === "/favorites",
          )}
          {navItem(
            "/uncategorized",
            "Uncategorized",
            "label_off",
            pathname === "/uncategorized",
            uncategorizedCount,
          )}
        </nav>
      </div>

      <div className="mb-6 flex-1 overflow-y-auto">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-outline">
            Top Tags
          </p>
          <Link
            href="/tags/manage"
            className="text-[10px] font-semibold uppercase tracking-wide text-primary"
          >
            Manage
          </Link>
        </div>
        <nav className="flex flex-col gap-1">
          {topTags.length === 0 && (
            <p className="px-3 py-2 text-sm text-on-surface-variant">
              Tags appear as you save links
            </p>
          )}
          {topTags.map((tag) =>
            navItem(
              `/tags/${tag.slug}`,
              tag.name,
              tag.icon ?? "label",
              pathname === `/tags/${tag.slug}`,
            ),
          )}
        </nav>
      </div>

      <div className="mt-auto space-y-2 border-t border-outline-variant/40 pt-4">
        <button
          type="button"
          onClick={onAddLink}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-on-primary shadow-md transition hover:-translate-y-px hover:shadow-lg md:hidden"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Link
        </button>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
