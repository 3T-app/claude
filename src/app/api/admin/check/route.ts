import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/admin";
import { estatEnabled, testEstat } from "@/lib/sources/estat";
import { hotpepperEnabled, testHotPepper } from "@/lib/sources/hotpepper";
import { testYouTube, youtubeEnabled } from "@/lib/sources/youtube";

export const maxDuration = 60;

async function run(enabled: boolean, test: () => Promise<string>) {
  if (!enabled) return { ok: false, message: "APIキーが未設定です" };
  try {
    return { ok: true, message: await test() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// 外部データの接続テスト
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return NextResponse.json({ error: "管理トークンが違います。" }, { status: 401 });
  const [youtube, hotpepper, estat] = await Promise.all([
    run(youtubeEnabled(), testYouTube),
    run(hotpepperEnabled(), testHotPepper),
    run(estatEnabled(), testEstat),
  ]);
  return NextResponse.json({ youtube, hotpepper, estat });
}
