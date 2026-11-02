import { NextResponse } from "next/server";
import { isDemoMode, MODEL } from "@/lib/claude";
import { adminAuthorized as authorized, adminDenied } from "@/lib/admin";
import { estatEnabled } from "@/lib/sources/estat";
import { hotpepperEnabled } from "@/lib/sources/hotpepper";
import { youtubeEnabled } from "@/lib/sources/youtube";
import { envFileProblem } from "@/lib/envcheck";
import { getTeachings } from "@/lib/knowledge";
import { postPlaceName } from "@/lib/posts";
import { readDB, reactionCount, updateDB } from "@/lib/store";

// 運営がAIに「何を見てほしいか」を教える画面用。ADMIN_TOKEN で保護する。

export async function GET(req: Request) {
  if (!authorized(req)) return adminDenied();
  const db = await readDB();
  const insights = db.posts
    .filter((p) => p.insight)
    .map((p) => ({
      id: p.id,
      area: postPlaceName(p),
      comment: p.comment,
      reactions: reactionCount(p),
      ...p.insight!,
    }))
    .sort((a, b) => b.reactions - a.reactions);
  return NextResponse.json({
    teachings: await getTeachings(),
    insights,
    trends: Object.values(db.trends).map(({ genre, fetchedAt, by }) => ({ genre, fetchedAt, by })),
    notes: [...db.trendNotes].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 50),
    envProblem: envFileProblem(),
    sources: {
      claude: !!process.env.ANTHROPIC_API_KEY,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      youtube: youtubeEnabled(),
      hotpepper: hotpepperEnabled(),
      estat: estatEnabled(),
    },
    stats: { posts: db.posts.length, lectures: Object.keys(db.lectures).length },
    model: MODEL,
    demo: isDemoMode(),
  });
}

export async function PUT(req: Request) {
  if (!authorized(req)) return adminDenied();
  const { teachings } = (await req.json()) as { teachings?: string };
  if (typeof teachings !== "string") return NextResponse.json({ error: "内容が空です。" }, { status: 400 });
  await updateDB((db) => {
    db.teachings = teachings.slice(0, 40000);
    db.teachingsEdited = true;
    // 教えが変わったら講義を作り直す
    db.lectures = {};
  });
  return NextResponse.json({ ok: true });
}
