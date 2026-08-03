import { NextResponse } from "next/server";
import { refreshSavePreview } from "@/lib/saves";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    const save = await refreshSavePreview(id);
    if (!save) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(save);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to refresh preview" },
      { status: 500 },
    );
  }
}
