# The Link Shelf

Household PWA for saving Instagram, YouTube, and other links — via Telegram bot or the web UI. Built with Next.js on Vercel, Neon Postgres, and UI from the Stitch **Link Shelf PWA** project.

## Features

- Shared household password login
- Tag → optional subtag organization
- Telegram bot ingest (link → tag → subtag)
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

Find your Telegram user ID via [@userinfobot](https://t.me/userinfobot).

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

1. Send an Instagram/YouTube (or any) URL to the bot.
2. Reply with a tag (`recipe`) or path (`recipe/pasta`), or `skip`.
3. If only a top tag was sent, the bot asks for an optional subtag.
4. The link appears in the PWA with OG title/thumbnail when available.

## Design reference

Stitch HTML/screenshots live in [`design/stitch/`](design/stitch/). Screens: Household Login, Link Gallery, Recipes Shelf, Edit Link Classification.

## Stack

- Next.js App Router + Tailwind CSS v4
- Neon + Drizzle ORM
- Telegram Bot API webhook
- `proxy.ts` for session gating (Next.js 16)
