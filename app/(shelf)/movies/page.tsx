import { Suspense } from "react";
import { MoviesShell } from "@/components/MoviesShell";
import {
  getOrCreateThisFridaysMovies,
  mostRecentFridayInKolkata,
} from "@/lib/recommend-movies";
import { countUncategorized } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

async function MoviesContent() {
  const [topTags, uncategorizedCount] = await Promise.all([
    getTopLevelTags(),
    countUncategorized(),
  ]);

  let picks: Awaited<
    ReturnType<typeof getOrCreateThisFridaysMovies>
  >["picks"] = [];
  let date = mostRecentFridayInKolkata();
  let errorMessage: string | null = null;

  try {
    const rec = await getOrCreateThisFridaysMovies();
    picks = rec.picks;
    date = rec.date;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Could not load picks";
  }

  return (
    <MoviesShell
      date={date}
      picks={picks}
      topTags={topTags}
      uncategorizedCount={uncategorizedCount}
      errorMessage={errorMessage}
    />
  );
}

export default function MoviesPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <MoviesContent />
    </Suspense>
  );
}
