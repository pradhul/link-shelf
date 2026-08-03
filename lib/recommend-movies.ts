import { and, desc, eq, gte, inArray, isNull, notInArray } from "drizzle-orm";
import { getDb } from "./db";
import { formatGeminiError, generateJsonPrompt, hasGeminiKey } from "./gemini";
import { getMovieTagSlugs } from "./movie-tags";
import { todayInKolkata, type Candidate, type HydratedPick } from "./recommend";
import {
  saveTags,
  saves,
  tags,
  weeklyMovieRecommendations,
  type WeeklyMovieRecommendationPick,
} from "./schema";
import { getSavesByIds } from "./saves";

export { getMovieTagSlugs, saveHasMovieTag } from "./movie-tags";

/**
 * Friday movie RAG v1: SQL filter by movie tags, exclude watched, then Gemini
 * picks from that shortlist only. Parallel to food recommend — no pgvector yet.
 */

export type FridayMovies = {
  date: string;
  picks: HydratedPick[];
  createdAt: Date;
  created: boolean;
};

const CANDIDATE_LIMIT = 30;
const PICK_COUNT_MIN = 1;
const PICK_COUNT_MAX = 2;
const EXCLUDE_LOOKBACK_DAYS = 14;

/** Most recent Friday’s YYYY-MM-DD in Asia/Kolkata (today if Friday). */
export function mostRecentFridayInKolkata(now = new Date()): string {
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
    }).format(d);
    if (weekday === "Fri") return todayInKolkata(d);
  }
  return todayInKolkata(now);
}

export function isFridayInKolkata(now = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  return weekday === "Fri";
}

function kolkataDateDaysAgo(days: number, now = new Date()): string {
  const ms = now.getTime() - days * 24 * 60 * 60 * 1000;
  return todayInKolkata(new Date(ms));
}

/**
 * Retrieve: movie top-tags + descendants, unwatched only, prefer favorites.
 */
