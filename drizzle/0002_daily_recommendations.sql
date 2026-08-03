-- Persists daily food picks so refresh/cron don't reshuffle within a day.
CREATE TABLE IF NOT EXISTS "daily_recommendations" (
	"date" text PRIMARY KEY NOT NULL,
	"picks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
