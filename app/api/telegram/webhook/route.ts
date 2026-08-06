import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  confidentNamePairs,
  enrichLinkForCategorize,
  formatConfidentLabel,
  runCategorizeBatch,
  saveSourceFromDetect,
  toLinkForCategorize,
  type EnrichedLink,
} from "@/lib/categorize-saves";
import { getDb } from "@/lib/db";
import { extractUrl, extractUrls, getBatchMax } from "@/lib/og";
import { createOrUpdateSave, getSaveById } from "@/lib/saves";
import { pendingSaves, tags } from "@/lib/schema";
import {
  findOrCreateTag,
  getSubtags,
  getTopLevelTags,
  parseTagPath,
} from "@/lib/tags";
import {
  answerCallbackQuery,
  buildTagKeyboard,
  changeTagKeyboard,
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

async function setPendingTag(userId: number, url: string) {
  const db = getDb();
  await db
    .insert(pendingSaves)
    .values({
      telegramUserId: userId,
      url,
      step: "awaiting_tag",
      tagId: null,
    })
    .onConflictDoUpdate({
      target: pendingSaves.telegramUserId,
      set: {
        url,
        step: "awaiting_tag",
        tagId: null,
        createdAt: new Date(),
      },
    });
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

async function promptTopTags(chatId: number, intro?: string) {
  const topTags = await getTopLevelTags();
  const prefix = intro ? `${intro}\n\n` : "";
  if (topTags.length === 0) {
    await sendMessage(
      chatId,
      `${prefix}Got it. No tags yet — type a tag (e.g. recipe), recipe/pasta, or skip.`,
    );
    return;
  }
  await sendMessage(
    chatId,
    `${prefix}Pick a tag, type a new one, or send recipe/pasta:`,
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

async function handleSingleUrl(
  chatId: number,
  userId: number,
  url: string,
  username: string | undefined,
) {
  await clearPending(userId);
  await sendMessage(chatId, "Saving and auto-tagging…");

  const enriched = await enrichLinkForCategorize(url);
  const { results, error } = await runCategorizeBatch([
    toLinkForCategorize(enriched),
  ]);
  const cat = results?.[0] ?? null;
  const pairs = confidentNamePairs(cat);

  if (pairs.length > 0 && cat) {
    const { save, created } = await createOrUpdateSave({
      url: enriched.url,
      classifications: pairs,
      addedVia: "telegram",
      telegramUsername: username,
      title: enriched.title,
      og: enriched.og,
      source: saveSourceFromDetect(enriched.source),
    });
    const { paths, confPct } = formatConfidentLabel(pairs, cat);
    const label = save.title || enriched.url;
    await sendMessage(
      chatId,
      `${created ? "Saved" : "Updated"}: ${label}\n→ ${paths} (${confPct}%)`,
      changeTagKeyboard(save.id),
    );
    return;
  }

  // AI failed / low confidence — persist uncategorized, then manual fallback
  await createOrUpdateSave({
    url: enriched.url,
    classifications: [],
    topTagName: null,
    addedVia: "telegram",
    telegramUsername: username,
    title: enriched.title,
    og: enriched.og,
    source: saveSourceFromDetect(enriched.source),
  });

  await setPendingTag(userId, url);

  const why = error
    ? `Auto-tag failed: ${error}`
    : cat?.reason
      ? `Couldn't auto-tag confidently — ${cat.reason}`
      : "Couldn't auto-tag confidently";
  await promptTopTags(chatId, `${why}\nSaved as uncategorized — pick a tag manually:`);
}

async function handleBatchUrls(
  chatId: number,
  userId: number,
  urls: string[],
  username: string | undefined,
) {
  const batchMax = getBatchMax();
  const selected = urls.slice(0, batchMax);
  const skippedOverMax = urls.length - selected.length;

  await clearPending(userId);
  await sendMessage(
    chatId,
    `Found ${urls.length} link${urls.length === 1 ? "" : "s"}. Saving ${selected.length}…` +
      (skippedOverMax > 0
        ? ` (${skippedOverMax} left for a second message — free tier works better with ≤${batchMax})`
        : ""),
  );

  // 1) Enrich + persist as uncategorized first (so timeouts/AI failures don't drop links)
  type SavedItem = {
    enriched: EnrichedLink;
    created: boolean;
    label: string;
  };
  const saved: SavedItem[] = [];
  const failedToSave: string[] = [];

  for (const url of selected) {
    let enriched: EnrichedLink;
    try {
      enriched = await enrichLinkForCategorize(url);
    } catch (err) {
      console.error("enrich failed", url, err);
      enriched = {
        url,
        source: "other",
        title: null,
        description: null,
        og: { title: null, description: null, thumbnailUrl: null },
        image: null,
      };
    }

    try {
      const { save, created } = await createOrUpdateSave({
        url: enriched.url,
        classifications: [],
        topTagName: null,
        addedVia: "telegram",
        telegramUsername: username,
        title: enriched.title,
        og: enriched.og,
        source: saveSourceFromDetect(enriched.source),
      });
      saved.push({
        enriched,
        created,
        label: save.title || enriched.url,
      });
    } catch (err) {
      console.error("save failed", url, err);
      failedToSave.push(url);
    }
  }

  if (saved.length === 0) {
    await sendMessage(
      chatId,
      "Couldn't save any of those links. Try again one at a time.",
    );
    return;
  }

  // 2) AI categorize, then update tags for confident hits
  await sendMessage(chatId, `Auto-tagging ${saved.length}…`);
  const { results, error } = await runCategorizeBatch(
    saved.map((s) => toLinkForCategorize(s.enriched)),
  );

  if (error) {
    await sendMessage(
      chatId,
      `Auto-tag failed: ${error}\nLinks are saved as uncategorized — edit tags in the app.`,
    );
  }

  const lines: string[] = [];
  let tagged = 0;
  let uncategorized = 0;

  for (let i = 0; i < saved.length; i++) {
    const item = saved[i];
    const cat = results?.[i] ?? null;
    const pairs = confidentNamePairs(cat);

    if (pairs.length > 0 && cat) {
      try {
        await createOrUpdateSave({
          url: item.enriched.url,
          classifications: pairs,
          addedVia: "telegram",
          telegramUsername: username,
          title: item.enriched.title,
          og: item.enriched.og,
          source: saveSourceFromDetect(item.enriched.source),
        });
        tagged += 1;
        const { paths, confPct } = formatConfidentLabel(pairs, cat);
        lines.push(
          `• ${item.created ? "Saved" : "Updated"}: ${item.label}\n  → ${paths} (${confPct}%)`,
        );
        continue;
      } catch (err) {
        console.error("retag failed", item.enriched.url, err);
      }
    }

    uncategorized += 1;
    const why = cat?.reason ? ` — ${cat.reason}` : "";
    lines.push(
      `• ${item.created ? "Saved" : "Updated"}: ${item.label}\n  → uncategorized (review in app)${why}`,
    );
  }

  const header =
    `Done. Tagged: ${tagged} · Uncategorized: ${uncategorized}` +
    (failedToSave.length > 0 ? ` · Failed: ${failedToSave.length}` : "") +
    (skippedOverMax > 0 ? ` · Skipped: ${skippedOverMax}` : "");
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

  try {
    // Manual override after AI auto-tag — no pending required yet
    if (data.startsWith("retag:")) {
      const saveId = data.slice(6);
      const save = await getSaveById(saveId);
      if (!save) {
        await clearInlineKeyboard(chatId, messageId);
        await sendMessage(chatId, "That link is gone. Send it again to retag.");
        return;
      }
      await clearInlineKeyboard(chatId, messageId);
      await setPendingTag(userId, save.url);
      await promptTopTags(chatId, "Pick a new tag:");
      return;
    }

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
      await handleSingleUrl(chatId, userId, urlInMessage, username);
      return;
    }

    if (!pending) {
      await sendMessage(
        chatId,
        "Send me an Instagram or YouTube link to save it to The Link Shelf.\nLinks are auto-tagged; you can change the tag anytime.",
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
