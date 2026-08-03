import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ThumbnailBytes } from "./og";
import type { TagTreeNode } from "./tags";

export type LinkForCategorize = {
  url: string;
  source: string;
  title: string | null;
  description: string | null;
  image?: ThumbnailBytes | null;
};

export type ClassificationSuggestion = {
  topTag: string;
  subTag: string | null;
  confidence: number;
};

export type CategorizeResult = {
  index: number;
  url: string;
  classifications: ClassificationSuggestion[];
  /** Highest confidence among classifications (or legacy single). */
  confidence: number;
  reason: string;
  /** @deprecated use classifications[0] */
  topTag: string | null;
  /** @deprecated use classifications[0] */
  subTag: string | null;
};

export function getConfidenceThreshold() {
  const n = Number(process.env.GEMINI_CONFIDENCE_THRESHOLD ?? "0.7");
  return Number.isFinite(n) ? n : 0.7;
}

export function hasGeminiKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  const startArr = raw.indexOf("[");
  const endArr = raw.lastIndexOf("]");
  if (startArr >= 0 && endArr > startArr) {
    return JSON.parse(raw.slice(startArr, endArr + 1));
  }
  const startObj = raw.indexOf("{");
  const endObj = raw.lastIndexOf("}");
  if (startObj >= 0 && endObj > startObj) {
    return JSON.parse(raw.slice(startObj, endObj + 1));
  }
  return JSON.parse(raw);
}

function normalizeResult(
  item: Record<string, unknown>,
  index: number,
  fallbackUrl: string,
): CategorizeResult {
  const idx = Number(item.index);
  const reason = typeof item.reason === "string" ? item.reason : "";

  const classifications: ClassificationSuggestion[] = [];
  const rawList = item.classifications;
  if (Array.isArray(rawList)) {
    for (const row of rawList.slice(0, 3)) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const top =
        typeof r.topTag === "string" && r.topTag.trim() ? r.topTag.trim() : null;
      if (!top) continue;
      const conf = Number(r.confidence);
      classifications.push({
        topTag: top,
        subTag:
          typeof r.subTag === "string" && r.subTag.trim()
            ? r.subTag.trim()
            : null,
        confidence: Number.isFinite(conf)
          ? Math.min(1, Math.max(0, conf))
          : 0,
      });
    }
  }

  // Legacy single-pair response
  if (classifications.length === 0) {
    const topTag =
      typeof item.topTag === "string" && item.topTag.trim()
        ? item.topTag.trim()
        : null;
    const subTag =
      typeof item.subTag === "string" && item.subTag.trim()
        ? item.subTag.trim()
        : null;
    const confidence = Number(item.confidence);
    if (topTag) {
      classifications.push({
        topTag,
        subTag,
        confidence: Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : 0,
      });
    }
  }

  // Dedupe by topTag (keep highest confidence)
  const byTop = new Map<string, ClassificationSuggestion>();
  for (const c of classifications) {
    const key = c.topTag.toLowerCase();
    const prev = byTop.get(key);
    if (!prev || c.confidence > prev.confidence) byTop.set(key, c);
  }
  const deduped = [...byTop.values()].slice(0, 3);
  const confidence =
    deduped.length > 0 ? Math.max(...deduped.map((c) => c.confidence)) : 0;

  return {
    index: Number.isFinite(idx) ? idx : index,
    url: typeof item.url === "string" ? item.url : fallbackUrl,
    classifications: deduped,
    confidence,
    reason,
    topTag: deduped[0]?.topTag ?? null,
    subTag: deduped[0]?.subTag ?? null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    /too many requests/i.test(msg) ||
    /resource.?exhausted/i.test(msg) ||
    /quota/i.test(msg)
  );
}

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

function getModelCandidates() {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const chain = preferred
    ? [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)]
    : [...FALLBACK_MODELS];
  return [...new Set(chain)];
}

