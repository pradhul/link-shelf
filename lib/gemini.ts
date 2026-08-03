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

export type CategorizeResult = {
  index: number;
  url: string;
  topTag: string | null;
  subTag: string | null;
  confidence: number;
  reason: string;
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
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  return JSON.parse(raw);
}

function normalizeResult(
  item: Record<string, unknown>,
  index: number,
  fallbackUrl: string,
): CategorizeResult {
  const confidence = Number(item.confidence);
  const idx = Number(item.index);
  return {
    index: Number.isFinite(idx) ? idx : index,
    url: typeof item.url === "string" ? item.url : fallbackUrl,
    topTag:
      typeof item.topTag === "string" && item.topTag.trim()
        ? item.topTag.trim()
        : null,
    subTag:
      typeof item.subTag === "string" && item.subTag.trim()
        ? item.subTag.trim()
        : null,
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : 0,
    reason: typeof item.reason === "string" ? item.reason : "",
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

export function formatGeminiError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (isRateLimitError(err)) {
    return "Gemini rate limit (429 / TooManyRequests). Free tier is strict — wait 1–2 minutes, then resend fewer links (e.g. 2–3).";
  }
  if (/API key/i.test(msg) || /403/i.test(msg) || /permission/i.test(msg)) {
    return "Gemini API key rejected. Check GEMINI_API_KEY on Vercel.";
  }
  if (/not found|404|model/i.test(msg)) {
    return "Gemini model unavailable. Set GEMINI_MODEL (e.g. gemini-2.5-flash).";
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
- Each object MUST include: { "index": number (0-based), "url": string, "topTag": string|null, "subTag": string|null, "confidence": number 0-1, "reason": string }
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

export async function categorizeLinks(
  items: LinkForCategorize[],
  tagTree: TagTreeNode[],
): Promise<CategorizeResult[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
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

  let text: string;
  try {
    text = await run(true);
  } catch (err) {
    // On persistent 429, retry once text-only (much smaller request)
    if (isRateLimitError(err)) {
      await sleep(20_000);
      text = await run(false);
    } else {
      throw err;
    }
  }

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
      topTag: null,
      subTag: null,
      confidence: 0,
      reason: "missing model result",
    };
  });
}
