import { NextResponse } from "next/server";
import {
  getOrCreateTodaysRecommendations,
  regenerateTodaysRecommendations,
} from "@/lib/recommend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rec = await getOrCreateTodaysRecommendations();
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

/** Manual “Generate today’s picks” — replaces today’s row. */
export async function POST() {
  try {
    const rec = await regenerateTodaysRecommendations();
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
