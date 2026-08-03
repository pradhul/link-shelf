"use client";

import type { SaveWithTags } from "@/lib/saves";

type Props = {
  save: SaveWithTags | null;
  open: boolean;
  onClose: () => void;
  onEdit: (save: SaveWithTags) => void;
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NotesSheet({ save, open, onClose, onEdit }: Props) {
  if (!open || !save) return null;

  const notes = save.notes?.trim() ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-on-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close notes"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-labelledby="notes-sheet-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-surface-container-lowest shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start gap-3 border-b border-outline-variant/30 px-5 py-4">
          {save.thumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={save.thumbnailUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p
              id="notes-sheet-title"
              className="text-[11px] font-semibold uppercase tracking-wider text-outline"
            >
              Notes
            </p>
            <p className="truncate font-medium text-on-surface">
              {save.title || hostname(save.url)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press-scale rounded-full p-1 hover:bg-surface-container-high"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {notes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
              {notes}
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant">No notes yet.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-outline-variant/30 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="press-scale px-4 py-2 text-sm font-semibold uppercase tracking-wide text-on-surface-variant"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(save);
            }}
            className="press-scale flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
