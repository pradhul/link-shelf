import { and, desc, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { getDb } from "./db";
import { formatGeminiError, generateJsonPrompt, hasGeminiKey } from "./gemini";
import {
  dailyRecommendations,
  saveTags,
  saves,
  tags,
  type DailyRecommendationPick,
} from "./schema";
import { getSavesByIds, type SaveWithTags } from "./saves";
import { sanitizeTelegramText, truncateChars } from "./text";

/**
 * RAG v1 (no pgvector yet): filter cooking-tagged saves in SQL, then ask Gemini
 * to pick/explain from that shortlist only. Embeddings are a Phase 2 upgrade.
 */

export type Candidate = {
  id: string;
  url: string;
  title: string | null;
  notes: string | null;
  description: string | null;
  isFavorite: boolean;
  createdAt: Date;
};

export type HydratedPick = DailyRecommendationPick & {
  save: SaveWithTags | null;
};

export type TodaysRecommendations = {
  date: string;
  picks: HydratedPick[];
  createdAt: Date;
  created: boolean;
};

const DEFAULT_FOOD_TAG_SLUGS = ["recipes", "recipe", "cooking", "food"];
const CANDIDATE_LIMIT = 30;
const PICK_COUNT_MIN = 1;
const PICK_COUNT_MAX = 3;
const EXCLUDE_LOOKBACK_DAYS = 14;

export function getFoodTagSlugs(): string[] {
  const raw = process.env.FOOD_TAG_SLUGS?.trim();
  if (!raw) return DEFAULT_FOOD_TAG_SLUGS;
  const slugs = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return slugs.length > 0 ? slugs : DEFAULT_FOOD_TAG_SLUGS;
}

/** Calendar date YYYY-MM-DD in Asia/Kolkata (household timezone). */
export function todayInKolkata(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function kolkataDateDaysAgo(days: number, now = new Date()): string {
  const ms = now.getTime() - days * 24 * 60 * 60 * 1000;
  return todayInKolkata(new Date(ms));
}

/**
 * Retrieve: cooking top-tags (env slugs) + descendants, prefer favorites, exclude IDs.
 */
export async function listCookingCandidates(opts: {
  limit: number;
  excludeSaveIds: string[];
}): Promise<Candidate[]> {
  const db = getDb();
  const slugs = getFoodTagSlugs();

  const topTags = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(inArray(tags.slug, slugs), isNull(tags.parentId)));

  if (topTags.length === 0) return [];

  const topIds = topTags.map((t) => t.id);
  const children = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.parentId, topIds));

  const tagIds = [...new Set([...topIds, ...children.map((c) => c.id)])];

  const linked = await db
    .selectDistinct({ saveId: saveTags.saveId })
    .from(saveTags)
    .where(inArray(saveTags.tagId, tagIds));

  let saveIds = linked.map((l) => l.saveId);
  if (saveIds.length === 0) return [];

  const exclude = opts.excludeSaveIds.filter(Boolean);
  if (exclude.length > 0) {
    saveIds = saveIds.filter((id) => !exclude.includes(id));
  }
  if (saveIds.length === 0) return [];

  const conditions = [inArray(saves.id, saveIds)];
  if (exclude.length > 0) {
    conditions.push(notInArray(saves.id, exclude));
  }

  const rows = await db
    .select()
    .from(saves)
    .where(and(...conditions))
    .orderBy(desc(saves.isFavorite), desc(saves.createdAt))
    .limit(Math.max(1, opts.limit));

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    notes: row.notes,
    description: row.description,
    isFavorite: row.isFavorite,
    createdAt: row.createdAt,
  }));
}

async function recentRecommendedSaveIds(
  lookbackDays = EXCLUDE_LOOKBACK_DAYS,
): Promise<string[]> {
  const db = getDb();
  const since = kolkataDateDaysAgo(lookbackDays);
  const rows = await db
    .select({ picks: dailyRecommendations.picks })
    .from(dailyRecommendations)
    .where(gte(dailyRecommendations.date, since));

  const ids = new Set<string>();
  for (const row of rows) {
    for (const pick of row.picks ?? []) {
      if (pick?.saveId) ids.add(pick.saveId);
    }
  }
  return [...ids];
}

/**
 * Generate: Gemini picks 1–3 from candidates only; hallucinated IDs are dropped.
 */
