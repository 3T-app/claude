import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { diagnose } from "@/lib/features";
import { errorResponse, getUid } from "@/lib/http";
import { GENRES } from "@/lib/constants";
import { readDB, updateDB } from "@/lib/store";

export const maxDuration = 300;

const KEEP_DIAGNOSES = 300;

export async function POST(req: Request) {
  const { name, address, genre } = (await req.json()) as { name?: string; address?: string; genre?: string };
  if (!name?.trim() || !address?.trim()) {
    return NextResponse.json({ error: "店名と住所を入力してください。" }, { status: 400 });
  }
  const g = GENRES.includes(genre as (typeof GENRES)[number]) ? genre! : "その他";
  const input = { name: name.trim().slice(0, 60), address: address.trim().slice(0, 120), genre: g };
  try {
    const result = await diagnose(input);
    // AIへの質問（支払いの画面から戻ったあと）で結果を表示し直せるように保存する
    const id = randomUUID();
    const uid = await getUid();
    await updateDB((d) => {
      d.diagnoses[id] = { uid, input, result, createdAt: new Date().toISOString() };
      const old = Object.entries(d.diagnoses).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt));
      for (const [k] of old.slice(KEEP_DIAGNOSES)) delete d.diagnoses[k];
    });
    return NextResponse.json({ ...result, id, input });
  } catch (err) {
    return errorResponse(err);
  }
}

/** 保存した立地調査の結果を読む（本人のものだけ） */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const d = (await readDB()).diagnoses[id];
  if (!d || d.uid !== (await getUid())) {
    return NextResponse.json({ error: "立地調査の結果が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json({ ...(d.result as object), id, input: d.input });
}
