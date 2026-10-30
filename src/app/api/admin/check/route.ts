import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/admin";
import { testClaude } from "@/lib/claude";
import { testStripe } from "@/lib/payments";
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

// Claude API・決済・外部データの接続テスト
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return NextResponse.json({ error: "管理トークンが違います。" }, { status: 401 });
  const [claude, stripe, youtube, hotpepper, estat] = await Promise.all([
    run(!!process.env.ANTHROPIC_API_KEY, testClaude),
    run(!!process.env.STRIPE_SECRET_KEY, testStripe),
    run(youtubeEnabled(), testYouTube),
    run(hotpepperEnabled(), testHotPepper),
    run(estatEnabled(), testEstat),
  ]);
  return NextResponse.json({ claude, stripe, youtube, hotpepper, estat });
}
