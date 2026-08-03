"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SaveWithTags } from "@/lib/saves";
import type { Tag } from "@/lib/schema";
import { AddLinkModal } from "./AddLinkModal";
import { EditLinkModal } from "./EditLinkModal";
import { LinkCard } from "./LinkCard";
import { NotesSheet } from "./NotesSheet";
import { SearchBar } from "./SearchBar";
import { Sidebar } from "./Sidebar";

type Props = {
  saves: SaveWithTags[];
  topTags: Tag[];
  title: string;
  subtitle: string;
  uncategorizedCount?: number;
  subtags?: Tag[];
  activeSubtagSlug?: string | null;
  tagSlug?: string;
  showBulkRepair?: boolean;
};

export function ShelfShell({
  saves,
  topTags,
  title,
  subtitle,
  uncategorizedCount = 0,
  subtags,
  activeSubtagSlug,
  tagSlug,
  showBulkRepair = false,
}: Props) {
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SaveWithTags | null>(null);
  const [notesSave, setNotesSave] = useState<SaveWithTags | null>(null);
  const [repairing, setRepairing] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function toggleFavorite(save: SaveWithTags) {
    await fetch(`/api/saves/${save.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: !save.isFavorite }),
    });
    refresh();
  }

  async function remove(save: SaveWithTags) {
    if (!confirm("Delete this link?")) return;
    await fetch(`/api/saves/${save.id}`, { method: "DELETE" });
    refresh();
  }

  async function refreshPreview(save: SaveWithTags) {
    await fetch(`/api/saves/${save.id}/refresh-preview`, { method: "POST" });
    refresh();
  }

  async function bulkRepairYoutube() {
    setRepairing(true);
    try {
      const res = await fetch("/api/saves/refresh-junk-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = await res.json();
      alert(`Refreshed ${data.refreshed ?? 0} YouTube previews`);
      refresh();
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div
        className={`${mobileNav ? "fixed inset-0 z-40 flex" : "hidden"} md:static md:flex`}
      >
        {mobileNav && (
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-on-surface/30 md:hidden"
            onClick={() => setMobileNav(false)}
          />
        )}
        <div className="relative z-50 h-full">
          <Sidebar
            topTags={topTags}
            uncategorizedCount={uncategorizedCount}
            onAddLink={() => {
              setMobileNav(false);
              setAddOpen(true);
            }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant/30 bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-surface-container-high md:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <SearchBar />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="ml-auto hidden items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-md md:flex"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Link
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-container text-on-primary">
            <span className="material-symbols-outlined text-[20px]">person</span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-on-surface md:text-3xl">
                {title}
              </h1>
              <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
            </div>
            {showBulkRepair && (
              <button
                type="button"
                disabled={repairing}
                onClick={bulkRepairYoutube}
                className="rounded-lg bg-surface-container-high px-3 py-2 text-xs font-semibold text-on-surface disabled:opacity-60"
              >
                {repairing ? "Repairing…" : "Repair titles & notes"}
              </button>
            )}
          </div>

          {subtags && tagSlug && (
            <div className="mb-6 flex flex-wrap gap-2">
              <a
                href={`/tags/${tagSlug}`}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  !activeSubtagSlug
                    ? "bg-secondary-container text-on-secondary-container"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                All
              </a>
              {subtags.map((s) => (
                <a
                  key={s.id}
                  href={`/tags/${tagSlug}?sub=${s.slug}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    activeSubtagSlug === s.slug
                      ? "bg-secondary-container text-on-secondary-container"
                      : "bg-surface-container-high text-on-surface-variant"
                  }`}
                >
                  {s.name}
                </a>
              ))}
            </div>
          )}

          {saves.length === 0 ? (
            <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-16 text-center">
              <span className="material-symbols-outlined mb-3 text-4xl text-outline">
                shelves
              </span>
              <p className="font-medium text-on-surface">No links yet</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Share a link to your Telegram bot or use Add Link.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {saves.map((save) => (
                <LinkCard
                  key={save.id}
                  save={save}
                  onEdit={setEditing}
                  onToggleFavorite={toggleFavorite}
                  onDelete={remove}
                  onRefreshPreview={refreshPreview}
                  onViewNotes={setNotesSave}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <AddLinkModal
        open={addOpen}
        topTags={topTags}
        onClose={() => setAddOpen(false)}
        onSaved={refresh}
      />
      <EditLinkModal
        open={Boolean(editing)}
        save={editing}
        topTags={topTags}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <NotesSheet
        open={Boolean(notesSave)}
        save={notesSave}
        onClose={() => setNotesSave(null)}
        onEdit={(save) => {
          setNotesSave(null);
          setEditing(save);
        }}
      />
    </div>
  );
}
