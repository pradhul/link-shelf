import { NextResponse } from "next/server";
import {
  getOrCreateThisFridaysMovies,
  regenerateThisFridaysMovies,
} from "@/lib/recommend-movies";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rec = await getOrCreateThisFridaysMovies();
    return NextResponse.json({
      date: rec.date,
      created: rec.created,
      createdAt: rec.createdAt,
      picks: rec.picks.map((p) => ({
        saveId: p.saveId,
        reason: p.reason,
        save: p.save,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Manual “Generate Friday picks” — replaces this Friday’s row. */
export async function POST() {
  try {
    const rec = await regenerateThisFridaysMovies();
    return NextResponse.json({
      date: rec.date,
      created: rec.created,
      createdAt: rec.createdAt,
      picks: rec.picks.map((p) => ({
        saveId: p.saveId,
        reason: p.reason,
        save: p.save,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
