import {
  categorizeLinks,
  formatGeminiError,
  getConfidenceThreshold,
  hasGeminiKey,
  type CategorizeResult,
  type LinkForCategorize,
} from "./gemini";
import {
  detectSource,
  fetchLinkPreview,
  fetchThumbnailBytes,
  getBatchMax,
  type OgData,
  type ThumbnailBytes,
} from "./og";
import {
  createOrUpdateSave,
  listSaves,
  type ClassificationNameInput,
} from "./saves";
import { getTagTree } from "./tags";

export type EnrichedLink = {
  url: string;
  source: ReturnType<typeof detectSource>;
  title: string | null;
  description: string | null;
  og: OgData;
  image: ThumbnailBytes | null;
};

export async function enrichLinkForCategorize(
  url: string,
): Promise<EnrichedLink> {
  let og: OgData = { title: null, description: null, thumbnailUrl: null };
  try {
    og = await fetchLinkPreview(url, { timeoutMs: 3000 });
  } catch (err) {
    console.error("og fetch failed", url, err);
  }

  let image: ThumbnailBytes | null = null;
  if (og.thumbnailUrl) {
    try {
      image = await fetchThumbnailBytes(og.thumbnailUrl, { timeoutMs: 3000 });
    } catch {
      /* best-effort thumbnail for Gemini */
    }
  }

  return {
    url,
    source: detectSource(url),
    title: og.title,
    description: og.description,
    og,
    image,
  };
}

export function toLinkForCategorize(item: EnrichedLink): LinkForCategorize {
  return {
    url: item.url,
    source: item.source,
    title: item.title,
    description: item.description,
    image: item.image,
  };
}

export function saveSourceFromDetect(
  source: ReturnType<typeof detectSource>,
): "instagram" | "youtube" | "other" {
  return source === "manual" ? "other" : source;
}

export function confidentNamePairs(
  result: CategorizeResult | null | undefined,
  threshold = getConfidenceThreshold(),
): ClassificationNameInput[] {
  if (!result) return [];
  return result.classifications
    .filter((c) => c.confidence >= threshold && Boolean(c.topTag?.trim()))
    .map((c) => ({
      topTagName: c.topTag,
      subTagName: c.subTag,
    }));
}

export function formatConfidentLabel(
  pairs: ClassificationNameInput[],
  result: CategorizeResult,
): { paths: string; confPct: number } {
  const paths = pairs
    .map((c) => [c.topTagName, c.subTagName].filter(Boolean).join("/"))
    .join(", ");
  const matched = result.classifications.filter((c) =>
    pairs.some((p) => p.topTagName === c.topTag),
  );
  const confPct = Math.round(
    Math.max(0, ...matched.map((c) => c.confidence)) * 100,
  );
  return { paths, confPct };
}

export type CategorizeBatchOutcome = {
  results: CategorizeResult[] | null;
  error: string | null;
};

export async function runCategorizeBatch(
  items: LinkForCategorize[],
): Promise<CategorizeBatchOutcome> {
  if (items.length === 0) {
    return { results: [], error: null };
  }
  if (!hasGeminiKey()) {
    return {
      results: null,
      error: "Auto-tag needs GEMINI_API_KEY.",
    };
  }
  try {
    const tagTree = await getTagTree();
    const results = await categorizeLinks(items, tagTree);
    return { results, error: null };
  } catch (err) {
    console.error("gemini categorize failed", err);
    return { results: null, error: formatGeminiError(err) };
  }
}

export async function categorizeUncategorizedSaves(limit?: number) {
  const batchMax = getBatchMax();
  const capped =
    limit !== undefined && Number.isFinite(limit)
      ? Math.min(Math.max(1, Math.floor(limit)), batchMax)
      : Math.min(10, batchMax);

  if (!hasGeminiKey()) {
    return {
      tagged: 0,
      skipped: 0,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  const saves = await listSaves({ uncategorizedOnly: true });
  const selected = saves.slice(0, capped);
  if (selected.length === 0) {
    return { tagged: 0, skipped: 0 };
  }

  const enriched = await Promise.all(
    selected.map(async (save) => ({
      save,
      enriched: await enrichLinkForCategorize(save.url),
    })),
  );

  const { results, error } = await runCategorizeBatch(
    enriched.map(({ enriched: e }) => toLinkForCategorize(e)),
  );

  if (error || !results) {
    return {
      tagged: 0,
      skipped: selected.length,
      error: error ?? "Categorize failed",
    };
  }

  let tagged = 0;
  let skipped = 0;
  const threshold = getConfidenceThreshold();

  for (let i = 0; i < enriched.length; i++) {
    const { save, enriched: item } = enriched[i];
    const pairs = confidentNamePairs(results[i], threshold);
    if (pairs.length === 0) {
      skipped += 1;
      continue;
    }
    try {
      await createOrUpdateSave({
        url: save.url,
        classifications: pairs,
        addedVia: save.addedVia,
        telegramUsername: save.telegramUsername,
        title: save.title,
        og: item.og,
        source: save.source,
      });
      tagged += 1;
    } catch (err) {
      console.error("apply categorize failed", save.id, err);
      skipped += 1;
    }
  }

  return { tagged, skipped };
}
