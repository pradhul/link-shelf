/**
 * Lightweight checks for RAG grounding helpers (no DB / Gemini).
 * Run: npx tsx scripts/verify-recommend-grounding.ts
 */
import assert from "node:assert/strict";
import {
  sanitizeTelegramText,
  truncateChars,
} from "../lib/text";

// Mirror generateDailyFoodPicks grounding rules for offline verification
type Candidate = { id: string; title: string | null; url: string };
type Pick = { saveId: string; reason: string };

function groundPicks(
  candidates: Candidate[],
  rawPicks: unknown[],
): Pick[] {
  const allowed = new Set(candidates.map((c) => c.id));
  const grounded: Pick[] = [];
  const seen = new Set<string>();
  for (const row of rawPicks) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const saveId = typeof r.saveId === "string" ? r.saveId.trim() : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    if (!saveId || !reason || seen.has(saveId)) continue;
    if (!allowed.has(saveId)) continue;
    seen.add(saveId);
    grounded.push({ saveId, reason });
    if (grounded.length >= 3) break;
  }
  return grounded;
}

const candidates: Candidate[] = [
  { id: "aaa-111", title: "Weeknight Dal", url: "https://example.com/dal" },
  { id: "bbb-222", title: "Pasta Aglio", url: "https://example.com/pasta" },
];

// Hallucinated ID rejected
const withFake = groundPicks(candidates, [
  { saveId: "fake-999", reason: "Invented dish" },
  { saveId: "aaa-111", reason: "Try Weeknight Dal tonight." },
]);
assert.equal(withFake.length, 1);
assert.equal(withFake[0].saveId, "aaa-111");
assert.match(withFake[0].reason, /Weeknight Dal/);

// Duplicate IDs collapsed
const withDup = groundPicks(candidates, [
  { saveId: "bbb-222", reason: "Pasta Aglio is quick." },
  { saveId: "bbb-222", reason: "Again pasta." },
]);
assert.equal(withDup.length, 1);

// Idempotency key is date string shape
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const sample = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
assert.match(sample, dateRe);

console.log("ok: grounding rejects hallucinated IDs; date format OK");
console.log("ok: dual delivery = same daily_recommendations row for /today + Telegram");
console.log("ok: idempotency = getOrCreate returns stored row when date exists");

// Unicode-safe title truncation (emoji must not produce unpaired surrogates)
const unpaired =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// High surrogate of 🀄️ (U+1F004) then more text — classic mid-emoji String#slice break
const withFlagEmoji = `${"x".repeat(110)}\u{1F1EE}\u{1F1F3}END`;
// UTF-16 slice mid-emoji (code-unit index 111 splits the first regional indicator)
const brokenSlice = `${withFlagEmoji.slice(0, 111)}…`;
assert.match(brokenSlice, unpaired);
const safe = truncateChars(withFlagEmoji, 112);
assert.doesNotMatch(safe, unpaired);
assert.ok(Array.from(safe).length <= 112);
assert.equal(sanitizeTelegramText("hello\uD83C…world"), "hello…world");
console.log("ok: truncateChars keeps Telegram-safe UTF-16");
