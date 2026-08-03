import { Suspense } from "react";
import { ShelfShell } from "@/components/ShelfShell";
import { countSaves, listSaves } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

async function AllItems({ q }: { q?: string }) {
  const [saves, topTags, total] = await Promise.all([
    listSaves({ q }),
    getTopLevelTags(),
    countSaves(),
  ]);

  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <ShelfShell
        saves={saves}
        topTags={topTags}
        title="Your Collection"
        subtitle={`Showing: All Items • ${total} links total`}
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
