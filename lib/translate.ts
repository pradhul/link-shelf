import {
  isGenericYoutubeDescription,
  isJunkYoutubeTitle,
  sanitizeText,
} from "./og";

/**
 * True when text has enough non-Latin letters that an English translation is useful.
 * Skips empty, junk YouTube chrome, and mostly-Latin strings.
 */
export function needsTranslation(text: string | null | undefined): boolean {
  const t = (sanitizeText(text) ?? "").trim();
  if (!t || t.length < 2) return false;
  if (isJunkYoutubeTitle(t)) return false;
  if (isGenericYoutubeDescription(t)) return false;

  const letters = t.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;

  const nonLatin = letters.filter((ch) => !/\p{Script=Latin}/u.test(ch));
  if (nonLatin.length >= 3) return true;
  return nonLatin.length / letters.length >= 0.25;
}
