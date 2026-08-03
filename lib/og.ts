export type OgData = {
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
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

export async function fetchOgData(url: string): Promise<OgData> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LinkShelfBot/1.0; +https://linkshelf.app)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
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
      metaContent(html, "og:image") ||
      metaContent(html, "twitter:image");

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

export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/, "");
}
