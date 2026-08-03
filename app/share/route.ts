import { redirect } from "next/navigation";
import { extractUrls } from "@/lib/og";
import { createOrUpdateSave } from "@/lib/saves";

function pickSharedText(input: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}) {
  return [input.url, input.text, input.title].filter(Boolean).join("\n");
}

async function ingestShared(raw: string) {
  const urls = extractUrls(raw);
  if (urls.length === 0) {
    redirect("/?shared=missing");
  }

  let lastId: string | null = null;
  for (const url of urls.slice(0, 5)) {
    const { save } = await createOrUpdateSave({
      url,
      classifications: [],
      topTagName: null,
      addedVia: "web",
      source: "manual",
    });
    lastId = save.id;
  }

  if (urls.length === 1 && lastId) {
    redirect(`/?shared=1&edit=${lastId}`);
  }
  redirect(urls.length > 1 ? "/uncategorized?shared=batch" : "/");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = pickSharedText({
    title: searchParams.get("title"),
    text: searchParams.get("text"),
    url: searchParams.get("url"),
  });
  await ingestShared(raw);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let title: string | null = null;
  let text: string | null = null;
  let url: string | null = null;

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    title = form.get("title")?.toString() ?? null;
    text = form.get("text")?.toString() ?? null;
    url = form.get("url")?.toString() ?? null;
  } else {
    try {
      const body = await request.json();
      title = body.title ? String(body.title) : null;
      text = body.text ? String(body.text) : null;
      url = body.url ? String(body.url) : null;
    } catch {
      /* empty */
    }
  }

  await ingestShared(pickSharedText({ title, text, url }));
}
