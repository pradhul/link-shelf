"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveHasMovieTag } from "@/lib/movie-tags";
import type { SaveWithTags } from "@/lib/saves";
import type { Tag } from "@/lib/schema";
import { AddLinkModal } from "./AddLinkModal";
import { EditLinkModal } from "./EditLinkModal";
import { LinkCard } from "./LinkCard";
import { MobileNav } from "./MobileNav";
import { NotesSheet } from "./NotesSheet";
import { PageTransition } from "./PageTransition";
import { SearchBar } from "./SearchBar";

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
  showAiCategorize?: boolean;
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
  showAiCategorize = false,
}: Props) {
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SaveWithTags | null>(null);
  const [notesSave, setNotesSave] = useState<SaveWithTags | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [categorizing, setCategorizing] = useState(false);

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

  async function toggleWatched(save: SaveWithTags) {
    await fetch(`/api/saves/${save.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isWatched: !save.isWatched }),
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

  async function aiCategorize() {
    setCategorizing(true);
    try {
      const res = await fetch("/api/saves/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "AI categorize failed");
        return;
      }
      alert(
        `Tagged ${data.tagged ?? 0} · Left uncategorized ${data.skipped ?? 0}`,
      );
      refresh();
    } finally {
      setCategorizing(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <MobileNav
        open={mobileNav}
        onClose={() => setMobileNav(false)}
        topTags={topTags}
        uncategorizedCount={uncategorizedCount}
        onAddLink={() => {
          setMobileNav(false);
          setAddOpen(true);
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-outline-variant/30 bg-background/90 px-4 py-3 backdrop-blur md:px-8">
          <button
            type="button"
            className="rounded-lg p-2 hover:bg-surface-container-high md:hidden"
            onClick={() => setMobileNav(true)}
            aria-label="Open menu"
            aria-expanded={mobileNav}
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
          <PageTransition>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-on-surface md:text-3xl">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {showAiCategorize && uncategorizedCount > 0 && (
                  <button
                    type="button"
                    disabled={categorizing}
                    onClick={aiCategorize}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-on-primary disabled:opacity-60"
                  >
                    {categorizing ? "Categorizing…" : "AI categorize"}
                  </button>
                )}
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
                    showWatchedToggle={saveHasMovieTag(save)}
                    onToggleWatched={toggleWatched}
                  />
                ))}
              </div>
            )}
          </PageTransition>
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
