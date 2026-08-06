import { Suspense } from "react";
import { ShelfShell } from "@/components/ShelfShell";
import { countUncategorized, listSaves } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function UncategorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [saves, topTags, uncategorizedCount] = await Promise.all([
    listSaves({ uncategorizedOnly: true, q }),
    getTopLevelTags(),
    countUncategorized(),
  ]);

  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <ShelfShell
        saves={saves}
        topTags={topTags}
        uncategorizedCount={uncategorizedCount}
        title="Uncategorized"
        subtitle={`${uncategorizedCount} links need a tag — edit in the app or AI categorize`}
        showBulkRepair
        showAiCategorize
      />
    </Suspense>
  );
}
