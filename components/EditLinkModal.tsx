"use client";

import { useEffect, useState } from "react";
import type { SaveWithTags } from "@/lib/saves";
import type { Tag } from "@/lib/schema";

type Props = {
  save: SaveWithTags | null;
  topTags: Tag[];
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type RowState = {
  key: string;
  topTagId: string;
  subTagId: string;
  newTopTag: string;
  newSubTag: string;
  subtags: Tag[];
};

function emptyRow(): RowState {
  return {
    key: Math.random().toString(36).slice(2),
    topTagId: "",
    subTagId: "",
    newTopTag: "",
    newSubTag: "",
    subtags: [],
  };
}

export function EditLinkModal({ save, topTags, open, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!save) return;
    setTitle(save.title ?? "");
    setNotes(save.notes ?? "");
    if (save.classifications.length === 0) {
      setRows([emptyRow()]);
      return;
    }
    setRows(
      save.classifications.map((c) => ({
        key: c.topTag.id,
        topTagId: c.topTag.id,
        subTagId: c.subTag?.id ?? "",
        newTopTag: "",
        newSubTag: "",
        subtags: [],
      })),
    );
  }, [save]);

  useEffect(() => {
    let cancelled = false;
    async function loadSubs() {
      for (const row of rows) {
        if (!row.topTagId) continue;
        const res = await fetch(`/api/tags?parentId=${row.topTagId}`);
        const d = await res.json();
        if (cancelled) return;
        setRows((prev) =>
          prev.map((r) =>
            r.key === row.key && r.topTagId === row.topTagId
              ? { ...r, subtags: d.items ?? [] }
              : r,
          ),
        );
      }
    }
    void loadSubs();
    return () => {
      cancelled = true;
    };
    // Only reload when top tag ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.key}:${r.topTagId}`).join("|")]);

  if (!open || !save) return null;

  async function resolveRows() {
    const classifications: { topTagId: string; subTagId: string | null }[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      let resolvedTop = row.topTagId || null;
      let resolvedSub = row.subTagId || null;

      if (row.newTopTag.trim()) {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.newTopTag.trim() }),
        });
        const tag = await res.json();
        resolvedTop = tag.id;
      }

      if (row.newSubTag.trim() && resolvedTop) {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: row.newSubTag.trim(),
            parentId: resolvedTop,
          }),
        });
        const tag = await res.json();
        resolvedSub = tag.id;
      }

      if (!resolvedTop || seen.has(resolvedTop)) continue;
      seen.add(resolvedTop);
      classifications.push({
        topTagId: resolvedTop,
        subTagId: resolvedSub,
      });
    }

    return classifications;
  }

  async function handleSave() {
    if (!save) return;
    setSaving(true);
    try {
      const classifications = await resolveRows();
      await fetch(`/api/saves/${save.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes: notes || null,
          classifications,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function updateRow(key: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-on-surface">
            Edit Link Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="mb-4 flex gap-3 rounded-lg bg-surface-container-low p-3">
          {save.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={save.thumbnailUrl}
              alt=""
              className="h-16 w-16 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-on-surface">
              {save.title || save.url}
            </p>
            <p className="truncate text-xs text-on-surface-variant">{save.url}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Display Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
                Tags (multiple tops allowed)
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
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-on-surface-variant">
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
                <select
                  value={row.topTagId}
                  onChange={(e) =>
                    updateRow(row.key, {
                      topTagId: e.target.value,
                      subTagId: "",
                      newTopTag: "",
                      subtags: [],
                    })
                  }
                  className="w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
                >
                  <option value="">None / new below</option>
                  {topTags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.newTopTag}
                  onChange={(e) =>
                    updateRow(row.key, { newTopTag: e.target.value })
                  }
                  placeholder="Or type a new top tag…"
                  className="mt-1 w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none ring-primary focus:ring-2"
                />
                <select
                  value={row.subTagId}
                  onChange={(e) =>
                    updateRow(row.key, {
                      subTagId: e.target.value,
                      newSubTag: "",
                    })
                  }
                  disabled={!row.topTagId && !row.newTopTag}
                  className="mt-2 w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2 disabled:opacity-50"
                >
                  <option value="">No subtag</option>
                  {row.subtags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <input
                  value={row.newSubTag}
                  onChange={(e) =>
                    updateRow(row.key, { newSubTag: e.target.value })
                  }
                  placeholder="Or type a new subtag…"
                  disabled={!row.topTagId && !row.newTopTag}
                  className="mt-1 w-full rounded-lg bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none ring-primary focus:ring-2 disabled:opacity-50"
                />
              </div>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Personal Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          {save.addedVia === "telegram" && (
            <p className="text-xs text-outline">
              Added via Telegram
              {save.telegramUsername ? ` by ${save.telegramUsername}` : ""} ·{" "}
              {new Date(save.createdAt).toLocaleString()}
            </p>
          )}
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
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
