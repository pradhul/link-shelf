-- Initial schema for The Link Shelf
CREATE TYPE "public"."save_source" AS ENUM('instagram', 'youtube', 'other', 'manual');
CREATE TYPE "public"."added_via" AS ENUM('telegram', 'web');
CREATE TYPE "public"."pending_step" AS ENUM('awaiting_tag', 'awaiting_subtag');

CREATE TABLE "saves" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" text NOT NULL,
  "title" text,
  "description" text,
  "thumbnail_url" text,
  "source" "public"."save_source" DEFAULT 'other' NOT NULL,
  "notes" text,
  "is_favorite" boolean DEFAULT false NOT NULL,
  "added_via" "public"."added_via" DEFAULT 'web' NOT NULL,
  "telegram_username" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "saves_url_unique" UNIQUE("url")
);

CREATE TABLE "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "parent_id" uuid,
  "icon" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id");
CREATE UNIQUE INDEX "tags_parent_slug_uidx" ON "tags" ("parent_id", "slug") NULLS NOT DISTINCT;

CREATE TABLE "save_tags" (
  "save_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  CONSTRAINT "save_tags_save_id_tag_id_pk" PRIMARY KEY("save_id","tag_id")
);

ALTER TABLE "save_tags" ADD CONSTRAINT "save_tags_save_id_saves_id_fk" FOREIGN KEY ("save_id") REFERENCES "public"."saves"("id") ON DELETE cascade;
ALTER TABLE "save_tags" ADD CONSTRAINT "save_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade;

CREATE TABLE "pending_saves" (
  "telegram_user_id" bigint PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "step" "public"."pending_step" DEFAULT 'awaiting_tag' NOT NULL,
  "tag_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
