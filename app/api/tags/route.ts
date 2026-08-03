import { NextResponse } from "next/server";
import {
  deleteTagIfEmpty,
  findOrCreateTag,
  getSubtags,
  getTopLevelTags,
  listTagsForManage,
  mergeTags,
  renameTag,
  reorderTopTags,
} from "@/lib/tags";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const manage = searchParams.get("manage") === "1";

  if (manage) {
    const items = await listTagsForManage();
    return NextResponse.json({ items });
  }
  if (parentId) {
    const items = await getSubtags(parentId);
    return NextResponse.json({ items });
  }
  const items = await getTopLevelTags();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = body.action ? String(body.action) : "create";

    if (action === "merge") {
      const sourceId = String(body.sourceId ?? "");
      const targetId = String(body.targetId ?? "");
      if (!sourceId || !targetId) {
        return NextResponse.json(
          { error: "sourceId and targetId required" },
          { status: 400 },
        );
      }
      const tag = await mergeTags(sourceId, targetId);
      return NextResponse.json(tag);
    }

    if (action === "reorder") {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.map(String)
        : [];
      const items = await reorderTopTags(orderedIds);
      return NextResponse.json({ items });
    }

    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    const parentId = body.parentId ? String(body.parentId) : null;
    const tag = await findOrCreateTag(name, parentId);
    return NextResponse.json(tag);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const name = String(body.name ?? "").trim();
    if (!id || !name) {
      return NextResponse.json(
        { error: "id and name required" },
        { status: 400 },
      );
    }
    const tag = await renameTag(id, name);
    return NextResponse.json(tag);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Rename failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteTagIfEmpty(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
