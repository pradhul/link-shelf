import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractUrl } from "@/lib/og";
import { createOrUpdateSave } from "@/lib/saves";
import { pendingSaves } from "@/lib/schema";
import { findOrCreateTag, parseTagPath } from "@/lib/tags";
import {
  isAllowedTelegramUser,
  sendMessage,
  type TelegramUpdate,
  verifyWebhookSecret,
} from "@/lib/telegram";

export async function POST(request: Request) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true });
  }

  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const username = message.from.username
    ? `@${message.from.username}`
    : message.from.first_name;

  if (!isAllowedTelegramUser(userId)) {
    await sendMessage(chatId, "Sorry, you are not allowed to use this bot.");
    return NextResponse.json({ ok: true });
  }

  const db = getDb();
  const pending = await db.query.pendingSaves.findFirst({
    where: eq(pendingSaves.telegramUserId, userId),
  });

  const urlInMessage = extractUrl(text);

  try {
    if (urlInMessage) {
      await db
        .insert(pendingSaves)
        .values({
          telegramUserId: userId,
          url: urlInMessage,
          step: "awaiting_tag",
          tagId: null,
        })
        .onConflictDoUpdate({
          target: pendingSaves.telegramUserId,
          set: {
            url: urlInMessage,
            step: "awaiting_tag",
            tagId: null,
            createdAt: new Date(),
          },
        });

      await sendMessage(
        chatId,
        "Got it. Tag? (e.g. recipe, workout, funny — or skip)\nYou can also send recipe/pasta in one go.",
      );
      return NextResponse.json({ ok: true });
    }

    if (!pending) {
      await sendMessage(
        chatId,
        "Send me an Instagram or YouTube link to save it to The Link Shelf.",
      );
      return NextResponse.json({ ok: true });
    }

    if (pending.step === "awaiting_tag") {
      const parsed = parseTagPath(text);
      if (!parsed) {
        const { save, created } = await createOrUpdateSave({
          url: pending.url,
          addedVia: "telegram",
          telegramUsername: username,
        });
        await db
          .delete(pendingSaves)
          .where(eq(pendingSaves.telegramUserId, userId));
        await sendMessage(
          chatId,
          `${created ? "Saved" : "Updated"} (untagged): ${save.title ?? save.url}`,
        );
        return NextResponse.json({ ok: true });
      }

      if (parsed.subtag) {
        const { save, created } = await createOrUpdateSave({
          url: pending.url,
          topTagName: parsed.tag,
          subTagName: parsed.subtag,
          addedVia: "telegram",
          telegramUsername: username,
        });
        await db
          .delete(pendingSaves)
          .where(eq(pendingSaves.telegramUserId, userId));
        const label = `${parsed.tag}/${parsed.subtag}`;
        await sendMessage(
          chatId,
          `${created ? "Saved" : "Updated"}: ${save.title ?? save.url}\n${label}`,
        );
        return NextResponse.json({ ok: true });
      }

      const top = await findOrCreateTag(parsed.tag, null);
      await db
        .update(pendingSaves)
        .set({ step: "awaiting_subtag", tagId: top.id })
        .where(eq(pendingSaves.telegramUserId, userId));
      await sendMessage(
        chatId,
        `Subtag under “${top.name}”? (e.g. pasta — or skip)`,
      );
      return NextResponse.json({ ok: true });
    }

    if (pending.step === "awaiting_subtag") {
      const top = pending.tagId
        ? await db.query.tags.findFirst({
            where: (t, { eq: e }) => e(t.id, pending.tagId!),
          })
        : null;

      let subTagName: string | null = null;
      if (!/^skip$/i.test(text.trim())) {
        const parsed = parseTagPath(text);
        subTagName = parsed?.subtag ?? parsed?.tag ?? text.trim();
      }

      const { save, created } = await createOrUpdateSave({
        url: pending.url,
        topTagName: top?.name ?? null,
        subTagName,
        addedVia: "telegram",
        telegramUsername: username,
      });

      await db
        .delete(pendingSaves)
        .where(eq(pendingSaves.telegramUserId, userId));

      const path = [top?.name, subTagName].filter(Boolean).join("/");
      await sendMessage(
        chatId,
        `${created ? "Saved" : "Updated"}: ${save.title ?? save.url}${path ? `\n${path}` : ""}`,
      );
      return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("telegram webhook error", err);
    await sendMessage(chatId, "Something went wrong saving that link. Try again.");
  }

  return NextResponse.json({ ok: true });
}
