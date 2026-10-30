import { NextResponse } from "next/server";
import { adminAuthorized, adminDenied } from "@/lib/admin";
import { testClaude } from "@/lib/claude";
import { keyProblem } from "@/lib/keys";
import { testStripe } from "@/lib/payments";
import { estatEnabled, testEstat } from "@/lib/sources/estat";
import { hotpepperEnabled, testHotPepper } from "@/lib/sources/hotpepper";
import { testYouTube, youtubeEnabled } from "@/lib/sources/youtube";

export const maxDuration = 60;

async function run(envName: string, enabled: boolean, test: () => Promise<string>) {
  if (!enabled) return { ok: false, message: "APIキーが未設定です" };
  // 貼り間違い（見た目が同じ別の文字・前後の空白など）を先に見つける
  const problem = keyProblem(envName);
  if (problem) return { ok: false, message: problem };
  try {
    return { ok: true, message: await test() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// Claude API・決済・外部データの接続テスト
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return adminDenied();
  const [claude, stripe, youtube, hotpepper, estat] = await Promise.all([
    run("ANTHROPIC_API_KEY", !!process.env.ANTHROPIC_API_KEY, testClaude),
    run("STRIPE_SECRET_KEY", !!process.env.STRIPE_SECRET_KEY, testStripe),
    run("YOUTUBE_API_KEY", youtubeEnabled(), testYouTube),
    run("HOTPEPPER_API_KEY", hotpepperEnabled(), testHotPepper),
    run("ESTAT_APP_ID", estatEnabled(), testEstat),
  ]);
  return NextResponse.json({ claude, stripe, youtube, hotpepper, estat });
}
