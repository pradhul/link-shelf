import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  categorizeLinks,
  formatGeminiError,
  getConfidenceThreshold,
  hasGeminiKey,
} from "@/lib/gemini";
import {
  detectSource,
  extractUrl,
  extractUrls,
  fetchLinkPreview,
  fetchThumbnailBytes,
  getBatchMax,
} from "@/lib/og";
import { createOrUpdateSave } from "@/lib/saves";
import { pendingSaves, tags } from "@/lib/schema";
import {
  findOrCreateTag,
  getSubtags,
  getTagTree,
  getTopLevelTags,
  parseTagPath,
} from "@/lib/tags";
import {
  answerCallbackQuery,
  buildTagKeyboard,
  clearInlineKeyboard,
  displayName,
  editMessageText,
  isAllowedTelegramUser,
  sendMessage,
  skipTypeKeyboard,
  type TelegramUpdate,
  verifyWebhookSecret,
} from "@/lib/telegram";

export const maxDuration = 60;

async function clearPending(userId: number) {
  const db = getDb();
  await db.delete(pendingSaves).where(eq(pendingSaves.telegramUserId, userId));
}

async function saveAndConfirm(opts: {
  chatId: number;
  userId: number;
  url: string;
  username: string | undefined;
  topTagName?: string | null;
  subTagName?: string | null;
}) {
  const { save, created } = await createOrUpdateSave({
    url: opts.url,
    topTagName: opts.topTagName ?? null,
    subTagName: opts.subTagName ?? null,
    addedVia: "telegram",
    telegramUsername: opts.username,
  });
  await clearPending(opts.userId);
  const path = [opts.topTagName, opts.subTagName].filter(Boolean).join("/");
  const label = path
    ? `${created ? "Saved" : "Updated"}: ${save.title ?? save.url}\n${path}`
    : `${created ? "Saved" : "Updated"} (untagged): ${save.title ?? save.url}`;
  await sendMessage(opts.chatId, label);
}

async function promptTopTags(chatId: number) {
  const topTags = await getTopLevelTags();
  if (topTags.length === 0) {
    await sendMessage(
      chatId,
      "Got it. No tags yet — type a tag (e.g. recipe), recipe/pasta, or skip.",
    );
    return;
  }
  await sendMessage(
    chatId,
    "Pick a tag, type a new one, or send recipe/pasta:",
    buildTagKeyboard(topTags, "tag"),
  );
}

async function promptSubtags(
  chatId: number,
  topTag: { id: string; name: string },
) {
  const subtags = await getSubtags(topTag.id);
  if (subtags.length === 0) {
    await sendMessage(
      chatId,
      `Subtag under “${topTag.name}”? Type a name, or Skip:`,
      skipTypeKeyboard(),
    );
    return;
  }
  await sendMessage(
    chatId,
    `Pick a subtag under “${topTag.name}”, Skip, or Type new:`,
    buildTagKeyboard(subtags, "sub"),
  );
}