export async function generateDailyFoodPicks(
  candidates: Candidate[],
): Promise<DailyRecommendationPick[]> {
  if (candidates.length === 0) {
    throw new Error("No cooking candidates to recommend from");
  }
  if (!hasGeminiKey()) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const allowed = new Map(candidates.map((c) => [c.id, c]));
  const catalog = candidates.map((c) => ({
    saveId: c.id,
    title: c.title,
    notes: c.notes,
    description: c.description,
    isFavorite: c.isFavorite,
    url: c.url,
  }));

  const prompt = `You recommend dinner/lunch ideas for a household from THEIR SAVED cooking links only.

Rules:
- Return a JSON object only: { "picks": [{ "saveId": string, "reason": string }] }
- Choose ${PICK_COUNT_MIN}–${Math.min(PICK_COUNT_MAX, candidates.length)} picks.
- EVERY saveId MUST be copied EXACTLY from the candidates list below. Never invent IDs or URLs.
- Each reason: 1–2 short sentences. Mention the real title (or hostname) from that candidate. Do not invent ingredients or steps not present in title/notes/description.
- Prefer a small variety (e.g. not three near-identical recipes) when possible.
- Favorites are already sorted first in the list — still pick what feels good for today.

Candidates:
${JSON.stringify(catalog, null, 2)}`;

  let parsed: unknown;
  try {
    parsed = await generateJsonPrompt({ prompt, temperature: 0.5 });
  } catch (err) {
    throw new Error(formatGeminiError(err));
  }

  const rawPicks =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as { picks?: unknown }).picks)
      ? (parsed as { picks: unknown[] }).picks
      : Array.isArray(parsed)
        ? parsed
        : [];

  const grounded: DailyRecommendationPick[] = [];
  const seen = new Set<string>();

  for (const row of rawPicks) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const saveId = typeof r.saveId === "string" ? r.saveId.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!saveId || !reason || seen.has(saveId)) continue;
    if (!allowed.has(saveId)) continue; // reject hallucinated IDs
    seen.add(saveId);
    grounded.push({ saveId, reason });
    if (grounded.length >= PICK_COUNT_MAX) break;
  }

  if (grounded.length === 0) {
    // Deterministic fallback: still grounded in candidates
    return candidates
      .slice(0, Math.min(PICK_COUNT_MAX, candidates.length))
      .map((c) => ({
        saveId: c.id,
        reason: c.title
          ? `From your shelf: ${c.title}.`
          : `From your cooking saves: ${c.url}.`,
      }));
  }

  return grounded;
}

async function hydratePicks(
  picks: DailyRecommendationPick[],
): Promise<HydratedPick[]> {
  if (picks.length === 0) return [];
  const withTags = await getSavesByIds(picks.map((p) => p.saveId));
  const byId = new Map(withTags.map((s) => [s.id, s]));
  return picks.map((p) => ({
    ...p,
    save: byId.get(p.saveId) ?? null,
  }));
}

async function loadStored(date: string): Promise<TodaysRecommendations | null> {
  const db = getDb();
  const row = await db.query.dailyRecommendations.findFirst({
    where: eq(dailyRecommendations.date, date),
  });
  if (!row) return null;
  return {
    date: row.date,
    picks: await hydratePicks(row.picks ?? []),
    createdAt: row.createdAt,
    created: false,
  };
}

async function createForDate(
  date: string,
  excludeExtra: string[] = [],
): Promise<TodaysRecommendations> {
  const recent = await recentRecommendedSaveIds();
  const excludeSaveIds = [...new Set([...recent, ...excludeExtra])];

  const candidates = await listCookingCandidates({
    limit: CANDIDATE_LIMIT,
    excludeSaveIds,
  });

  // If everything was excluded, retry without lookback (still cooking-tagged)
  const pool =
    candidates.length > 0
      ? candidates
      : await listCookingCandidates({
          limit: CANDIDATE_LIMIT,
          excludeSaveIds: excludeExtra,
        });

  if (pool.length === 0) {
    throw new Error(
      `No cooking-tagged saves found (tags: ${getFoodTagSlugs().join(", ")})`,
    );
  }

  // Teaching checkpoint: retrieve-only titles are useful in logs
  console.info(
    "[recommend] candidates",
    pool.map((c) => c.title || c.url),
  );

  const picks = await generateDailyFoodPicks(pool);
  const db = getDb();
  const [row] = await db
    .insert(dailyRecommendations)
    .values({ date, picks })
    .onConflictDoUpdate({
      target: dailyRecommendations.date,
      set: { picks, createdAt: new Date() },
    })
    .returning();

  return {
    date: row.date,
    picks: await hydratePicks(row.picks ?? []),
    createdAt: row.createdAt,
    created: true,
  };
}

/** Idempotent: return today's row, or retrieve → generate → store. */
export async function getOrCreateTodaysRecommendations(): Promise<TodaysRecommendations> {
  const date = todayInKolkata();
  const existing = await loadStored(date);
  if (existing) return existing;
  return createForDate(date);
}

/** Force a new Gemini run for today (manual “Generate today’s picks”). */
export async function regenerateTodaysRecommendations(): Promise<TodaysRecommendations> {
  const date = todayInKolkata();
  const db = getDb();
  const existing = await db.query.dailyRecommendations.findFirst({
    where: eq(dailyRecommendations.date, date),
  });
  const excludeExtra = (existing?.picks ?? []).map((p) => p.saveId);
  return createForDate(date, excludeExtra);
}

/** Plain-text digest for Telegram (same picks as /today). */
export function formatTelegramDigest(rec: TodaysRecommendations): string {
  const lines = [`Today's eats (${rec.date})`, ""];
  if (rec.picks.length === 0) {
    lines.push("No picks today.");
    return sanitizeTelegramText(lines.join("\n"));
  }
  rec.picks.forEach((pick, i) => {
    const raw = pick.save?.title?.trim() || pick.save?.url || pick.saveId;
    const title = truncateChars(raw, 120);
    const url = pick.save?.url;
    lines.push(`${i + 1}. ${title}`);
    if (url) lines.push(url);
    lines.push(sanitizeTelegramText(pick.reason));
    lines.push("");
  });
  return sanitizeTelegramText(lines.join("\n").trim());
}
