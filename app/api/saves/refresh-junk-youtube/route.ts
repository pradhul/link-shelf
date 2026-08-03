import { NextResponse } from "next/server";
import { refreshJunkYoutubePreviews } from "@/lib/saves";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Number(body.limit ?? 25);
    const result = await refreshJunkYoutubePreviews(
      Number.isFinite(limit) ? Math.min(limit, 50) : 25,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Bulk refresh failed" },
      { status: 500 },
    );
  }
}
