import { and, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { hasGeminiKey, translateToEnglish } from "./gemini";
import {
  detectSource,
  fetchLinkPreview,
  hasEncodedEntities,
  isGenericYoutubeDescription,
  isJunkYoutubeTitle,
  isUsefulNotesCandidate,
  pickUsableTitle,
  sanitizeText,
} from "./og";
import { saveTags, saves, tags, type Save, type Tag } from "./schema";
import { findOrCreateTag } from "./tags";
import { needsTranslation } from "./translate";

export type Classification = {
  topTag: Tag;
  subTag: Tag | null;
};

export type SaveWithTags = Save & {
  classifications: Classification[];
};

export type ClassificationInput = {
  topTagId: string;
  subTagId?: string | null;
};

export type ClassificationNameInput = {
  topTagName: string;
  subTagName?: string | null;
};

async function attachTags(rows: Save[]): Promise<SaveWithTags[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const links = await db
    .select({
      saveId: saveTags.saveId,
      tag: tags,
    })
    .from(saveTags)
    .innerJoin(tags, eq(saveTags.tagId, tags.id))
    .where(inArray(saveTags.saveId, ids));

  const bySave = new Map<string, Tag[]>();
  for (const link of links) {
    const list = bySave.get(link.saveId) ?? [];
    list.push(link.tag);
    bySave.set(link.saveId, list);
  }

  const parentIds = [
    ...new Set(
      [...bySave.values()]
        .flat()
        .map((t) => t.parentId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const parents =
    parentIds.length > 0
      ? await db.select().from(tags).where(inArray(tags.id, parentIds))
      : [];
  const parentMap = new Map(parents.map((p) => [p.id, p]));

  return rows.map((row) => {
    const leaves = bySave.get(row.id) ?? [];
    const classifications: Classification[] = [];
    const seenTop = new Set<string>();

    for (const leaf of leaves) {
      if (leaf.parentId) {
        const top = parentMap.get(leaf.parentId);
        if (!top || seenTop.has(top.id)) continue;
        seenTop.add(top.id);
        classifications.push({ topTag: top, subTag: leaf });
      } else {
        if (seenTop.has(leaf.id)) continue;
        seenTop.add(leaf.id);
        classifications.push({ topTag: leaf, subTag: null });
      }
    }

    return { ...row, classifications };
  });
}

export async function listSaves(opts: {
  favoritesOnly?: boolean;
  uncategorizedOnly?: boolean;
  tagId?: string;
  includeDescendants?: boolean;
  subtagId?: string;
  q?: string;
}) {
  const db = getDb();
  const conditions = [];

  if (opts.favoritesOnly) {
    conditions.push(eq(saves.isFavorite, true));
  }
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim()}%`;
    conditions.push(
      or(
        ilike(saves.title, like),
        ilike(saves.url, like),
        ilike(saves.description, like),
        ilike(saves.notes, like),
      )!,
    );
  }

  let filteredIds: string[] | null = null;
  if (opts.uncategorizedOnly) {
    const tagged = await db
      .selectDistinct({ saveId: saveTags.saveId })
      .from(saveTags);
    const taggedIds = tagged.map((t) => t.saveId);
    if (taggedIds.length === 0) {
      filteredIds = null;
    } else {
      conditions.push(notInArray(saves.id, taggedIds));
      filteredIds = null;
    }
  } else if (opts.subtagId) {
    const linked = await db
      .select({ saveId: saveTags.saveId })
      .from(saveTags)
      .where(eq(saveTags.tagId, opts.subtagId));
    filteredIds = linked.map((l) => l.saveId);
  } else if (opts.tagId) {
    let tagIds = [opts.tagId];
    if (opts.includeDescendants !== false) {
      const children = await db
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.parentId, opts.tagId));
      tagIds = [opts.tagId, ...children.map((c) => c.id)];
    }
    const linked = await db
      .select({ saveId: saveTags.saveId })
      .from(saveTags)
      .where(inArray(saveTags.tagId, tagIds));
    filteredIds = [...new Set(linked.map((l) => l.saveId))];
  }

  if (filteredIds) {
    if (filteredIds.length === 0) return [];
    conditions.push(inArray(saves.id, filteredIds));
  }

  const rows = await db
    .select()
    .from(saves)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(saves.createdAt));

  return attachTags(rows);
}

export async function getSaveById(id: string) {
  const db = getDb();
  const row = await db.query.saves.findFirst({ where: eq(saves.id, id) });
  if (!row) return null;
  const [withTags] = await attachTags([row]);
  return withTags;
}

export async function getSavesByIds(ids: string[]): Promise<SaveWithTags[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db.select().from(saves).where(inArray(saves.id, ids));
  return attachTags(rows);
}

export async function setSaveClassifications(
  saveId: string,
  pairs: ClassificationInput[],
) {
  const db = getDb();
  await db.delete(saveTags).where(eq(saveTags.saveId, saveId));

  const leafIds: string[] = [];
  const seenTop = new Set<string>();
  for (const pair of pairs) {
    if (!pair.topTagId || seenTop.has(pair.topTagId)) continue;
    seenTop.add(pair.topTagId);
    leafIds.push(pair.subTagId || pair.topTagId);
  }

  if (leafIds.length > 0) {
    await db.insert(saveTags).values(
      leafIds.map((tagId) => ({ saveId, tagId })),
    );
  }
}

/** @deprecated single-pair helper — prefer setSaveClassifications */
export async function setSaveClassification(
  saveId: string,
  topTagId: string | null,
  subTagId: string | null,
) {
  if (!topTagId) {
    await setSaveClassifications(saveId, []);
    return;
  }
  await setSaveClassifications(saveId, [
    { topTagId, subTagId: subTagId ?? null },
  ]);
}

async function resolveNamePairs(
  names: ClassificationNameInput[],
): Promise<ClassificationInput[]> {
  const pairs: ClassificationInput[] = [];
  const seenTop = new Set<string>();
  for (const name of names) {
    const topName = name.topTagName?.trim();
    if (!topName) continue;
    const top = await findOrCreateTag(topName, null);
    if (seenTop.has(top.id)) continue;
    seenTop.add(top.id);
    let subTagId: string | null = null;
    const subName = name.subTagName?.trim();
    if (subName) {
      const sub = await findOrCreateTag(subName, top.id);
      subTagId = sub.id;
    }
    pairs.push({ topTagId: top.id, subTagId });
  }
  return pairs;
}

/** Best-effort English translation; keeps originals if Gemini is missing/fails. */
async function maybeTranslateMetadata(fields: {
  title: string | null;
  notes: string | null;
  description?: string | null;
}): Promise<{ title: string | null; notes: string | null; description?: string | null }> {
  if (!hasGeminiKey()) return fields;

  const payload: {
    title?: string;
    notes?: string;
    description?: string;
  } = {};
  if (needsTranslation(fields.title)) payload.title = fields.title!;
  if (needsTranslation(fields.notes)) payload.notes = fields.notes!;
  if (fields.description && needsTranslation(fields.description)) {
    payload.description = fields.description;
  }
  if (Object.keys(payload).length === 0) return fields;

  try {
    const translated = await translateToEnglish(payload);
    return {
      title: sanitizeText(translated.title ?? fields.title) ?? fields.title,
      notes: sanitizeText(translated.notes ?? fields.notes) ?? fields.notes,
      description:
        sanitizeText(translated.description ?? fields.description) ??
        fields.description,
    };
  } catch (err) {
    console.error("translate metadata failed", err);
    return fields;
  }
}

export async function createOrUpdateSave(input: {
  url: string;
  /** Single pair (Telegram). Pass null to clear tags when setTags is intended. */
  topTagName?: string | null;
  subTagName?: string | null;
  /** Multiple top tags with optional subtags (web / Gemini). */
  classifications?: ClassificationNameInput[];
  addedVia: "telegram" | "web";
  telegramUsername?: string | null;
  title?: string | null;
  notes?: string | null;
  source?: Save["source"];
  /** Skip network OG fetch when already loaded for batch/Gemini. */
  og?: {
    title?: string | null;
    description?: string | null;
    thumbnailUrl?: string | null;
  } | null;
}) {
  const db = getDb();
  const ogRaw = input.og ?? (await fetchLinkPreview(input.url));
  const og = {
    title: sanitizeText(ogRaw.title),
    description: sanitizeText(ogRaw.description),
    thumbnailUrl: ogRaw.thumbnailUrl,
  };
  const source = input.source ?? detectSource(input.url);
  const ogTitle = isJunkYoutubeTitle(og.title) ? null : og.title;
  const ogDescription = isGenericYoutubeDescription(og.description)
    ? null
    : og.description;
  const inputTitle = isJunkYoutubeTitle(input.title)
    ? null
    : sanitizeText(input.title);
  const inputNotes = sanitizeText(input.notes);

  const shouldSetTags =
    input.classifications !== undefined || input.topTagName !== undefined;

  let pairs: ClassificationInput[] = [];
  if (input.classifications !== undefined) {
    pairs = await resolveNamePairs(input.classifications);
  } else if (input.topTagName) {
    pairs = await resolveNamePairs([
      {
        topTagName: input.topTagName,
        subTagName: input.subTagName,
      },
    ]);
  }

  const existing = await db.query.saves.findFirst({
    where: eq(saves.url, input.url),
  });

  if (existing) {
    const existingTitle = isJunkYoutubeTitle(existing.title)
      ? null
      : sanitizeText(existing.title);
    let nextTitle = pickUsableTitle(inputTitle, ogTitle, existingTitle);
    let nextNotes = inputNotes ?? sanitizeText(existing.notes) ?? existing.notes;
    let nextDescription =
      ogDescription ?? sanitizeText(existing.description) ?? existing.description;

    // Translate when title/notes still look foreign (e.g. re-save with fresh OG)
    if (needsTranslation(nextTitle) || needsTranslation(nextNotes)) {
      const translated = await maybeTranslateMetadata({
        title: nextTitle,
        notes: nextNotes,
        description: nextDescription,
      });
      nextTitle = translated.title;
      nextNotes = translated.notes;
      nextDescription = translated.description ?? nextDescription;
    }

    const [updated] = await db
      .update(saves)
      .set({
        title: nextTitle,
        description: nextDescription,
        thumbnailUrl: og.thumbnailUrl ?? existing.thumbnailUrl,
        notes: nextNotes,
        updatedAt: new Date(),
      })
      .where(eq(saves.id, existing.id))
      .returning();
    if (shouldSetTags) {
      await setSaveClassifications(existing.id, pairs);
    }
    const [result] = await attachTags([updated]);
    return { save: result, created: false };
  }

  let nextTitle = pickUsableTitle(inputTitle, ogTitle);
  let nextNotes = inputNotes;
  let nextDescription = ogDescription;

  // Seed notes from useful OG caption on create when empty
  if (!nextNotes && isUsefulNotesCandidate(nextDescription)) {
    nextNotes = nextDescription;
  }

  if (
    needsTranslation(nextTitle) ||
    needsTranslation(nextNotes) ||
    needsTranslation(nextDescription)
  ) {
    const translated = await maybeTranslateMetadata({
      title: nextTitle,
      notes: nextNotes,
      description: nextDescription,
    });
    nextTitle = translated.title;
    nextNotes = translated.notes;
    nextDescription = translated.description ?? nextDescription;
  }

  const [created] = await db
    .insert(saves)
    .values({
      url: input.url,
      title: nextTitle,
      description: nextDescription,
      thumbnailUrl: og.thumbnailUrl,
      source,
      notes: nextNotes,
      addedVia: input.addedVia,
      telegramUsername: input.telegramUsername ?? null,
    })
    .returning();

  if (shouldSetTags) {
    await setSaveClassifications(created.id, pairs);
  }
  const [result] = await attachTags([created]);
  return { save: result, created: true };
}

export async function updateSave(
  id: string,
  data: {
    title?: string;
    notes?: string | null;
    isFavorite?: boolean;
    isWatched?: boolean;
    topTagId?: string | null;
    subTagId?: string | null;
    classifications?: ClassificationInput[];
  },
) {
  const db = getDb();
  const patch: Partial<typeof saves.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.title !== undefined) patch.title = sanitizeText(data.title);
  if (data.notes !== undefined) {
    patch.notes =
      data.notes === null ? null : sanitizeText(data.notes);
  }
  if (data.isFavorite !== undefined) patch.isFavorite = data.isFavorite;
  if (data.isWatched !== undefined) patch.isWatched = data.isWatched;

  const [updated] = await db
    .update(saves)
    .set(patch)
    .where(eq(saves.id, id))
    .returning();

  if (!updated) return null;

  if (data.classifications !== undefined) {
    await setSaveClassifications(id, data.classifications);
  } else if (data.topTagId !== undefined || data.subTagId !== undefined) {
    await setSaveClassification(
      id,
      data.topTagId ?? null,
      data.subTagId ?? null,
    );
  }

  return getSaveById(id);
}

export async function refreshSavePreview(id: string) {
  const db = getDb();
  const existing = await db.query.saves.findFirst({ where: eq(saves.id, id) });
  if (!existing) return null;

  const og = await fetchLinkPreview(existing.url);
  const ogTitle = isJunkYoutubeTitle(og.title) ? null : sanitizeText(og.title);
  const ogDescription = isGenericYoutubeDescription(og.description)
    ? null
    : sanitizeText(og.description);
  const existingTitle = isJunkYoutubeTitle(existing.title)
    ? null
    : sanitizeText(existing.title);

  const notesWereEmpty = !existing.notes?.trim();
  let nextNotes =
    notesWereEmpty && isUsefulNotesCandidate(ogDescription)
      ? ogDescription
      : sanitizeText(existing.notes) ?? existing.notes;
  let nextTitle = pickUsableTitle(ogTitle, existingTitle);
  let nextDescription =
    ogDescription ??
    sanitizeText(existing.description) ??
    existing.description;

  // Translate foreign title / auto-filled or still-foreign notes
  if (needsTranslation(nextTitle) || needsTranslation(nextNotes)) {
    const translated = await maybeTranslateMetadata({
      title: nextTitle,
      notes: nextNotes,
      description: nextDescription,
    });
    nextTitle = translated.title;
    nextNotes = translated.notes;
    nextDescription = translated.description ?? nextDescription;
  }

  const [updated] = await db
    .update(saves)
    .set({
      title: nextTitle,
      description: nextDescription,
      thumbnailUrl: og.thumbnailUrl ?? existing.thumbnailUrl,
      notes: nextNotes,
      updatedAt: new Date(),
    })
    .where(eq(saves.id, id))
    .returning();

  if (!updated) return null;
  const [result] = await attachTags([updated]);
  return result;
}

export async function refreshJunkYoutubePreviews(limit = 25) {
  const db = getDb();
  const rows = await db
    .select()
    .from(saves)
    .orderBy(desc(saves.updatedAt))
    .limit(300);

  const junk = rows
    .filter(
      (r) =>
        hasEncodedEntities(r.title) ||
        hasEncodedEntities(r.description) ||
        needsTranslation(r.title) ||
        needsTranslation(r.notes) ||
        (r.source === "youtube" &&
          (isJunkYoutubeTitle(r.title) ||
            isGenericYoutubeDescription(r.description))),
    )
    .slice(0, limit);

  const results: SaveWithTags[] = [];
  for (const row of junk) {
    const updated = await refreshSavePreview(row.id);
    if (updated) results.push(updated);
    // Pace Gemini translate calls on free tier
    await new Promise((r) => setTimeout(r, 500));
  }
  return { refreshed: results.length, ids: results.map((r) => r.id) };
}

export async function deleteSave(id: string) {
  const db = getDb();
  await db.delete(saves).where(eq(saves.id, id));
}

export async function countSaves() {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(saves);
  return row?.count ?? 0;
}

export async function countUncategorized() {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(saves)
    .where(
      sql`${saves.id} NOT IN (SELECT DISTINCT ${saveTags.saveId} FROM ${saveTags})`,
    );
  return row?.count ?? 0;
}