function isModelUnavailableError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b404\b/.test(msg) ||
    /not[\s_-]?found/i.test(msg) ||
    /invalid model/i.test(msg) ||
    /model[^\n]{0,80}(unavailable|does not exist|not supported)/i.test(msg)
  );
}

export function formatGeminiError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (isRateLimitError(err)) {
    return "Gemini rate limit (429 / TooManyRequests). Free tier is strict — wait 1–2 minutes, then resend fewer links (e.g. 2–3).";
  }
  if (/API key/i.test(msg) || /403/i.test(msg) || /permission/i.test(msg)) {
    return "Gemini API key rejected. Check GEMINI_API_KEY on Vercel.";
  }
  if (isModelUnavailableError(err)) {
    return `Gemini model unavailable. Set GEMINI_MODEL (e.g. ${DEFAULT_MODEL}).`;
  }
  return msg.slice(0, 180);
}

async function generateWithRetry(
  generate: () => Promise<string>,
  attempts = 4,
): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await generate();
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || i === attempts - 1) throw err;
      // Free tier: 15s, 30s, 45s
      await sleep(15_000 * (i + 1));
    }
  }
  throw lastErr;
}

function buildParts(items: LinkForCategorize[], tagTree: TagTreeNode[], includeImages: boolean) {
  const tagHint =
    tagTree.length === 0
      ? "(no existing tags yet — suggest sensible topTag/subTag names, or null)"
      : JSON.stringify(tagTree, null, 2);

  const textParts: string[] = [
    `You categorize social links for a household bookmark app.
Prefer EXISTING tags from this tree (match names case-insensitively):
${tagHint}

Rules:
- Return a JSON array only, one object per input link, SAME ORDER as input.
- Each object MUST include: { "index": number (0-based), "url": string, "classifications": [{ "topTag": string, "subTag": string|null, "confidence": number 0-1 }], "reason": string }
- classifications: 1–3 pairs max. Same topTag at most once. Prefer multiple tops only when clearly relevant.
- Also set overall fields for compatibility: "topTag", "subTag", "confidence" matching the highest-confidence classification (or null/0).
- Copy the url EXACTLY as given in the input (including query strings).
- Prefer existing topTag/subTag names when they fit.
- You may invent a new topTag/subTag only if nothing fits; keep names short (English preferred for new tags when possible).
- Titles and descriptions may be in Malayalam, Tamil, Kannada, Hindi, or other languages — categorize by MEANING, not English keywords alone. Map to the existing English tag tree when it fits.
- If title/description/image give a clear topic, confidence should be >= 0.75.
- Only use confidence < 0.7 when metadata is empty or contradictory.
- Use the preview image when present.
- Do not invent facts not supported by title, description, URL, or image.`,
  ];

  items.forEach((item, i) => {
    textParts.push(
      `\nLink index ${i}:\n` +
        JSON.stringify(
          {
            index: i,
            url: item.url,
            source: item.source,
            title: item.title,
            description: item.description,
            hasImage: includeImages && Boolean(item.image),
          },
          null,
          2,
        ),
    );
  });

  const parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  > = [{ text: textParts.join("\n") }];

  if (includeImages) {
    // Cap images to reduce free-tier token/RPM pressure
    let imagesAttached = 0;
    const maxImages = 2;
    for (let i = 0; i < items.length; i++) {
      const img = items[i].image;
      if (!img || imagesAttached >= maxImages) continue;
      parts.push({
        text: `\n[Image for link index ${i}: ${items[i].url}]`,
      });
      parts.push({
        inlineData: {
          data: img.data.toString("base64"),
          mimeType: img.mimeType,
        },
      });
      imagesAttached += 1;
    }
  }

  return parts;
}

async function generateCategorizeText(
  modelName: string,
  apiKey: string,
  items: LinkForCategorize[],
  tagTree: TagTreeNode[],
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const run = async (includeImages: boolean) => {
    const parts = buildParts(items, tagTree, includeImages);
    return generateWithRetry(async () => {
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
      });
      return result.response.text();
    });
  };

  try {
    return await run(true);
  } catch (err) {
    // On persistent 429, retry once text-only (much smaller request)
    if (isRateLimitError(err)) {
      await sleep(20_000);
      return await run(false);
    }
    throw err;
  }
}

