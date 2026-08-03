export type OgData = {
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
};

export type ThumbnailBytes = {
  data: Buffer;
  mimeType: string;
};

function detectSource(
  url: string,
): "instagram" | "youtube" | "other" | "manual" {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("instagram.com") || host === "instagr.am") {
      return "instagram";
    }
    if (
      host.includes("youtube.com") ||
      host === "youtu.be" ||
      host.includes("youtube-nocookie.com")
    ) {
      return "youtube";
    }
  } catch {
    /* ignore */
  }
  return "other";
}

export { detectSource };

function metaContent(html: string, property: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtml(m[1].trim());
  }
  return null;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

const UA =
  "Mozilla/5.0 (compatible; LinkShelfBot/1.0; +https://linkshelf.app)";

export async function fetchOgData(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<OgData> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) {
      return { title: null, description: null, thumbnailUrl: null };
    }
    const html = await res.text();
    const title =
      metaContent(html, "og:title") ||
      metaContent(html, "twitter:title") ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null;
    const description =
      metaContent(html, "og:description") ||
      metaContent(html, "description") ||
      metaContent(html, "twitter:description");
    let thumbnailUrl =
      metaContent(html, "og:image") || metaContent(html, "twitter:image");

    if (thumbnailUrl) {
      try {
        thumbnailUrl = new URL(thumbnailUrl, url).toString();
      } catch {
        /* keep as-is */
      }
    }

    return {
      title: title ? decodeHtml(title) : null,
      description,
      thumbnailUrl,
    };
  } catch {
    return { title: null, description: null, thumbnailUrl: null };
  }
}

const MAX_THUMB_BYTES = 1_000_000;

export async function fetchThumbnailBytes(
  imageUrl: string,
  opts?: { timeoutMs?: number },
): Promise<ThumbnailBytes | null> {
  const timeoutMs = opts?.timeoutMs ?? 3000;
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim();
    if (!mimeType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_THUMB_BYTES) return null;
    return { data: buf, mimeType };
  } catch {
    return null;
  }
}

function cleanUrl(raw: string) {
  return raw.replace(/[),.;!?]+$/, "");
}

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return cleanUrl(match[0]);
}

export function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const m of matches) {
    const url = cleanUrl(m);
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export function getBatchMax() {
  const n = Number(process.env.GEMINI_BATCH_MAX ?? "5");
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 5;
}
