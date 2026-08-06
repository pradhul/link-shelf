"use client";

import Link from "next/link";
import { useState } from "react";
import type { SaveWithTags } from "@/lib/saves";

type Props = {
  save: SaveWithTags;
  onEdit: (save: SaveWithTags) => void;
  onToggleFavorite: (save: SaveWithTags) => void;
  /** Called after the exit animation — no confirm needed here. */
  onDelete: (save: SaveWithTags) => void | Promise<void>;
  onRefreshPreview?: (save: SaveWithTags) => void | Promise<void>;
  onViewNotes?: (save: SaveWithTags) => void;
  /** Show watched toggle (movie-tagged cards + Friday picks). */
  showWatchedToggle?: boolean;
  onToggleWatched?: (save: SaveWithTags) => void;
};

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function sourceIcon(source: SaveWithTags["source"]) {
  if (source === "youtube") return "smart_display";
  if (source === "instagram") return "photo_camera";
  return null;
}

const EXIT_MS = 300;

export function LinkCard({
  save,
  onEdit,
  onToggleFavorite,
  onDelete,
  onRefreshPreview,
  onViewNotes,
  showWatchedToggle = false,
  onToggleWatched,
}: Props) {
  const [starBump, setStarBump] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exiting, setExiting] = useState(false);
  const notes = save.notes?.trim() ?? "";
  const showDescription = !notes && Boolean(save.description?.trim());
  const icon = sourceIcon(save.source);

  function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setStarBump(true);
    window.setTimeout(() => setStarBump(false), 400);
    onToggleFavorite(save);
  }

  function handleWatched(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleWatched?.(save);
  }

  async function handleRefresh(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!onRefreshPreview || refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshPreview(save);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (exiting) return;
    if (!confirm("Delete this link?")) return;
    setExiting(true);
    await new Promise((r) => window.setTimeout(r, EXIT_MS));
    await onDelete(save);
  }

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30 transition hover:-translate-y-0.5 hover:shadow-md ${
        exiting ? "card-exiting" : ""
      }`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-container">
        <a
          href={save.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 block"
          aria-label={`Open ${save.title || hostname(save.url)}`}
        >
          {save.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={save.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary-container/10 text-primary">
              <span className="material-symbols-outlined text-4xl">link</span>
            </div>
          )}
        </a>
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Toggle favorite"
            onClick={handleFavorite}
            className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-sm backdrop-blur press-scale ${starBump ? "star-twist" : ""}`}
          >
            <span
              className={`material-symbols-outlined text-[18px] ${save.isFavorite ? "fill text-tertiary-fixed-dim" : ""}`}
            >
              star
            </span>
          </button>
          {showWatchedToggle && onToggleWatched && (
            <button
              type="button"
              aria-label={save.isWatched ? "Mark unwatched" : "Mark watched"}
              title={save.isWatched ? "Watched" : "Mark watched"}
              onClick={handleWatched}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-sm backdrop-blur press-scale"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${save.isWatched ? "fill text-primary" : ""}`}
              >
                {save.isWatched ? "check_circle" : "visibility"}
              </span>
            </button>
          )}
        </div>
        {save.isWatched && showWatchedToggle && (
          <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-on-surface/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-surface">
            Watched
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {save.classifications.map(({ topTag, subTag }) => (
            <span key={topTag.id} className="contents">
              <Link
                href={`/tags/${topTag.slug}`}
                className="tag-jerk rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-secondary-container transition hover:brightness-95"
              >
                {topTag.name}
              </Link>
              {subTag && (
                <Link
                  href={`/tags/${topTag.slug}?sub=${subTag.slug}`}
                  className="tag-jerk rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant transition hover:bg-surface-container-highest"
                >
                  {subTag.name}
                </Link>
              )}
            </span>
          ))}
        </div>

        <a
          href={save.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-base font-semibold leading-snug text-on-surface hover:underline"
        >
          {save.title || hostname(save.url)}
        </a>

        {notes && (
          <button
            type="button"
            onClick={() => onViewNotes?.(save)}
            className="press-scale rounded-lg bg-surface-container-low/80 px-2.5 py-2 text-left transition hover:bg-surface-container-high"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">
                Notes
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                open_in_full
              </span>
            </span>
            <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">
              {notes}
            </p>
          </button>
        )}

        {showDescription && (
          <a
            href={save.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 text-sm text-on-surface-variant hover:text-on-surface"
          >
            {save.description}
          </a>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-on-surface-variant">
          <a
            href={save.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 hover:underline"
          >
            {icon && (
              <span
                className="material-symbols-outlined shrink-0 text-[15px] text-on-surface-variant"
                aria-hidden
              >
                {icon}
              </span>
            )}
            <span className="truncate">{hostname(save.url)}</span>
          </a>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
            {onRefreshPreview && (
              <button
                type="button"
                aria-label="Refresh preview"
                title="Refresh preview"
                disabled={refreshing || exiting}
                onClick={handleRefresh}
                className="press-scale rounded-full p-1 hover:bg-surface-container-high disabled:opacity-70"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    refreshing ? "animate-spin" : ""
                  }`}
                >
                  refresh
                </span>
              </button>
            )}
            <button
              type="button"
              aria-label="Edit"
              disabled={exiting}
              onClick={() => onEdit(save)}
              className="press-scale rounded-full p-1 hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <button
              type="button"
              aria-label="Delete"
              disabled={exiting}
              onClick={handleDelete}
              className="press-scale rounded-full p-1 hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">
                delete
              </span>
            </button>
            <a
              href={save.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open link"
              className="press-scale rounded-full p-1 hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">
                open_in_new
              </span>
            </a>
          </div>
        </div>
        <p className="text-[11px] text-outline">
          Saved {formatDate(save.createdAt)}
        </p>
      </div>
    </article>
  );
}
