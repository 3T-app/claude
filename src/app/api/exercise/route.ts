import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/claude";
import { commentOnAnswer, EXERCISE_PER_DAY, problemById, randomProblem } from "@/lib/exercise";
import { errorResponse, getUid } from "@/lib/http";

export const maxDuration = 120;

/** 出店問題を1問（id を指定すればその問題、なければランダム） */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  try {
    const problem = id ? await problemById(id) : await randomProblem(url.searchParams.get("exclude") ?? undefined);
    if (!problem) return NextResponse.json({ error: "問題が見つかりません。" }, { status: 404 });
    return NextResponse.json({ problem, perDay: isDemoMode() ? null : EXERCISE_PER_DAY, demo: isDemoMode() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** 答えにコメントする */
export async function POST(req: Request) {
  const { id, answer } = (await req.json()) as { id?: string; answer?: string };
  if (!id || !answer?.trim()) return NextResponse.json({ error: "答えを書いてください。" }, { status: 400 });
  try {
    const result = await commentOnAnswer({ uid: await getUid(), id, answer: answer.trim() });
    if ("limit" in result) {
      return NextResponse.json({ error: `今日のコメントは${EXERCISE_PER_DAY}回までです。また明日挑戦してください。` }, { status: 429 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
