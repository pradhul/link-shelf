"use client";

import Link from "next/link";
import type { SaveWithTags } from "@/lib/saves";

type Props = {
  save: SaveWithTags;
  onEdit: (save: SaveWithTags) => void;
  onToggleFavorite: (save: SaveWithTags) => void;
  onDelete: (save: SaveWithTags) => void;
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

export function LinkCard({ save, onEdit, onToggleFavorite, onDelete }: Props) {
  const topTagHref = save.topTag ? `/tags/${save.topTag.slug}` : null;
  const subTagHref =
    save.topTag && save.subTag
      ? `/tags/${save.topTag.slug}?sub=${save.subTag.slug}`
      : null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30 transition hover:-translate-y-0.5 hover:shadow-md">
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
        <button
          type="button"
          aria-label="Toggle favorite"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite(save);
          }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-lowest/90 text-on-surface shadow-sm backdrop-blur"
        >
          <span
            className={`material-symbols-outlined text-[18px] ${save.isFavorite ? "fill text-tertiary-fixed-dim" : ""}`}
          >
            star
          </span>
        </button>
        {(save.source === "youtube" || save.source === "instagram") && (
          <span className="pointer-events-none absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary/80 text-on-primary">
            <span className="material-symbols-outlined text-[16px]">
              {save.source === "youtube" ? "play_arrow" : "photo_camera"}
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {save.topTag && topTagHref && (
            <Link
              href={topTagHref}
              className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-secondary-container transition hover:brightness-95"
            >
              {save.topTag.name}
            </Link>
          )}
          {save.subTag && subTagHref && (
            <Link
              href={subTagHref}
              className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant transition hover:bg-surface-container-highest"
            >
              {save.subTag.name}
            </Link>
          )}
        </div>

        <a
          href={save.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-base font-semibold leading-snug text-on-surface hover:underline"
        >
          {save.title || hostname(save.url)}
        </a>

        {save.description && (
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
            className="truncate hover:underline"
          >
            {hostname(save.url)}
          </a>
          <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
            <button
              type="button"
              aria-label="Edit"
              onClick={() => onEdit(save)}
              className="rounded-full p-1 hover:bg-surface-container-high"
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => onDelete(save)}
              className="rounded-full p-1 hover:bg-surface-container-high"
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
              className="rounded-full p-1 hover:bg-surface-container-high"
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
