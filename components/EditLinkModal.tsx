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

export function EditLinkModal({ save, topTags, open, onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [topTagId, setTopTagId] = useState<string>("");
  const [subTagId, setSubTagId] = useState<string>("");
  const [newTopTag, setNewTopTag] = useState("");
  const [newSubTag, setNewSubTag] = useState("");
  const [subtags, setSubtags] = useState<Tag[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!save) return;
    setTitle(save.title ?? "");
    setNotes(save.notes ?? "");
    setTopTagId(save.topTag?.id ?? "");
    setSubTagId(save.subTag?.id ?? "");
    setNewTopTag("");
    setNewSubTag("");
  }, [save]);

  useEffect(() => {
    if (!topTagId) {
      setSubtags([]);
      return;
    }
    fetch(`/api/tags?parentId=${topTagId}`)
      .then((r) => r.json())
      .then((d) => setSubtags(d.items ?? []));
  }, [topTagId]);

  if (!open || !save) return null;

  async function resolveTagIds(): Promise<{
    topTagId: string | null;
    subTagId: string | null;
  }> {
    let resolvedTop = topTagId || null;
    let resolvedSub = subTagId || null;

    if (newTopTag.trim()) {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTopTag.trim() }),
      });
      const tag = await res.json();
      resolvedTop = tag.id;
    }

    if (newSubTag.trim() && resolvedTop) {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSubTag.trim(),
          parentId: resolvedTop,
        }),
      });
      const tag = await res.json();
      resolvedSub = tag.id;
    }

    return { topTagId: resolvedTop, subTagId: resolvedSub };
  }

  async function handleSave() {
    if (!save) return;
    setSaving(true);
    try {
      const tagsResolved = await resolveTagIds();
      await fetch(`/api/saves/${save.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes: notes || null,
          topTagId: tagsResolved.topTagId,
          subTagId: tagsResolved.subTagId,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
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

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Top-level Tag
            </span>
            <select
              value={topTagId}
              onChange={(e) => {
                setTopTagId(e.target.value);
                setSubTagId("");
                setNewTopTag("");
              }}
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2"
            >
              <option value="">None</option>
              {topTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              value={newTopTag}
              onChange={(e) => setNewTopTag(e.target.value)}
              placeholder="Or type a new tag…"
              className="mt-1 rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-outline">
              Subtag (Optional)
            </span>
            <select
              value={subTagId}
              onChange={(e) => {
                setSubTagId(e.target.value);
                setNewSubTag("");
              }}
              disabled={!topTagId && !newTopTag}
              className="rounded-lg bg-surface-container-low px-3 py-2 text-on-surface outline-none ring-primary focus:ring-2 disabled:opacity-50"
            >
              <option value="">None</option>
              {subtags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <input
              value={newSubTag}
              onChange={(e) => setNewSubTag(e.target.value)}
              placeholder="Or type a new subtag…"
              disabled={!topTagId && !newTopTag}
              className="mt-1 rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface outline-none ring-primary focus:ring-2 disabled:opacity-50"
            />
          </label>

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
