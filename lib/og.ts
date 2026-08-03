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

const MAX_THUMB_BYTES = 400_000; // keep Gemini payloads small (helps free-tier 429s)


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
  return raw
    .replace(/^[\s<('"\[（]+/, "")
    .replace(/[>\])"'，。、।॥]+$/u, "")
    .replace(/[),.;!?]+$/u, "");
}

/** Remove copy-paste noise that breaks URL matching. */
export function sanitizeShareText(text: string) {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "") // ZWSP, ZWNJ, ZWJ, BOM, soft hyphen
    .replace(/\u00A0/g, " ");
}

export function extractUrl(text: string): string | null {
  const urls = extractUrls(text);
  return urls[0] ?? null;
}

export function extractUrls(text: string): string[] {
  const cleaned = sanitizeShareText(text);
  const found: string[] = [];

  // Markdown links: [label](https://...)
  for (const m of cleaned.matchAll(/\[[^\]]*]\(\s*(https?:\/\/[^)\s]+)\s*\)/gi)) {
    found.push(m[1]);
  }

  // Angle / bare URLs
  for (const m of cleaned.matchAll(/https?:\/\/[^\s<>"'\]]+/gi)) {
    found.push(m[0]);
  }

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of found) {
    const url = cleanUrl(raw);
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      // Validate
      new URL(url);
    } catch {
      continue;
    }
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

/** True when OG scraped the YouTube site chrome instead of the video. */
export function isJunkYoutubeTitle(title: string | null | undefined) {
  const t = (title ?? "").trim();
  if (!t || t === "-") return true;
  if (/^youtube$/i.test(t)) return true;
  if (/- youtube$/i.test(t)) return true;
  return false;
}

export function isGenericYoutubeDescription(
  description: string | null | undefined,
) {
  const d = (description ?? "").trim();
  return /^enjoy the videos and music you love/i.test(d);
}

/** Prefer a non-junk title from candidates (first usable wins). */
export function pickUsableTitle(
  ...candidates: Array<string | null | undefined>
) {
  for (const c of candidates) {
    if (c?.trim() && !isJunkYoutubeTitle(c)) return c.trim();
  }
  return null;
}

/** Enrich YouTube links when HTML OG is empty/blocked or junk. */
export async function fetchYoutubeOEmbed(
  url: string,
): Promise<Pick<OgData, "title" | "thumbnailUrl"> | null> {
  if (detectSource(url) !== "youtube") return null;
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title ?? null,
      thumbnailUrl: data.thumbnail_url ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchLinkPreview(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<OgData> {
  const og = await fetchOgData(url, opts);
  if (detectSource(url) !== "youtube") return og;

  // Always call oEmbed for YouTube — OG often has a valid thumbnail but a junk title
  const yt = await fetchYoutubeOEmbed(url);
  const junkTitle = isJunkYoutubeTitle(og.title);
  const junkDesc = isGenericYoutubeDescription(og.description);

  return {
    title: yt?.title ?? (junkTitle ? null : og.title),
    description: junkDesc ? null : og.description,
    thumbnailUrl: og.thumbnailUrl ?? yt?.thumbnailUrl ?? null,
  };
}
