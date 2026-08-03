"use client";

import { useState } from "react";
import type { Tag } from "@/lib/schema";

type Props = {
  open: boolean;
  topTags: Tag[];
  onClose: () => void;
  onSaved: () => void;
};

type Row = { key: string; topTagName: string; subTagName: string };

function emptyRow(): Row {
  return {
    key: Math.random().toString(36).slice(2),
    topTagName: "",
    subTagName: "",
  };
}

export function AddLinkModal({ open, topTags, onClose, onSaved }: Props) {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const classifications = rows
        .filter((r) => r.topTagName.trim())
        .map((r) => ({
          topTagName: r.topTagName.trim(),
          subTagName: r.subTagName.trim() || null,
        }));

      const res = await fetch("/api/saves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          classifications,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setUrl("");
      setRows([emptyRow()]);
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl"
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
                Tags
              </span>
              <button
                type="button"
                onClick={() => setRows((r) => [...r, emptyRow()])}
                className="text-xs font-semibold text-primary"
              >
                + Add tag
              </button>
            </div>
            {rows.map((row, i) => (
              <div
                key={row.key}
                className="rounded-lg bg-surface-container-low p-3"
              >
                <div className="mb-1 flex justify-between">
                  <span className="text-xs text-on-surface-variant">
                    Tag {i + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((r) => r.key !== row.key))
                      }
                      className="text-xs text-error"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  list="top-tags"
                  value={row.topTagName}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, topTagName: e.target.value }
                          : r,
                      ),
                    )
                  }
                  placeholder="e.g. Recipes"
                  className="w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
                />
                <input
                  value={row.subTagName}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, subTagName: e.target.value }
                          : r,
                      ),
                    )
                  }
                  placeholder="Subtag (optional)"
                  className="mt-1 w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
                />
              </div>
            ))}
            <datalist id="top-tags">
              {topTags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>

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
