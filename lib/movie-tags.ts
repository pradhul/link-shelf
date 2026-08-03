/** Client-safe movie tag helpers (no DB / Gemini imports). */

const DEFAULT_MOVIE_TAG_SLUGS = ["movies", "movie", "films", "film"];

export function getMovieTagSlugs(): string[] {
  const raw = process.env.MOVIE_TAG_SLUGS?.trim();
  if (!raw) return DEFAULT_MOVIE_TAG_SLUGS;
  const slugs = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return slugs.length > 0 ? slugs : DEFAULT_MOVIE_TAG_SLUGS;
}

export function saveHasMovieTag(save: {
  classifications: Array<{ topTag: { slug: string } }>;
}): boolean {
  const slugs = new Set(getMovieTagSlugs());
  return save.classifications.some((c) => slugs.has(c.topTag.slug));
}