function parseCategorizeResults(
  text: string,
  items: LinkForCategorize[],
): CategorizeResult[] {
  const parsed = extractJson(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Gemini returned non-array JSON");
  }

  const byIndex = new Map<number, CategorizeResult>();
  parsed.forEach((row, i) => {
    if (row && typeof row === "object") {
      const normalized = normalizeResult(
        row as Record<string, unknown>,
        i,
        items[i]?.url ?? "",
      );
      byIndex.set(normalized.index, normalized);
    }
  });

  return items.map((item, i) => {
    const row =
      byIndex.get(i) ??
      (parsed[i] && typeof parsed[i] === "object"
        ? normalizeResult(parsed[i] as Record<string, unknown>, i, item.url)
        : null);
    if (row) {
      return { ...row, url: item.url, index: i };
    }
    return {
      index: i,
      url: item.url,
      classifications: [],
      topTag: null,
      subTag: null,
      confidence: 0,
      reason: "missing model result",
    };
  });
}

export async function categorizeLinks(
  items: LinkForCategorize[],
  tagTree: TagTreeNode[],
): Promise<CategorizeResult[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const candidates = getModelCandidates();
  let lastErr: unknown;
  for (const modelName of candidates) {
    try {
      const text = await generateCategorizeText(
        modelName,
        apiKey,
        items,
        tagTree,
      );
      return parseCategorizeResults(text, items);
    } catch (err) {
      lastErr = err;
      // Don't burn through models on quota — surface rate limit immediately
      if (isRateLimitError(err)) throw err;
      if (!isModelUnavailableError(err)) throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Gemini model unavailable (tried: ${candidates.join(", ")})`);
}

export type TranslateFields = {
  title?: string | null;
  notes?: string | null;
  description?: string | null;
};

/**
 * Translate non-English metadata fields to English.
 * Only includes keys present in `fields`; returns sanitized English strings.
 * Throws on hard failures; callers should catch and keep originals.
 */
export async function translateToEnglish(
  fields: TranslateFields,
): Promise<TranslateFields> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const payload: Record<string, string> = {};
  if (fields.title?.trim()) payload.title = fields.title.trim();
  if (fields.notes?.trim()) payload.notes = fields.notes.trim();
  if (fields.description?.trim()) payload.description = fields.description.trim();
  if (Object.keys(payload).length === 0) return fields;

  const prompt = `You translate bookmark metadata into clear English for a household link shelf.

Rules:
- Return a JSON object only with the SAME keys as the input.
- Translate each value into natural English.
- Keep proper nouns (names, brands, places) recognizable.
- Do not invent recipe steps, plot points, or facts not present in the source text.
- If a value is already English, return it unchanged (light cleanup OK).
- Do not add commentary.

Input:
${JSON.stringify(payload, null, 2)}`;

  const candidates = getModelCandidates();
  let lastErr: unknown;

  for (const modelName of candidates) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      });

      const text = await generateWithRetry(async () => {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        return result.response.text();
      }, 2);

      const parsed = extractJson(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Gemini translation returned non-object JSON");
      }
      const row = parsed as Record<string, unknown>;
      const out: TranslateFields = { ...fields };
      if (payload.title && typeof row.title === "string" && row.title.trim()) {
        out.title = row.title.trim();
      }
      if (payload.notes && typeof row.notes === "string" && row.notes.trim()) {
        out.notes = row.notes.trim();
      }
      if (
        payload.description &&
        typeof row.description === "string" &&
        row.description.trim()
      ) {
        out.description = row.description.trim();
      }
      return out;
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) throw err;
      if (!isModelUnavailableError(err)) throw err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Gemini translation unavailable (tried: ${candidates.join(", ")})`);
}
