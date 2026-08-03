import { Suspense } from "react";
import { TodayShell } from "@/components/TodayShell";
import {
  getOrCreateTodaysRecommendations,
  todayInKolkata,
} from "@/lib/recommend";
import { countUncategorized } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

async function TodayContent() {
  const [topTags, uncategorizedCount] = await Promise.all([
    getTopLevelTags(),
    countUncategorized(),
  ]);

  let picks: Awaited<
    ReturnType<typeof getOrCreateTodaysRecommendations>
  >["picks"] = [];
  let date = todayInKolkata();
  let errorMessage: string | null = null;

  try {
    const rec = await getOrCreateTodaysRecommendations();
    picks = rec.picks;
    date = rec.date;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Could not load picks";
  }

  return (
    <TodayShell
      date={date}
      picks={picks}
      topTags={topTags}
      uncategorizedCount={uncategorizedCount}
      errorMessage={errorMessage}
    />
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <TodayContent />
    </Suspense>
  );
}