async function handleBatchUrls(
  chatId: number,
  userId: number,
  urls: string[],
  username: string | undefined,
) {
  const batchMax = getBatchMax();
  const selected = urls.slice(0, batchMax);
  const skipped = urls.length - selected.length;

  await clearPending(userId);
  await sendMessage(
    chatId,
    `Found ${urls.length} link${urls.length === 1 ? "" : "s"}. Analyzing ${selected.length}…` +
      (skipped > 0
        ? ` (${skipped} left for a second message — free tier works better with ≤${batchMax})`
        : ""),
  );

  const enriched = await Promise.all(
    selected.map(async (url) => {
      const og = await fetchLinkPreview(url, { timeoutMs: 3000 });
      const image = og.thumbnailUrl
        ? await fetchThumbnailBytes(og.thumbnailUrl, { timeoutMs: 3000 })
        : null;
      return {
        url,
        source: detectSource(url),
        title: og.title,
        description: og.description,
        og,
        image,
      };
    }),
  );

  const threshold = getConfidenceThreshold();
  let results: Awaited<ReturnType<typeof categorizeLinks>> | null = null;
  let categorizeError: string | null = null;

  if (!hasGeminiKey()) {
    categorizeError =
      "Auto-tag needs GEMINI_API_KEY. Saving all as uncategorized.";
    await sendMessage(chatId, categorizeError);
  } else {
    try {
      const tagTree = await getTagTree();
      results = await categorizeLinks(
        enriched.map(({ url, source, title, description, image }) => ({
          url,
          source,
          title,
          description,
          image,
        })),
        tagTree,
      );
    } catch (err) {
      console.error("gemini categorize failed", err);
      categorizeError = formatGeminiError(err);
      await sendMessage(
        chatId,
        `Auto-tag failed: ${categorizeError}\nSaving all as uncategorized — edit tags in the app.`,
      );
    }
  }

  const lines: string[] = [];
  let tagged = 0;
  let uncategorized = 0;

  for (let i = 0; i < enriched.length; i++) {
    const item = enriched[i];
    const cat = results?.[i] ?? null;
    const confidentPairs =
      cat?.classifications.filter(
        (c) => c.confidence >= threshold && Boolean(c.topTag?.trim()),
      ) ?? [];
    const confident = confidentPairs.length > 0;

    const { save, created } = await createOrUpdateSave({
      url: item.url,
      classifications: confident
        ? confidentPairs.map((c) => ({
            topTagName: c.topTag,
            subTagName: c.subTag,
          }))
        : [],
      topTagName: confident ? undefined : null,
      addedVia: "telegram",
      telegramUsername: username,
      title: item.title,
      og: item.og,
      source: item.source === "manual" ? "other" : item.source,
    });

    const label = save.title || item.url;
    if (confident) {
      tagged += 1;
      const paths = confidentPairs
        .map((c) => [c.topTag, c.subTag].filter(Boolean).join("/"))
        .join(", ");
      const confPct = Math.round(
        Math.max(...confidentPairs.map((c) => c.confidence)) * 100,
      );
      lines.push(
        `• ${created ? "Saved" : "Updated"}: ${label}\n  → ${paths} (${confPct}%)`,
      );
    } else {
      uncategorized += 1;
      const why = cat?.reason ? ` — ${cat.reason}` : "";
      lines.push(
        `• ${created ? "Saved" : "Updated"}: ${label}\n  → uncategorized (review in app)${why}`,
      );
    }
  }

  const header =
    `Done. Tagged: ${tagged} · Uncategorized: ${uncategorized}` +
    (skipped > 0 ? ` · Skipped: ${skipped}` : "");
  await sendMessage(chatId, `${header}\n\n${lines.join("\n")}`);
}

async function handleCallback(update: TelegramUpdate) {
  const cq = update.callback_query;
  if (!cq?.from || !cq.message) {
    return;
  }

  const userId = cq.from.id;
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = (cq.data ?? "").trim();
  const username = displayName(cq.from);

  await answerCallbackQuery(cq.id);

  if (!isAllowedTelegramUser(userId)) {
    await sendMessage(chatId, "Sorry, you are not allowed to use this bot.");
    return;
  }

  const db = getDb();
  const pending = await db.query.pendingSaves.findFirst({
    where: eq(pendingSaves.telegramUserId, userId),
  });

  if (!pending) {
    await clearInlineKeyboard(chatId, messageId);
    await sendMessage(
      chatId,
      "Nothing pending to tag. Send a link first.",
    );
    return;
  }

  try {
    if (data === "type_new") {
      await clearInlineKeyboard(chatId, messageId);
      const hint =
        pending.step === "awaiting_subtag"
          ? "Type the new subtag name (or skip):"
          : "Type the new tag name, or recipe/pasta:";
      await sendMessage(chatId, hint);
      return;
    }

    if (data === "skip") {
      await clearInlineKeyboard(chatId, messageId);
      if (pending.step === "awaiting_tag") {
        await saveAndConfirm({
          chatId,
          userId,
          url: pending.url,
          username,
        });
        return;
      }
      const top = pending.tagId
        ? await db.query.tags.findFirst({
            where: eq(tags.id, pending.tagId),
          })
        : null;
      await saveAndConfirm({
        chatId,
        userId,
        url: pending.url,
        username,
        topTagName: top?.name ?? null,
      });
      return;
    }

    if (data.startsWith("tag:") && pending.step === "awaiting_tag") {
      const tagId = data.slice(4);
      const top = await db.query.tags.findFirst({
        where: eq(tags.id, tagId),
      });
      if (!top || top.parentId) {
        await sendMessage(chatId, "That tag is gone. Type a tag name instead.");
        return;
      }
      await db
        .update(pendingSaves)
        .set({ step: "awaiting_subtag", tagId: top.id })
        .where(eq(pendingSaves.telegramUserId, userId));
      await editMessageText(chatId, messageId, `Tag: ${top.name}`);
      await promptSubtags(chatId, top);
      return;
    }

    if (data.startsWith("sub:") && pending.step === "awaiting_subtag") {
      const subId = data.slice(4);
      const sub = await db.query.tags.findFirst({
        where: eq(tags.id, subId),
      });
      if (!sub || !sub.parentId) {
        await sendMessage(chatId, "That subtag is gone. Type a name instead.");
        return;
      }
      const top = await db.query.tags.findFirst({
        where: eq(tags.id, sub.parentId),
      });
      await clearInlineKeyboard(chatId, messageId);
      await saveAndConfirm({
        chatId,
        userId,
        url: pending.url,
        username,
        topTagName: top?.name ?? null,
        subTagName: sub.name,
      });
      return;
    }

    await sendMessage(
      chatId,
      "That button doesn’t apply right now. Send a link or type a tag.",
    );
  } catch (err) {
    console.error("telegram callback error", err);
    await sendMessage(
      chatId,
      "Something went wrong. Try sending the link again.",
    );
  }
}

