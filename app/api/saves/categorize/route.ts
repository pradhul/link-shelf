import { NextResponse } from "next/server";
import { categorizeUncategorizedSaves } from "@/lib/categorize-saves";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Number(body.limit ?? 10);
    const result = await categorizeUncategorizedSaves(
      Number.isFinite(limit) ? limit : 10,
    );
    if (result.error) {
      return NextResponse.json(result, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("categorize uncategorized failed", err);
    return NextResponse.json(
      { error: "AI categorize failed", tagged: 0, skipped: 0 },
      { status: 500 },
    );
  }
}
