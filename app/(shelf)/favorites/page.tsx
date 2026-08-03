import { Suspense } from "react";
import { ShelfShell } from "@/components/ShelfShell";
import { listSaves } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [saves, topTags] = await Promise.all([
    listSaves({ favoritesOnly: true, q }),
    getTopLevelTags(),
  ]);

  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <ShelfShell
        saves={saves}
        topTags={topTags}
        title="Favorites"
        subtitle={`${saves.length} starred links`}
      />
    </Suspense>
  );
}
