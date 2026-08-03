import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { detectSource, fetchOgData } from "./og";
import { saveTags, saves, tags, type Save, type Tag } from "./schema";
import { findOrCreateTag } from "./tags";

export type SaveWithTags = Save & {
  topTag: Tag | null;
  subTag: Tag | null;
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
    const assigned = bySave.get(row.id) ?? [];
    const leaf = assigned[0] ?? null;
    if (!leaf) {
      return { ...row, topTag: null, subTag: null };
    }
    if (leaf.parentId) {
      return {
        ...row,
        topTag: parentMap.get(leaf.parentId) ?? null,
        subTag: leaf,
      };
    }
    return { ...row, topTag: leaf, subTag: null };
  });
}

export async function listSaves(opts: {
  favoritesOnly?: boolean;
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
  if (opts.subtagId) {
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

export async function setSaveClassification(
  saveId: string,
  topTagId: string | null,
  subTagId: string | null,
) {
  const db = getDb();
  await db.delete(saveTags).where(eq(saveTags.saveId, saveId));
  const leafId = subTagId ?? topTagId;
  if (leafId) {
    await db.insert(saveTags).values({ saveId, tagId: leafId });
  }
}

export async function createOrUpdateSave(input: {
  url: string;
  topTagName?: string | null;
  subTagName?: string | null;
  addedVia: "telegram" | "web";
  telegramUsername?: string | null;
  title?: string | null;
  notes?: string | null;
  source?: Save["source"];
}) {
  const db = getDb();
  const og = await fetchOgData(input.url);
  const source = input.source ?? detectSource(input.url);

  let topTag: Tag | null = null;
  let subTag: Tag | null = null;
  if (input.topTagName) {
    topTag = await findOrCreateTag(input.topTagName, null);
    if (input.subTagName) {
      subTag = await findOrCreateTag(input.subTagName, topTag.id);
    }
  }

  const existing = await db.query.saves.findFirst({
    where: eq(saves.url, input.url),
  });

  if (existing) {
    const [updated] = await db
      .update(saves)
      .set({
        title: input.title ?? og.title ?? existing.title,
        description: og.description ?? existing.description,
        thumbnailUrl: og.thumbnailUrl ?? existing.thumbnailUrl,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(saves.id, existing.id))
      .returning();
    await setSaveClassification(
      existing.id,
      topTag?.id ?? null,
      subTag?.id ?? null,
    );
    const [result] = await attachTags([updated]);
    return { save: result, created: false };
  }

  const [created] = await db
    .insert(saves)
    .values({
      url: input.url,
      title: input.title ?? og.title,
      description: og.description,
      thumbnailUrl: og.thumbnailUrl,
      source,
      notes: input.notes ?? null,
      addedVia: input.addedVia,
      telegramUsername: input.telegramUsername ?? null,
    })
    .returning();

  await setSaveClassification(
    created.id,
    topTag?.id ?? null,
    subTag?.id ?? null,
  );
  const [result] = await attachTags([created]);
  return { save: result, created: true };
}

export async function updateSave(
  id: string,
  data: {
    title?: string;
    notes?: string | null;
    isFavorite?: boolean;
    topTagId?: string | null;
    subTagId?: string | null;
  },
) {
  const db = getDb();
  const patch: Partial<typeof saves.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.title !== undefined) patch.title = data.title;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.isFavorite !== undefined) patch.isFavorite = data.isFavorite;

  const [updated] = await db
    .update(saves)
    .set(patch)
    .where(eq(saves.id, id))
    .returning();

  if (!updated) return null;

  if (data.topTagId !== undefined || data.subTagId !== undefined) {
    await setSaveClassification(
      id,
      data.topTagId ?? null,
      data.subTagId ?? null,
    );
  }

  return getSaveById(id);
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
