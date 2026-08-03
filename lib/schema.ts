import {
  boolean,
  bigint,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const sourceEnum = pgEnum("save_source", [
  "instagram",
  "youtube",
  "other",
  "manual",
]);

export const addedViaEnum = pgEnum("added_via", ["telegram", "web"]);

export const pendingStepEnum = pgEnum("pending_step", [
  "awaiting_tag",
  "awaiting_subtag",
]);

export const saves = pgTable("saves", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull().unique(),
  title: text("title"),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  source: sourceEnum("source").notNull().default("other"),
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  addedVia: addedViaEnum("added_via").notNull().default("web"),
  telegramUsername: text("telegram_username"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: uuid("parent_id"),
    icon: text("icon"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: "tags_parent_id_fk",
    }),
    uniqueIndex("tags_parent_slug_uidx").on(table.parentId, table.slug),
  ],
);

export const saveTags = pgTable(
  "save_tags",
  {
    saveId: uuid("save_id")
      .notNull()
      .references(() => saves.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.saveId, table.tagId] })],
);

export const pendingSaves = pgTable("pending_saves", {
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).primaryKey(),
  url: text("url").notNull(),
  step: pendingStepEnum("step").notNull().default("awaiting_tag"),
  tagId: uuid("tag_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Save = typeof saves.$inferSelect;
export type Tag = typeof tags.$inferSelect;
