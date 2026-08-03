import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { tags, type Tag } from "./schema";

const DEFAULT_ICONS: Record<string, string> = {
  recipes: "restaurant",
  recipe: "restaurant",
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
  const [created] = await db
    .insert(tags)
    .values({
      name: titleCase(name),
      slug,
      parentId,
      icon,
    })
    .returning();

  return created;
}

export async function getTopLevelTags() {
  const db = getDb();
  return db.query.tags.findMany({
    where: isNull(tags.parentId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
}

export async function getSubtags(parentId: string) {
  const db = getDb();
  return db.query.tags.findMany({
    where: eq(tags.parentId, parentId),
    orderBy: (t, { asc }) => [asc(t.name)],
  });
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
