import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { saveTags, tags, type Tag } from "./schema";

const DEFAULT_ICONS: Record<string, string> = {
  recipes: "restaurant",
  recipe: "restaurant",
  movies: "movie",
  movie: "movie",
  films: "movie",
  film: "movie",
  travel: "explore",
  funny: "mood",
  fitness: "fitness_center",
  workout: "fitness_center",
  design: "palette",
  tech: "memory",
  shopping: "shopping_bag",
};

export function slugify(input: string) {
  const base = input
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    // Letters + combining marks (Indic matras) + numbers
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  if (base) return base;

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `tag-${hash.toString(36)}`;
}

export function titleCase(input: string) {
  const trimmed = input.trim();
  // Leave Indic / non-Latin scripts mostly as-is; only title-case Latin words
  if (/[^\u0000-\u024F]/.test(trimmed)) {
    return trimmed;
  }
  return trimmed
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function parseTagPath(input: string): {
  tag: string;
  subtag?: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed || /^skip$/i.test(trimmed)) return null;

  const parts = trimmed
    .split(/[/>|]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return { tag: parts[0] };
  return { tag: parts[0], subtag: parts[1] };
}

export async function findOrCreateTag(
  name: string,
  parentId: string | null = null,
): Promise<Tag> {
  const db = getDb();
  const slug = slugify(name);
  if (!slug) {
    throw new Error("Invalid tag name");
  }

  const existing = parentId
    ? await db.query.tags.findFirst({
        where: and(eq(tags.slug, slug), eq(tags.parentId, parentId)),
      })
    : await db.query.tags.findFirst({
        where: and(eq(tags.slug, slug), isNull(tags.parentId)),
      });

  if (existing) return existing;

  const icon = parentId ? null : DEFAULT_ICONS[slug] ?? "label";
  let sortOrder = 0;
  if (!parentId) {
    const [maxSort] = await db
      .select({
        sortOrder: sql<number>`coalesce(max(${tags.sortOrder}), -1)`,
      })
      .from(tags)
      .where(isNull(tags.parentId));
    sortOrder = (maxSort?.sortOrder ?? -1) + 1;
  }

  const [created] = await db
    .insert(tags)
    .values({
      name: titleCase(name),
      slug,
      parentId,
      icon,
      sortOrder,
    })
    .returning();

  return created;
}

export async function getTopLevelTags() {
  const db = getDb();
  return db.query.tags.findMany({
    where: isNull(tags.parentId),
    orderBy: (t, { asc: a }) => [a(t.sortOrder), a(t.name)],
  });
}

export async function getSubtags(parentId: string) {
  const db = getDb();
  return db.query.tags.findMany({
    where: eq(tags.parentId, parentId),
    orderBy: (t, { asc: a }) => [a(t.sortOrder), a(t.name)],
  });
}

export async function getTagById(id: string) {
  const db = getDb();
  return db.query.tags.findFirst({ where: eq(tags.id, id) });
}

export async function getTagBySlug(slug: string, parentId: string | null = null) {
  const db = getDb();
  if (parentId) {
    return db.query.tags.findFirst({
      where: and(eq(tags.slug, slug), eq(tags.parentId, parentId)),
    });
  }
  return db.query.tags.findFirst({
    where: and(eq(tags.slug, slug), isNull(tags.parentId)),
  });
}

export type TagTreeNode = {
  name: string;
  slug: string;
  subtags: { name: string; slug: string }[];
};

/** Serialize top-level tags with their subtags for LLM prompts. */
export async function getTagTree(): Promise<TagTreeNode[]> {
  const top = await getTopLevelTags();
  const nodes: TagTreeNode[] = [];
  for (const t of top) {
    const subs = await getSubtags(t.id);
    nodes.push({
      name: t.name,
      slug: t.slug,
      subtags: subs.map((s) => ({ name: s.name, slug: s.slug })),
    });
  }
  return nodes;
}

export async function renameTag(id: string, name: string) {
  const db = getDb();
  const tag = await getTagById(id);
  if (!tag) throw new Error("Tag not found");

  const newName = titleCase(name);
  const newSlug = slugify(name);
  if (!newSlug) throw new Error("Invalid tag name");

  const conflict = tag.parentId
    ? await db.query.tags.findFirst({
        where: and(
          eq(tags.slug, newSlug),
          eq(tags.parentId, tag.parentId),
          sql`${tags.id} <> ${id}`,
        ),
      })
    : await db.query.tags.findFirst({
        where: and(
          eq(tags.slug, newSlug),
          isNull(tags.parentId),
          sql`${tags.id} <> ${id}`,
        ),
      });

  if (conflict) throw new Error("A tag with that name already exists");

  const icon = tag.parentId
    ? tag.icon
    : DEFAULT_ICONS[newSlug] ?? tag.icon ?? "label";

  const [updated] = await db
    .update(tags)
    .set({ name: newName, slug: newSlug, icon })
    .where(eq(tags.id, id))
    .returning();

  return updated;
}

export async function mergeTags(sourceId: string, targetId: string) {
  const db = getDb();
  if (sourceId === targetId) throw new Error("Cannot merge a tag into itself");

  const source = await getTagById(sourceId);
  const target = await getTagById(targetId);
  if (!source || !target) throw new Error("Tag not found");

  const sameLevel =
    (source.parentId == null && target.parentId == null) ||
    (source.parentId != null &&
      target.parentId != null &&
      source.parentId === target.parentId);
  if (!sameLevel) {
    throw new Error("Can only merge tags at the same level");
  }

  // Move save links from source leaf → target leaf
  const linked = await db
    .select()
    .from(saveTags)
    .where(eq(saveTags.tagId, sourceId));

  for (const link of linked) {
    await db
      .delete(saveTags)
      .where(
        and(eq(saveTags.saveId, link.saveId), eq(saveTags.tagId, sourceId)),
      );
    try {
      await db
        .insert(saveTags)
        .values({ saveId: link.saveId, tagId: targetId });
    } catch {
      // already linked to target
    }
  }

  // If merging top tags, move child subtags onto target (by slug merge)
  if (source.parentId == null) {
    const children = await getSubtags(sourceId);
    for (const child of children) {
      const existing = await db.query.tags.findFirst({
        where: and(eq(tags.slug, child.slug), eq(tags.parentId, targetId)),
      });
      if (existing) {
        await mergeTags(child.id, existing.id);
      } else {
        await db
          .update(tags)
          .set({ parentId: targetId })
          .where(eq(tags.id, child.id));
      }
    }
  }

  await db.delete(tags).where(eq(tags.id, sourceId));
  return getTagById(targetId);
}

export async function deleteTagIfEmpty(id: string) {
  const db = getDb();
  const tag = await getTagById(id);
  if (!tag) throw new Error("Tag not found");

  const [usage] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(saveTags)
    .where(eq(saveTags.tagId, id));
  if ((usage?.count ?? 0) > 0) {
    throw new Error("Tag is still used by saves");
  }

  const children = await getSubtags(id);
  for (const child of children) {
    await deleteTagIfEmpty(child.id);
  }

  await db.delete(tags).where(eq(tags.id, id));
  return { ok: true };
}

export async function reorderTopTags(orderedIds: string[]) {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(tags)
      .set({ sortOrder: i })
      .where(and(eq(tags.id, orderedIds[i]), isNull(tags.parentId)));
  }
  return getTopLevelTags();
}

export async function listTagsForManage() {
  const top = await getTopLevelTags();
  const result = [];
  for (const t of top) {
    const subtags = await getSubtags(t.id);
    const [usage] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(saveTags)
      .where(eq(saveTags.tagId, t.id));
    const subWithUsage = [];
    for (const s of subtags) {
      const [su] = await getDb()
        .select({ count: sql<number>`count(*)::int` })
        .from(saveTags)
        .where(eq(saveTags.tagId, s.id));
      subWithUsage.push({ ...s, usageCount: su?.count ?? 0 });
    }
    // Usage of top leaf + all sub leaves for "used" display
    const subUsage = subWithUsage.reduce((n, s) => n + s.usageCount, 0);
    result.push({
      ...t,
      usageCount: (usage?.count ?? 0) + subUsage,
      directUsageCount: usage?.count ?? 0,
      subtags: subWithUsage,
    });
  }
  return result;
}
