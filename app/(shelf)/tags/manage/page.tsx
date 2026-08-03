"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ManageTag = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  usageCount: number;
  directUsageCount: number;
  subtags: Array<{
    id: string;
    name: string;
    slug: string;
    usageCount: number;
  }>;
};

export default function ManageTagsPage() {
  const [items, setItems] = useState<ManageTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tags?manage=1");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function rename(id: string) {
    const res = await fetch("/api/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Rename failed");
      return;
    }
    setEditingId(null);
    await load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete empty tag “${name}”?`)) return;
    const res = await fetch(`/api/tags?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Delete failed");
      return;
    }
    await load();
  }

  async function merge() {
    if (!mergeSource || !mergeTarget) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "merge",
        sourceId: mergeSource,
        targetId: mergeTarget,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Merge failed");
      return;
    }
    setMergeSource("");
    setMergeTarget("");
    await load();
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = items.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = idx + direction;
    if (next < 0 || next >= items.length) return;
    const ordered = [...items];
    const [row] = ordered.splice(idx, 1);
    ordered.splice(next, 0, row);
    setItems(ordered);
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reorder",
        orderedIds: ordered.map((t) => t.id),
      }),
    });
  }

  const flatForMerge = items.flatMap((t) => [
    { id: t.id, label: t.name, level: "top" as const },
    ...t.subtags.map((s) => ({
      id: s.id,
      label: `${t.name} / ${s.name}`,
      level: "sub" as const,
      parentId: t.id,
    })),
  ]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Manage tags</h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              Rename, merge, delete empty tags, or reorder the sidebar.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-surface-container-high px-3 py-2 text-sm font-semibold text-on-surface"
          >
            Back
          </Link>
        </div>

        {error && <p className="mb-4 text-sm text-error">{error}</p>}
        {loading ? (
          <p className="text-on-surface-variant">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((tag, i) => (
              <li
                key={tag.id}
                className="rounded-xl bg-surface-container-lowest p-4 ring-1 ring-outline-variant/30"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    {tag.icon ?? "label"}
                  </span>
                  {editingId === tag.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg bg-surface-container-low px-2 py-1 text-on-surface"
                      />
                      <button
                        type="button"
                        onClick={() => rename(tag.id)}
                        className="text-sm font-semibold text-primary"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="text-sm text-on-surface-variant"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-semibold text-on-surface">
                        {tag.name}
                      </span>
                      <span className="text-xs text-outline">
                        {tag.usageCount} uses
                      </span>
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(tag.id, -1)}
                        className="rounded p-1 hover:bg-surface-container-high disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          arrow_upward
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={i === items.length - 1}
                        onClick={() => move(tag.id, 1)}
                        className="rounded p-1 hover:bg-surface-container-high disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          arrow_downward
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(tag.id);
                          setEditName(tag.name);
                        }}
                        className="text-sm font-semibold text-primary"
                      >
                        Rename
                      </button>
                      {tag.usageCount === 0 && (
                        <button
                          type="button"
                          onClick={() => remove(tag.id, tag.name)}
                          className="text-sm font-semibold text-error"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>

                {tag.subtags.length > 0 && (
                  <ul className="mt-3 space-y-2 border-t border-outline-variant/30 pt-3">
                    {tag.subtags.map((sub) => (
                      <li
                        key={sub.id}
                        className="flex flex-wrap items-center gap-2 pl-2 text-sm"
                      >
                        {editingId === sub.id ? (
                          <>
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="min-w-0 flex-1 rounded-lg bg-surface-container-low px-2 py-1"
                            />
                            <button
                              type="button"
                              onClick={() => rename(sub.id)}
                              className="font-semibold text-primary"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-on-surface-variant"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 text-on-surface">
                              {sub.name}
                            </span>
                            <span className="text-xs text-outline">
                              {sub.usageCount} uses
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(sub.id);
                                setEditName(sub.name);
                              }}
                              className="font-semibold text-primary"
                            >
                              Rename
                            </button>
                            {sub.usageCount === 0 && (
                              <button
                                type="button"
                                onClick={() => remove(sub.id, sub.name)}
                                className="font-semibold text-error"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-xl bg-surface-container-lowest p-4 ring-1 ring-outline-variant/30">
          <h2 className="mb-3 font-semibold text-on-surface">Merge tags</h2>
          <p className="mb-3 text-xs text-on-surface-variant">
            Merge only works for two top tags, or two subtags under the same
            parent. Source is deleted after links move to target.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={mergeSource}
              onChange={(e) => setMergeSource(e.target.value)}
              className="flex-1 rounded-lg bg-surface-container-low px-3 py-2 text-sm"
            >
              <option value="">Source…</option>
              {flatForMerge.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={mergeTarget}
              onChange={(e) => setMergeTarget(e.target.value)}
              className="flex-1 rounded-lg bg-surface-container-low px-3 py-2 text-sm"
            >
              <option value="">Target…</option>
              {flatForMerge.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={merge}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
            >
              Merge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
