/**
 * Telegram (and JSON) reject unpaired UTF-16 surrogates / NULs.
 * JS String#slice counts UTF-16 code units, so truncating emoji-heavy
 * Instagram titles mid-pair breaks outbound digests.
 */

const UNPAIRED_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Strip NULs and unpaired surrogates. */
export function stripInvalidUtf16(text: string): string {
  return text.replace(/\u0000/g, "").replace(UNPAIRED_SURROGATE, "");
}

/** Strip NULs and unpaired surrogates so Telegram will accept the text. */
export function sanitizeTelegramText(text: string): string {
  return stripInvalidUtf16(text);
}

/**
 * Truncate by Unicode code points (not UTF-16 units).
 * When truncated, appends `ellipsis` within the max budget.
 */
export function truncateChars(
  text: string,
  maxChars: number,
  ellipsis = "…",
): string {
  const clean = sanitizeTelegramText(text);
  const chars = Array.from(clean);
  if (chars.length <= maxChars) return clean;

  const ellipsisChars = Array.from(ellipsis);
  const budget = Math.max(0, maxChars - ellipsisChars.length);
  return chars.slice(0, budget).join("") + ellipsis;
}
