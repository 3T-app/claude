import { NextResponse } from "next/server";
import { QUESTION_PRICE_YEN } from "@/lib/constants";
import { errorResponse, getUid } from "@/lib/http";
import { paymentMode } from "@/lib/payments";
import { createQuestion, listQuestions, QuestionError, type QuestionKind } from "@/lib/questions";

export const maxDuration = 60;

function kindOf(v: unknown): QuestionKind | null {
  return v === "lecture" || v === "diagnosis" ? v : null;
}

/** その人がこの街・この立地調査で聞いた質問と回答 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = kindOf(url.searchParams.get("kind"));
  const target = url.searchParams.get("target") ?? "";
  if (!kind || !target) return NextResponse.json({ error: "対象を指定してください。" }, { status: 400 });
  return NextResponse.json({
    questions: await listQuestions(await getUid(), kind, target),
    price: QUESTION_PRICE_YEN,
    payment: paymentMode(),
  });
}

/** 質問を保存して、支払い画面のURL（テスト決済なら null）を返す */
export async function POST(req: Request) {
  const body = (await req.json()) as { kind?: string; target?: string; question?: string; returnPath?: string };
  const kind = kindOf(body.kind);
  const question = body.question?.trim().slice(0, 500) ?? "";
  const returnPath = body.returnPath ?? "";
  if (!kind || !body.target) return NextResponse.json({ error: "対象を指定してください。" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "質問を入力してください。" }, { status: 400 });
  // 戻り先は同じサイトの中だけ
  if (!returnPath.startsWith("/") || returnPath.startsWith("//")) {
    return NextResponse.json({ error: "戻り先が正しくありません。" }, { status: 400 });
  }
  try {
    const result = await createQuestion({
      uid: await getUid(),
      kind,
      target: body.target.slice(0, 80),
      question,
      origin: new URL(req.url).origin,
      returnPath,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof QuestionError) return NextResponse.json({ error: err.message }, { status: err.status });
    return errorResponse(err);
  }
}