export async function listMovieCandidates(opts: {
  limit: number;
  excludeSaveIds: string[];
}): Promise<Candidate[]> {
  const db = getDb();
  const slugs = getMovieTagSlugs();

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

  const conditions = [
    inArray(saves.id, saveIds),
    eq(saves.isWatched, false),
  ];
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

async function recentMovieRecommendedSaveIds(
  lookbackDays = EXCLUDE_LOOKBACK_DAYS,
): Promise<string[]> {
  const db = getDb();
  const since = kolkataDateDaysAgo(lookbackDays);
  const rows = await db
    .select({ picks: weeklyMovieRecommendations.picks })
    .from(weeklyMovieRecommendations)
    .where(gte(weeklyMovieRecommendations.date, since));

  const ids = new Set<string>();
  for (const row of rows) {
    for (const pick of row.picks ?? []) {
      if (pick?.saveId) ids.add(pick.saveId);
    }
  }
  return [...ids];
}

export async function generateFridayMoviePicks(
  candidates: Candidate[],
): Promise<WeeklyMovieRecommendationPick[]> {
  if (candidates.length === 0) {
    throw new Error("No movie candidates to recommend from");
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

  const prompt = `You recommend Friday-night movies/shows for a household from THEIR SAVED movie links only.

Rules:
- Return a JSON object only: { "picks": [{ "saveId": string, "reason": string }] }
- Choose ${PICK_COUNT_MIN}–${Math.min(PICK_COUNT_MAX, candidates.length)} picks (prefer 1–2 for a Friday night).
- EVERY saveId MUST be copied EXACTLY from the candidates list below. Never invent IDs or URLs.
- Each reason: 1–2 short sentences. Mention the real title from that candidate. Do not invent plot details not present in title/notes/description.
- Prefer something watchable tonight; favorites are already sorted first.

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

  const grounded: WeeklyMovieRecommendationPick[] = [];
  const seen = new Set<string>();

  for (const row of rawPicks) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const saveId = typeof r.saveId === "string" ? r.saveId.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!saveId || !reason || seen.has(saveId)) continue;
    if (!allowed.has(saveId)) continue;
    seen.add(saveId);
    grounded.push({ saveId, reason });
    if (grounded.length >= PICK_COUNT_MAX) break;
  }

  if (grounded.length === 0) {
    return candidates
      .slice(0, Math.min(PICK_COUNT_MAX, candidates.length))
      .map((c) => ({
        saveId: c.id,
        reason: c.title
          ? `Friday pick from your shelf: ${c.title}.`
          : `Friday pick from your movie saves: ${c.url}.`,
      }));
  }

  return grounded;
}

async function hydratePicks(
  picks: WeeklyMovieRecommendationPick[],
): Promise<HydratedPick[]> {
  if (picks.length === 0) return [];
  const withTags = await getSavesByIds(picks.map((p) => p.saveId));
  const byId = new Map(withTags.map((s) => [s.id, s]));
  return picks.map((p) => ({
    ...p,
    save: byId.get(p.saveId) ?? null,
  }));
}

async function loadStored(date: string): Promise<FridayMovies | null> {
  const db = getDb();
  const row = await db.query.weeklyMovieRecommendations.findFirst({
    where: eq(weeklyMovieRecommendations.date, date),
  });
  if (!row) return null;
  return {
    date: row.date,
    picks: await hydratePicks(row.picks ?? []),
    createdAt: row.createdAt,
    created: false,
  };
}

async function createForFriday(
  date: string,
  excludeExtra: string[] = [],
): Promise<FridayMovies> {
  const recent = await recentMovieRecommendedSaveIds();
  const excludeSaveIds = [...new Set([...recent, ...excludeExtra])];

  const candidates = await listMovieCandidates({
    limit: CANDIDATE_LIMIT,
    excludeSaveIds,
  });

  const pool =
    candidates.length > 0
      ? candidates
      : await listMovieCandidates({
          limit: CANDIDATE_LIMIT,
          excludeSaveIds: excludeExtra,
        });

  if (pool.length === 0) {
    throw new Error(
      `No unwatched movie-tagged saves found (tags: ${getMovieTagSlugs().join(", ")})`,
    );
  }

  console.info(
    "[recommend-movies] candidates",
    pool.map((c) => c.title || c.url),
  );

  const picks = await generateFridayMoviePicks(pool);
  const db = getDb();
  const [row] = await db
    .insert(weeklyMovieRecommendations)
    .values({ date, picks })
    .onConflictDoUpdate({
      target: weeklyMovieRecommendations.date,
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

/**
 * Idempotent for the most recent Friday.
 * Auto-creates only when today is Friday (Kolkata); mid-week returns stored or empty.
 */
export async function getOrCreateThisFridaysMovies(): Promise<FridayMovies> {
  const friday = mostRecentFridayInKolkata();
  const existing = await loadStored(friday);
  if (existing) return existing;

  if (!isFridayInKolkata()) {
    return {
      date: friday,
      picks: [],
      createdAt: new Date(),
      created: false,
    };
  }

  return createForFriday(friday);
}

/** Manual “Generate Friday picks” — always creates/replaces for most recent Friday. */
export async function regenerateThisFridaysMovies(): Promise<FridayMovies> {
  const friday = mostRecentFridayInKolkata();
  const db = getDb();
  const existing = await db.query.weeklyMovieRecommendations.findFirst({
    where: eq(weeklyMovieRecommendations.date, friday),
  });
  const excludeExtra = (existing?.picks ?? []).map((p) => p.saveId);
  return createForFriday(friday, excludeExtra);
}

export function formatMovieTelegramDigest(rec: FridayMovies): string {
  const lines = [`Friday movie night (${rec.date})`, ""];
  if (rec.picks.length === 0) {
    lines.push("No movie picks this week.");
    return lines.join("\n");
  }
  rec.picks.forEach((pick, i) => {
    const raw = pick.save?.title?.trim() || pick.save?.url || pick.saveId;
    const title = raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
    const url = pick.save?.url;
    lines.push(`${i + 1}. ${title}`);
    if (url) lines.push(url);
    lines.push(pick.reason);
    lines.push("");
  });
  return lines.join("\n").trim();
}
