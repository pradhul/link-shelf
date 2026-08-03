import { Suspense } from "react";
import { ShelfShell } from "@/components/ShelfShell";
import { countSaves, countUncategorized, listSaves } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

async function AllItems({ q }: { q?: string }) {
  const [saves, topTags, total, uncategorizedCount] = await Promise.all([
    listSaves({ q }),
    getTopLevelTags(),
    countSaves(),
    countUncategorized(),
  ]);

  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <ShelfShell
        saves={saves}
        topTags={topTags}
        uncategorizedCount={uncategorizedCount}
        title="Your Collection"
        subtitle={`Showing: All Items • ${total} links total`}
        showBulkRepair
      />
    </Suspense>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <AllItems q={q} />;
}
