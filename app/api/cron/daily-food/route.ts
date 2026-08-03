import { NextResponse } from "next/server";
import {
  formatTelegramDigest,
  getOrCreateTodaysRecommendations,
} from "@/lib/recommend";
import { sendMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function verifyCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;

  return false;
}

function digestRecipients(): number[] {
  const digest = process.env.TELEGRAM_DIGEST_CHAT_ID?.trim();
  if (digest) {
    const id = Number(digest);
    return Number.isFinite(id) ? [id] : [];
  }
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/**
 * Vercel cron (14:30 UTC = 20:00 IST): ensure today's picks exist, then Telegram.
 * Same DB row as /today — dual delivery.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rec = await getOrCreateTodaysRecommendations();
    const text = formatTelegramDigest(rec);
    const recipients = digestRecipients();

    const sent: number[] = [];
    for (const chatId of recipients) {
      await sendMessage(chatId, text);
      sent.push(chatId);
    }

    return NextResponse.json({
      date: rec.date,
      created: rec.created,
      pickCount: rec.picks.length,
      telegramSentTo: sent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[cron/daily-food]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
