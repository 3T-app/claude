import { NextResponse } from "next/server";
import { errorResponse, getUid } from "@/lib/http";
import { confirmAndAnswer, getQuestion, QuestionError, toPublic } from "@/lib/questions";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

function fail(err: unknown) {
  if (err instanceof QuestionError) return NextResponse.json({ error: err.message }, { status: err.status });
  return errorResponse(err);
}

/** 質問を1件読む（支払いをやめて戻ったとき、入力欄に質問を戻すため） */
export async function GET(_req: Request, { params }: Params) {
  try {
    return NextResponse.json({ question: toPublic(await getQuestion(await getUid(), (await params).id)) });
  } catch (err) {
    return fail(err);
  }
}

/** 支払いを確かめて回答する（回答済みならそのまま返す） */
export async function POST(_req: Request, { params }: Params) {
  try {
    return NextResponse.json({ question: toPublic(await confirmAndAnswer(await getUid(), (await params).id)) });
  } catch (err) {
    return fail(err);
  }
}
