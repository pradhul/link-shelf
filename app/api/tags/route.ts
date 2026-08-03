import { NextResponse } from "next/server";
import { findOrCreateTag, getSubtags, getTopLevelTags } from "@/lib/tags";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
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
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    const parentId = body.parentId ? String(body.parentId) : null;
    const tag = await findOrCreateTag(name, parentId);
    return NextResponse.json(tag);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
