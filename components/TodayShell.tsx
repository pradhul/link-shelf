"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HydratedPick } from "@/lib/recommend";
import type { Tag } from "@/lib/schema";
import type { SaveWithTags } from "@/lib/saves";
import { AddLinkModal } from "./AddLinkModal";
import { EditLinkModal } from "./EditLinkModal";
import { LinkCard } from "./LinkCard";
import { MobileNav } from "./MobileNav";
import { NotesSheet } from "./NotesSheet";
import { PageTransition } from "./PageTransition";
import { SearchBar } from "./SearchBar";

type Props = {
  date: string;
  picks: HydratedPick[];
  topTags: Tag[];
  uncategorizedCount: number;
  errorMessage?: string | null;
};

export function TodayShell({
  date,
  picks,
  topTags,
  uncategorizedCount,
  errorMessage,
}: Props) {
  const router = useRouter();
  const [mobileNav, setMobileNav] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<SaveWithTags | null>(null);
  const [notesSave, setNotesSave] = useState<SaveWithTags | null>(null);
  const [generating, setGenerating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  async function generateToday() {
    setGenerating(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/recommendations/today", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error ?? "Failed to generate picks");
        return;
      }
      refresh();
    } catch {
      setLocalError("Failed to generate picks");
    } finally {
      setGenerating(false);
    }
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

  const displayError = localError ?? errorMessage;

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
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <PageTransition>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-on-surface md:text-3xl">
                  Today&apos;s eats
                </h1>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Picks for {date} · grounded in your cooking saves
                </p>
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={generateToday}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary shadow-sm disabled:opacity-60"
              >
                {generating ? "Generating…" : "Generate today’s picks"}
              </button>
            </div>

            {displayError && (
              <div className="mb-6 rounded-lg bg-error-container/40 px-4 py-3 text-sm text-on-surface">
                {displayError}
              </div>
            )}

            {picks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-16 text-center">
                <span className="material-symbols-outlined mb-3 text-4xl text-outline">
                  restaurant
                </span>
                <p className="font-medium text-on-surface">No picks yet</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Tag some saves as recipes/cooking, then generate today&apos;s
                  picks.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {picks.map((pick) => (
                  <div key={pick.saveId} className="flex flex-col gap-2">
                    {pick.save ? (
                      <LinkCard
                        save={pick.save}
                        onEdit={setEditing}
                        onToggleFavorite={toggleFavorite}
                        onDelete={remove}
                        onRefreshPreview={refreshPreview}
                        onViewNotes={setNotesSave}
                      />
                    ) : (
                      <div className="rounded-xl bg-surface-container-lowest p-4 text-sm text-on-surface-variant ring-1 ring-outline-variant/30">
                        Save missing ({pick.saveId.slice(0, 8)}…)
                      </div>
                    )}
                    <p className="px-1 text-sm leading-relaxed text-on-surface-variant">
                      {pick.reason}
                    </p>
                  </div>
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
