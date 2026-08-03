const TELEGRAM_API = "https://api.telegram.org";

export function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

export function isAllowedTelegramUser(userId: number) {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  if (ids.length === 0) return false;
  return ids.includes(userId);
}

export function verifyWebhookSecret(header: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return header === expected;
}

export type InlineButton = {
  text: string;
  callback_data: string;
};

export type InlineKeyboard = {
  inline_keyboard: InlineButton[][];
};

export type TagLike = { id: string; name: string };

/** Build inline keyboard: tag/sub buttons in pairs, plus Skip + Type new. */
export function buildTagKeyboard(
  tags: TagLike[],
  prefix: "tag" | "sub",
): InlineKeyboard {
  const rows: InlineButton[][] = [];
  for (let i = 0; i < tags.length; i += 2) {
    const row: InlineButton[] = [
      { text: tags[i].name, callback_data: `${prefix}:${tags[i].id}` },
    ];
    if (tags[i + 1]) {
      row.push({
        text: tags[i + 1].name,
        callback_data: `${prefix}:${tags[i + 1].id}`,
      });
    }
    rows.push(row);
  }
  rows.push([
    { text: "Skip", callback_data: "skip" },
    { text: "Type new…", callback_data: "type_new" },
  ]);
  return { inline_keyboard: rows };
}

export function skipTypeKeyboard(): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Skip", callback_data: "skip" },
        { text: "Type new…", callback_data: "type_new" },
      ],
    ],
  };
}

export async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboard,
) {
  const token = getBotToken();
  await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
) {
  const token = getBotToken();
  await fetch(`${TELEGRAM_API}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    }),
  });
}

export async function editMessageText(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboard | { inline_keyboard: [] },
) {
  const token = getBotToken();
  await fetch(`${TELEGRAM_API}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      reply_markup: replyMarkup ?? { inline_keyboard: [] },
    }),
  });
}

export async function clearInlineKeyboard(chatId: number, messageId: number) {
  const token = getBotToken();
  await fetch(`${TELEGRAM_API}/bot${token}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    }),
  });
}

export type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: TelegramUser;
  };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramUser;
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
  };
};

export function displayName(user: TelegramUser) {
  return user.username ? `@${user.username}` : user.first_name;
}
