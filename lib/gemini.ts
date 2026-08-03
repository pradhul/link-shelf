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
  fallbackUrl: string,
): CategorizeResult {
  const confidence = Number(item.confidence);
  return {
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

export async function categorizeLinks(
  items: LinkForCategorize[],
  tagTree: TagTreeNode[],
): Promise<CategorizeResult[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const tagHint =
    tagTree.length === 0
      ? "(no existing tags yet — suggest sensible topTag/subTag names, or null)"
      : JSON.stringify(tagTree, null, 2);

  const textParts: string[] = [
    `You categorize social links for a household bookmark app.
Prefer EXISTING tags from this tree (match names case-insensitively):
${tagHint}

Rules:
- Return a JSON array only, one object per input link, same order.
- Each object: { "url": string, "topTag": string|null, "subTag": string|null, "confidence": number 0-1, "reason": string }
- Prefer existing topTag/subTag names when they fit.
- You may invent a new topTag/subTag only if nothing fits; keep names short.
- If unsure (weak metadata / unclear preview), set confidence low (<0.7) and topTag/subTag to null.
- Use the preview image when present to improve the guess.
- Do not invent facts not supported by title, description, URL, or image.`,
  ];

  items.forEach((item, i) => {
    textParts.push(
      `\nLink ${i + 1}:\n` +
        JSON.stringify(
          {
            url: item.url,
            source: item.source,
            title: item.title,
            description: item.description,
            hasImage: Boolean(item.image),
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

  for (let i = 0; i < items.length; i++) {
    const img = items[i].image;
    if (img) {
      parts.push({
        text: `\n[Image for link ${i + 1}: ${items[i].url}]`,
      });
      parts.push({
        inlineData: {
          data: img.data.toString("base64"),
          mimeType: img.mimeType,
        },
      });
    }
  }

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  const text = result.response.text();
  const parsed = extractJson(text);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini returned non-array JSON");
  }

  return items.map((item, i) => {
    const row = parsed[i];
    if (row && typeof row === "object") {
      return normalizeResult(row as Record<string, unknown>, item.url);
    }
    return {
      url: item.url,
      topTag: null,
      subTag: null,
      confidence: 0,
      reason: "missing model result",
    };
  });
}
