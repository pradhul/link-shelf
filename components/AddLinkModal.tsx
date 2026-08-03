"use client";

import { useState } from "react";
import type { Tag } from "@/lib/schema";

type Props = {
  open: boolean;
  topTags: Tag[];
  onClose: () => void;
  onSaved: () => void;
};

export function AddLinkModal({ open, topTags, onClose, onSaved }: Props) {
  const [url, setUrl] = useState("");
  const [topTagName, setTopTagName] = useState("");
  const [subTagName, setSubTagName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          topTagName: topTagName || null,
          subTagName: subTagName || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setUrl("");
      setTopTagName("");
      setSubTagName("");
      setNotes("");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl bg-surface-container-lowest p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-on-surface">Add Link</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              URL
            </span>
            <input
              required
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Top-level Tag
            </span>
            <input
              list="top-tags"
              value={topTagName}
              onChange={(e) => setTopTagName(e.target.value)}
              placeholder="e.g. Recipes"
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
            <datalist id="top-tags">
              {topTags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Subtag (Optional)
            </span>
            <input
              value={subTagName}
              onChange={(e) => setSubTagName(e.target.value)}
              placeholder="e.g. Pasta"
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          {error && <p className="text-sm text-error">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-on-surface-variant"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Link"}
          </button>
        </div>
      </form>
    </div>
  );
}
