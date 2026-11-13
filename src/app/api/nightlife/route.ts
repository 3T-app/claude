import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getNightlife } from "@/lib/nightlife";

export const maxDuration = 300;

/** 飲み屋街の分析（出口 → 人の流れ → 飲み屋街） */
export async function POST(req: Request) {
  const { key } = (await req.json()) as { key?: string };
  if (!key?.trim()) return NextResponse.json({ error: "街を指定してください。" }, { status: 400 });
  try {
    const { nightlife } = await getNightlife(key.trim());
    if (!nightlife) return NextResponse.json({ error: "この街の飲み屋街の分析はまだありません。" }, { status: 404 });
    return NextResponse.json({ nightlife });
  } catch (err) {
    return errorResponse(err);
  }
}
