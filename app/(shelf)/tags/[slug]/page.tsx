import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShelfShell } from "@/components/ShelfShell";
import { countUncategorized, listSaves } from "@/lib/saves";
import { getSubtags, getTagBySlug, getTopLevelTags } from "@/lib/tags";

export const dynamic = "force-dynamic";

export default async function TagShelfPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; sub?: string }>;
}) {
  const { slug } = await params;
  const { q, sub } = await searchParams;

  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const subtags = await getSubtags(tag.id);
  const activeSub = sub
    ? subtags.find((s) => s.slug === sub) ?? null
    : null;

  const [saves, topTags, uncategorizedCount] = await Promise.all([
    listSaves({
      q,
      tagId: tag.id,
      subtagId: activeSub?.id,
      includeDescendants: !activeSub,
    }),
    getTopLevelTags(),
    countUncategorized(),
  ]);

  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <ShelfShell
        saves={saves}
        topTags={topTags}
        uncategorizedCount={uncategorizedCount}
        title={`Shelf / ${tag.name}`}
        subtitle={`${saves.length} links`}
        subtags={subtags}
        activeSubtagSlug={activeSub?.slug ?? null}
        tagSlug={tag.slug}
      />
    </Suspense>
  );
}
