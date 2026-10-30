import { NextResponse } from "next/server";
import { getLecture, remainingQuestions } from "@/lib/features";
import { errorResponse, getUid } from "@/lib/http";
import { isDemoMode } from "@/lib/claude";
import { readAreaNews } from "@/lib/news";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { key } = (await req.json()) as { key?: string };
  if (!key?.trim()) return NextResponse.json({ error: "場所を入力してください。" }, { status: 400 });
  try {
    const { area, lecture } = await getLecture(key.trim());
    if (!lecture.isTokyo) {
      return NextResponse.json({ error: "試作版は東京都内の街だけに対応しています。" }, { status: 400 });
    }
    const areaKey = area?.id ?? key.trim();
    return NextResponse.json({
      areaKey,
      area,
      lecture,
      remaining: await remainingQuestions(await getUid(), areaKey),
      demo: isDemoMode(),
      news: area ? await readAreaNews(area.id) : [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}
