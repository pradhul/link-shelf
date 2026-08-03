import { NextResponse } from "next/server";
import { createOrUpdateSave, listSaves } from "@/lib/saves";
import { getTopLevelTags } from "@/lib/tags";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const favorites = searchParams.get("favorites") === "1";
  const uncategorized = searchParams.get("uncategorized") === "1";
  const tagId = searchParams.get("tagId") ?? undefined;
  const subtagId = searchParams.get("subtagId") ?? undefined;

  const [items, topTags] = await Promise.all([
    listSaves({
      q,
      favoritesOnly: favorites,
      uncategorizedOnly: uncategorized,
      tagId,
      subtagId,
    }),
    getTopLevelTags(),
  ]);

  return NextResponse.json({ items, topTags });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const url = String(body.url ?? "").trim();
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let classifications:
      | Array<{ topTagName: string; subTagName?: string | null }>
      | undefined;
    if (Array.isArray(body.classifications)) {
      classifications = body.classifications
        .map((c: { topTagName?: string; subTagName?: string | null }) => ({
          topTagName: String(c.topTagName ?? "").trim(),
          subTagName: c.subTagName ? String(c.subTagName) : null,
        }))
        .filter((c: { topTagName: string }) => c.topTagName);
    }

    const result = await createOrUpdateSave({
      url,
      classifications:
        classifications !== undefined
          ? classifications
          : body.topTagName
            ? [
                {
                  topTagName: String(body.topTagName),
                  subTagName: body.subTagName
                    ? String(body.subTagName)
                    : null,
                },
              ]
            : [],
      notes: body.notes ? String(body.notes) : null,
      title: body.title ? String(body.title) : null,
      addedVia: "web",
      source: "manual",
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save link" }, { status: 500 });
  }
}
