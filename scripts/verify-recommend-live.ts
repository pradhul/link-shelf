import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const {
    listCookingCandidates,
    getFoodTagSlugs,
    todayInKolkata,
    getOrCreateTodaysRecommendations,
  } = await import("../lib/recommend");

  console.log("date", todayInKolkata());
  console.log("slugs", getFoodTagSlugs());

  const candidates = await listCookingCandidates({
    limit: 10,
    excludeSaveIds: [],
  });
  console.log("retrieve-only candidates:", candidates.length);
  for (const x of candidates) {
    console.log("-", x.isFavorite ? "★" : " ", x.title || x.url);
  }

  // Idempotency: two gets should not create two Gemini runs after first store
  const a = await getOrCreateTodaysRecommendations();
  const b = await getOrCreateTodaysRecommendations();
  console.log("first created?", a.created, "picks", a.picks.length);
  console.log("second created?", b.created, "(should be false)");
  console.log(
    "same date+ids?",
    a.date === b.date &&
      a.picks.map((p) => p.saveId).join() ===
        b.picks.map((p) => p.saveId).join(),
  );
  console.log("telegram preview:\n", (await import("../lib/recommend")).formatTelegramDigest(a));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
