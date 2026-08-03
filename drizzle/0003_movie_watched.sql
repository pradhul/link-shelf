ALTER TABLE "saves" ADD COLUMN IF NOT EXISTS "is_watched" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "weekly_movie_recommendations" (
	"date" text PRIMARY KEY NOT NULL,
	"picks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