async function handleMessage(update: TelegramUpdate) {
  const message = update.message;
  if (!message?.text || !message.from) {
    return;
  }

  const userId = message.from.id;
  const chatId = message.chat.id;
  const text = message.text.trim();
  const username = displayName(message.from);

  if (!isAllowedTelegramUser(userId)) {
    await sendMessage(chatId, "Sorry, you are not allowed to use this bot.");
    return;
  }

  const db = getDb();
  const pending = await db.query.pendingSaves.findFirst({
    where: eq(pendingSaves.telegramUserId, userId),
  });

  const urls = extractUrls(text);

  try {
    if (urls.length > 1) {
      await handleBatchUrls(chatId, userId, urls, username);
      return;
    }

    const urlInMessage = urls[0] ?? extractUrl(text);

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

      await promptTopTags(chatId);
      return;
    }

    if (!pending) {
      await sendMessage(
        chatId,
        "Send me an Instagram or YouTube link to save it to The Link Shelf.\nTip: send 2+ links at once for auto-tagging.",
      );
      return;
    }

    if (pending.step === "awaiting_tag") {
      const parsed = parseTagPath(text);
      if (!parsed) {
        await saveAndConfirm({
          chatId,
          userId,
          url: pending.url,
          username,
        });
        return;
      }

      if (parsed.subtag) {
        await saveAndConfirm({
          chatId,
          userId,
          url: pending.url,
          username,
          topTagName: parsed.tag,
          subTagName: parsed.subtag,
        });
        return;
      }

      const top = await findOrCreateTag(parsed.tag, null);
      await db
        .update(pendingSaves)
        .set({ step: "awaiting_subtag", tagId: top.id })
        .where(eq(pendingSaves.telegramUserId, userId));
      await promptSubtags(chatId, top);
      return;
    }

    if (pending.step === "awaiting_subtag") {
      const top = pending.tagId
        ? await db.query.tags.findFirst({
            where: eq(tags.id, pending.tagId),
          })
        : null;

      let subTagName: string | null = null;
      if (!/^skip$/i.test(text.trim())) {
        const parsed = parseTagPath(text);
        subTagName = parsed?.subtag ?? parsed?.tag ?? text.trim();
      }

      await saveAndConfirm({
        chatId,
        userId,
        url: pending.url,
        username,
        topTagName: top?.name ?? null,
        subTagName,
      });
    }
  } catch (err) {
    console.error("telegram webhook error", err);
    await sendMessage(
      chatId,
      "Something went wrong saving that link. Try again.",
    );
  }
}

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

  if (update.callback_query) {
    await handleCallback(update);
  } else if (update.message) {
    await handleMessage(update);
  }

  return NextResponse.json({ ok: true });
}
