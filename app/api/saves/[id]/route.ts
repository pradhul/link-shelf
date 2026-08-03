import { NextResponse } from "next/server";
import {
  deleteSave,
  getSaveById,
  refreshSavePreview,
  updateSave,
} from "@/lib/saves";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const save = await getSaveById(id);
  if (!save) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(save);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const body = await request.json();
    const classifications = Array.isArray(body.classifications)
      ? body.classifications
          .map(
            (c: { topTagId?: string; subTagId?: string | null }) => ({
              topTagId: String(c.topTagId ?? ""),
              subTagId: c.subTagId ? String(c.subTagId) : null,
            }),
          )
          .filter((c: { topTagId: string }) => c.topTagId)
      : undefined;

    const save = await updateSave(id, {
      title: body.title !== undefined ? String(body.title) : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      isFavorite:
        body.isFavorite !== undefined ? Boolean(body.isFavorite) : undefined,
      isWatched:
        body.isWatched !== undefined ? Boolean(body.isWatched) : undefined,
      classifications,
      topTagId:
        classifications === undefined && body.topTagId !== undefined
          ? body.topTagId
          : undefined,
      subTagId:
        classifications === undefined && body.subTagId !== undefined
          ? body.subTagId
          : undefined,
    });
    if (!save) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(save);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  await deleteSave(id);
  return NextResponse.json({ ok: true });
}
