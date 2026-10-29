import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/features";
import { errorResponse, getUid } from "@/lib/http";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    areaKey?: string;
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!body.areaKey || !body.question?.trim()) {
    return NextResponse.json({ error: "質問を入力してください。" }, { status: 400 });
  }
  try {
    const result = await answerQuestion({
      uid: await getUid(),
      areaKey: body.areaKey,
      question: body.question.trim(),
      history: (body.history ?? []).filter((m) => m.role === "user" || m.role === "assistant"),
    });
    if ("paywall" in result) {
      return NextResponse.json({ paywall: true, error: "無料の質問は使い切りました。" }, { status: 402 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
