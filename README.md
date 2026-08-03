# The Link Shelf

Household PWA for saving Instagram, YouTube, and other links — via Telegram bot or the web UI. Built with Next.js on Vercel, Neon Postgres, and UI from the Stitch **Link Shelf PWA** project.

## Features

- Shared household password login
- Tag → optional subtag organization
- Telegram bot ingest (link → tag buttons / type)
- **Multi-link auto-tag** via Gemini (preview image + metadata; low confidence → uncategorized)
- Manual **Add Link** in the app
- Favorites, search, edit notes/classification
- Installable PWA (online-only)

## Setup

### 1. Neon database

1. In the [Vercel dashboard](https://vercel.com), create a project for this repo.
2. Add **Neon** from the [Vercel Marketplace](https://vercel.com/marketplace?category=storage) (free tier is enough).
3. Copy `DATABASE_URL` into your environment.

Or create a Neon project at [neon.tech](https://neon.tech) and paste the connection string.

Apply the schema:

```bash
cp .env.example .env.local
# set DATABASE_URL and other vars
npm run db:push
# or: psql "$DATABASE_URL" -f drizzle/0000_init.sql
```

### 2. Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `HOUSEHOLD_PASSWORD` | Shared login password |
| `HOUSEHOLD_SESSION_SECRET` | Long random string for signing cookies |
| `TELEGRAM_BOT_TOKEN` | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret for webhook verification |
| `TELEGRAM_ALLOWED_USER_IDS` | Comma-separated Telegram user IDs |
| `GEMINI_API_KEY` | Google AI Studio key for multi-link auto-tag |
| `GEMINI_MODEL` | Optional (default `gemini-3.1-flash-lite`; falls back through Flash-Lite / Flash) |
| `GEMINI_CONFIDENCE_THRESHOLD` | Optional (default `0.7`) |
| `GEMINI_BATCH_MAX` | Optional max URLs per message (default `5`) |

Find your Telegram user ID via [@userinfobot](https://t.me/userinfobot). Get a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey).

### 3. Telegram bot webhook

1. Create a bot with BotFather; copy the token.
2. Deploy the app to Vercel (or run locally with a tunnel).
3. Set the webhook (replace placeholders):

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_DOMAIN/api/telegram/webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

### 4. Local development

```bash
npm install
cp .env.example .env.local
# fill env vars, run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), log in with `HOUSEHOLD_PASSWORD`.

### Bot flow

1. Send **one** URL → pick a tag button (or type `recipe/pasta` / `skip`).
2. Send **two or more** URLs in one message → Gemini auto-categorizes (uses title + preview image when available). High confidence gets tags; low confidence saves **uncategorized** for editing in the app.
3. Links appear in the PWA with OG title/thumbnail when available.

## Design reference

Stitch HTML/screenshots live in [`design/stitch/`](design/stitch/). Screens: Household Login, Link Gallery, Recipes Shelf, Edit Link Classification.

## Stack

- Next.js App Router + Tailwind CSS v4
- Neon + Drizzle ORM
- Telegram Bot API webhook
- `proxy.ts` for session gating (Next.js 16)
